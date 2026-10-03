import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import type { ZodError } from "zod";
import { MAX_BODY_BYTES, MAX_JSON_BYTES } from "./config";
import type { AppContext } from "./context";
import { ApiError, type ValidationDetail } from "./errors";
import { isAppTooOld, parseClient } from "./lib/client";
import { parentRowGone, reportable } from "./lib/error-report";
import { createFailureWatch } from "./lib/failure-watch";
import { AUTH_SECRET_PATHS, enforceRateLimit } from "./lib/rate-limit";
import { clientIp, requestInfo, setRequestInfo } from "./lib/request-info";
import { captureServerError } from "./observability";

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function secretMatches(given: string | null, accepted: string[]): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  return accepted.some((secret) => {
    const b = Buffer.from(secret);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

/** Paths the Worker's shared secret does not guard (SDD 2 通信フロー 3). */
const isOpenPath = (path: string) => path === "/api/health";

const isPhotoUpload = (method: string, path: string) =>
  method === "PUT" && path === "/api/v1/me/avatar";

/** The 4xx status of an Elysia error that has no code of its own here (bad file type, cookie signature). */
function clientErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && status >= 400 && status < 500 ? status : null;
}

/**
 * The `details` of a 422 (SDD 8.1). Elysia's own report has no Zod issue codes and stops at one
 * code, so the failing value is validated again with the same schema to get `{ path, code }` for
 * every issue. The offending value itself is never copied into the answer.
 */
function detailsOf(error: unknown): ValidationDetail[] {
  const failure = error as {
    validator?: { schema?: { safeParse?: (value: unknown) => { error?: ZodError } } };
    value?: unknown;
    all?: { path?: string; message?: string }[];
    message?: string;
  };
  const issues = failure.validator?.schema?.safeParse?.(failure.value)?.error?.issues;
  if (issues && issues.length > 0) {
    return issues.map((issue) => ({
      path: issue.path.join("."),
      code: issue.code,
      message: issue.message,
    }));
  }
  const fallback = (failure.all ?? []).map((item) => ({
    path: (item.path ?? "").replace(/^\//, "").replaceAll("/", "."),
    code: "invalid",
    message: item.message ?? "Invalid value",
  }));
  return fallback.length > 0
    ? fallback
    : [{ path: "", code: "invalid", message: failure.message ?? "Invalid value" }];
}

/**
 * The request pipeline every route shares: request id, `no-store`, the Worker's shared secret,
 * CSRF rules (SDD 7.2), the 426 gate for old mobile builds, the error envelope (SDD 8.1) and the
 * one-line JSON access log (ADR-023). It must be `.use`d before any route.
 */
export function basePlugin(ctx: AppContext) {
  const { config, logger } = ctx;
  const failures = createFailureWatch();
  return (
    new Elysia({ name: "moonx-base" })
      .onRequest(async ({ request, set }) => {
        const url = new URL(request.url);
        const supplied = request.headers.get("x-request-id");
        const requestId =
          supplied && /^[\w.-]{8,128}$/.test(supplied) ? supplied : crypto.randomUUID();
        const client = parseClient(request.headers.get("x-moonx-client"));
        const appVersion = request.headers.get("x-moonx-app-version");
        setRequestInfo(request, {
          requestId,
          startedAt: performance.now(),
          userId: null,
          client,
          appVersion,
        });
        set.headers["x-request-id"] = requestId;
        set.headers["cache-control"] = "no-store";

        if (config.proxySecrets.length > 0 && !isOpenPath(url.pathname)) {
          if (!secretMatches(request.headers.get("x-moonx-proxy-secret"), config.proxySecrets)) {
            throw new ApiError("FORBIDDEN", "Direct access is not allowed");
          }
        }
        if (!url.pathname.startsWith("/api/v1")) {
          const length = Number(request.headers.get("content-length") ?? 0);
          if (url.pathname.startsWith("/api/auth/") && length > MAX_JSON_BYTES) {
            throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large");
          }
          // Better Auth only counts per path; SDD 7.2 wants one bucket per IP for these paths.
          if (request.method === "POST" && AUTH_SECRET_PATHS.has(url.pathname)) {
            await enforceRateLimit(ctx.db, "authSecret", clientIp(request), ctx.now().getTime());
          }
          return;
        }

        if (isAppTooOld(client, appVersion)) {
          throw new ApiError("APP_UPDATE_REQUIRED", "This app version is no longer supported");
        }
        if (STATE_CHANGING.has(request.method)) {
          const origin = request.headers.get("origin");
          if (origin && !config.trustedOrigins.includes(origin)) {
            throw new ApiError("FORBIDDEN", "Origin is not trusted");
          }
          // A cross-site form cannot send application/json without a preflight, so the type is
          // required even when the body is empty. Only the photo upload is multipart.
          const length = Number(request.headers.get("content-length") ?? 0);
          const type = (request.headers.get("content-type") ?? "").toLowerCase();
          const multipart = type.startsWith("multipart/form-data");
          if (
            multipart
              ? !isPhotoUpload(request.method, url.pathname)
              : !type.startsWith("application/json")
          ) {
            throw new ApiError("BAD_REQUEST", "Content-Type must be application/json");
          }
          if (length > (multipart ? MAX_BODY_BYTES : MAX_JSON_BYTES)) {
            throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large");
          }
        }
      })
      // Chunked bodies carry no Content-Length, so the JSON limit is also enforced on what was read.
      .onParse({ as: "global" }, async ({ request, contentType }) => {
        // Better Auth parses its own bodies: hand it the raw text, `authRoutes` rebuilds the request.
        if (new URL(request.url).pathname.startsWith("/api/auth/")) {
          const text = await request.text();
          if (Buffer.byteLength(text) > MAX_JSON_BYTES) {
            throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large");
          }
          return text;
        }
        if (!contentType?.startsWith("application/json")) return;
        const text = await request.text();
        if (Buffer.byteLength(text) > MAX_JSON_BYTES) {
          throw new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large");
        }
        if (text.trim() === "") return {};
        try {
          return JSON.parse(text);
        } catch {
          throw new ApiError("BAD_REQUEST", "The body is not valid JSON");
        }
      })
      .onError({ as: "global" }, ({ code, error, request, set }) => {
        const info = requestInfo(request);
        let api: ApiError;
        // Elysia wraps what a parser throws in a ParseError and keeps the original as its cause.
        const cause = (error as { cause?: unknown }).cause;
        if (error instanceof ApiError) api = error;
        else if (code === "PARSE" && cause instanceof ApiError) api = cause;
        else if (code === "VALIDATION" && (error as { type?: string }).type !== "response") {
          const details = detailsOf(error);
          const first = details[0];
          api = new ApiError("VALIDATION_FAILED", `${first?.path || "body"}: ${first?.message}`, {
            details,
          });
        } else if (code === "PARSE")
          api = new ApiError("BAD_REQUEST", "The body is not valid JSON");
        else if (code === "NOT_FOUND") api = new ApiError("NOT_FOUND", "No such route");
        else if (code === "VALIDATION") {
          // Only a response can reach this branch: it does not match its schema, a bug of ours.
          api = new ApiError("INTERNAL", "Internal error");
        } else if (parentRowGone(error)) {
          api = new ApiError("NOT_FOUND", "Resource not found");
        } else if (clientErrorStatus(error) === 413) {
          api = new ApiError("PAYLOAD_TOO_LARGE", "The request body is too large");
        } else if (clientErrorStatus(error) === 422) {
          api = new ApiError("VALIDATION_FAILED", "The request was refused");
        } else if (clientErrorStatus(error) != null) {
          api = new ApiError("BAD_REQUEST", "The request could not be read");
        } else {
          api = new ApiError("INTERNAL", "Internal error");
        }
        if (api.status >= 500) {
          const { name, message, code: pgCode, constraint, stack } = reportable(error);
          logger.log("error", "request failed", {
            requestId: info.requestId,
            userId: info.userId,
            errorCode: api.code,
            errorName: name,
            errorMessage: message,
            pgCode,
            constraint,
            stack,
          });
          captureServerError(error, info);
        }
        set.status = api.status;
        set.headers["content-type"] = "application/json";
        // SDD 8.1: `/api/auth/*` keeps Better Auth's flat body and its retry header, so one client
        // adapter (SDD 5.4) reads both what Better Auth and this pipeline refuse.
        if (new URL(request.url).pathname.startsWith("/api/auth/")) {
          const retryAfter = api.extra?.retryAfterSeconds;
          if (api.status === 429 && typeof retryAfter === "number") {
            set.headers["x-retry-after"] = String(retryAfter);
          }
          return { code: api.code, message: api.message };
        }
        return {
          error: { code: api.code, message: api.message, requestId: info.requestId, ...api.extra },
        };
      })
      .onAfterResponse({ as: "global" }, ({ request, response, set, route }) => {
        const info = requestInfo(request);
        // Better Auth answers with its own Response, which never goes through `set.status`.
        const status =
          response instanceof Response
            ? response.status
            : typeof set.status === "number"
              ? set.status
              : 200;
        const burst =
          (status === 401 || status === 403) &&
          failures.record(clientIp(request), ctx.now().getTime());
        const level = status >= 500 ? "error" : burst ? "warn" : "info";
        logger.log(level, "request", {
          requestId: info.requestId,
          userId: info.userId,
          route: `${request.method} ${route ?? new URL(request.url).pathname}`,
          status,
          latencyMs: Math.round(performance.now() - info.startedAt),
          client: info.client,
          appVersion: info.appVersion,
        });
      })
  );
}
