import type { clientKind } from "@moonx/db";
import type { ErrorDetail } from "@moonx/schemas";
import { Elysia, ValidationError } from "elysia";
import {
  checkBodyWithin,
  checkDeclaredLength,
  JSON_BODY_MAX_BYTES,
  parseJsonBody,
} from "./body";
import { callerIp, ipSubject } from "./client-ip";
import type { Config, LogLevel } from "./config";
import { ApiError, describeFailure, standardIssueDetails } from "./errors";
import type { Logger } from "./log";
import type { Limit, RateLimiter } from "./rate-limit";
import { securityHeaders } from "./security-headers";
import type { ErrorReporter } from "./sentry";

/** The `X-Moonx-Client` values the API records (SDD 5.1「クライアントの種類」). */
export type ClientKind = (typeof clientKind.enumValues)[number];

/** What the entry plugin decided about a request, once, before anything else ran. */
export interface RequestContext {
  /** Made here; a client's `X-Request-Id` is ignored (SDD 8.3). */
  readonly requestId: string;
  /** SDD 7.2「呼び出し元の IP」. Undefined only without a connection (`app.handle`). */
  readonly clientIp: string | undefined;
  readonly client: ClientKind;
  /** Set by authentication once it knows the caller; logged and sent to Sentry. */
  userId: string | null;
}

interface RequestState extends RequestContext {
  /** The path Elysia routes by, which every check here uses too. */
  readonly path: string;
  readonly startedAt: number;
  /** The status of an error response, which Elysia's `set.status` does not always hold. */
  status?: number;
}

// Keyed by the request object, which Elysia passes unchanged through every hook.
const states = new WeakMap<Request, RequestState>();

/**
 * The entry plugin's decisions for `request`.
 *
 * @throws when the request did not pass through {@link entryPlugin}.
 */
export function requestContext(request: Request): RequestContext {
  const state = states.get(request);
  if (state === undefined) {
    throw new Error("The request did not pass through the entry plugin");
  }
  return state;
}

const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const AVATAR_PATH = "/api/v1/me/avatar";
const DENIALS_BEFORE_WARN = 10;
const DENIAL_WINDOW_MS = 60_000;

function mediaType(header: string | null): string {
  return (header ?? "").split(";")[0]?.trim().toLowerCase() ?? "";
}

function clientKindOf(header: string | null): ClientKind {
  return header === "web" || header === "web_mobile" ? header : "unknown";
}

/**
 * The CSRF rules of SDD 7.2 for a state-changing `/api/v1` request: a present `Origin`
 * must be trusted, and the body must be JSON (multipart only for the avatar upload, U3),
 * bodyless requests included. JSON's declared length is checked here, before any parser
 * runs; the bytes actually read are checked by {@link parseJsonBody}.
 *
 * @throws {ApiError} FORBIDDEN, BAD_REQUEST or PAYLOAD_TOO_LARGE
 */
function checkStateChange(
  request: Request,
  pathname: string,
  trustedOrigins: readonly string[],
): void {
  const origin = request.headers.get("origin");
  if (origin !== null && !trustedOrigins.includes(origin)) {
    throw new ApiError("FORBIDDEN", "The Origin header is not trusted");
  }
  const expected =
    request.method === "PUT" && pathname.replace(/\/$/, "") === AVATAR_PATH
      ? "multipart/form-data"
      : "application/json";
  if (mediaType(request.headers.get("content-type")) !== expected) {
    throw new ApiError("BAD_REQUEST", `Content-Type must be ${expected}`);
  }
  if (expected === "application/json") {
    checkDeclaredLength(request, JSON_BODY_MAX_BYTES);
  }
}

/**
 * Tells whether an IP has had more than {@link DENIALS_BEFORE_WARN} 401 or 403 responses
 * in the last minute, this one included. Counted on this instance only: the answer
 * picks a log level and nothing else, so instances need not agree (SDD 8.3).
 */
function createDenialCounter(now: () => number): (ip: string) => boolean {
  // Only "more than 10 in the last minute" matters, so each IP keeps at most the 11
  // latest times.
  const recent = new Map<string, number[]>();
  let lastSweep = now();
  return (ip) => {
    const at = now();
    const cutoff = at - DENIAL_WINDOW_MS;
    if (at - lastSweep >= DENIAL_WINDOW_MS) {
      for (const [key, times] of recent) {
        if ((times.at(-1) ?? 0) <= cutoff) recent.delete(key);
      }
      lastSweep = at;
    }
    const times = (recent.get(ip) ?? []).filter((time) => time > cutoff);
    times.push(at);
    if (times.length > DENIALS_BEFORE_WARN + 1) times.shift();
    recent.set(ip, times);
    return times.length > DENIALS_BEFORE_WARN;
  };
}

async function validationDetails(
  error: ValidationError,
): Promise<ErrorDetail[]> {
  // Elysia keeps only the first issue of a Standard Schema (Zod) failure, and its `all`
  // drops each issue's code, so the schema runs again for every issue with its code.
  const validator = error.validator as
    | { "~standard"?: unknown; schema?: { "~standard"?: unknown } }
    | undefined;
  const standard =
    validator?.["~standard"] !== undefined
      ? validator
      : validator?.schema?.["~standard"] !== undefined
        ? validator.schema
        : undefined;
  if (standard !== undefined) {
    const result = await (
      standard as {
        "~standard": {
          validate(value: unknown): unknown;
        };
      }
    )["~standard"].validate(error.value);
    const { issues } = result as {
      issues?: Parameters<typeof standardIssueDetails>[0];
    };
    return standardIssueDetails(issues ?? []);
  }
  // A TypeBox schema: its paths are JSON pointers such as `/items/0/name`.
  return error.all.map((issue) => ({
    path:
      "path" in issue && typeof issue.path === "string"
        ? issue.path.replace(/^\//, "").replaceAll("/", ".")
        : "",
    code: "custom",
    message: issue.message ?? issue.summary ?? "Invalid value",
  }));
}

/**
 * The 8.1 error for a thrown value. Anything not recognised becomes INTERNAL, which
 * keeps the original as its cause for the failure log and Sentry, never for the caller.
 */
async function toApiError(code: unknown, error: unknown): Promise<ApiError> {
  if (error instanceof ApiError) return error;
  // A response failing its own schema is the API's bug, not the caller's input.
  if (error instanceof ValidationError && error.type !== "response") {
    const details = await validationDetails(error);
    const first = details[0];
    return new ApiError(
      "VALIDATION_FAILED",
      `Invalid ${error.type}${first === undefined ? "" : `: ${first.path === "" ? "" : `${first.path} `}${first.message}`}`,
      { details },
    );
  }
  if (code === "NOT_FOUND") {
    return new ApiError("NOT_FOUND", "No route matches the request");
  }
  if (code === "PARSE") {
    // Elysia wraps whatever a parser throws, so the 413 and 400 of parseJsonBody
    // arrive as the cause.
    if (error instanceof Error && error.cause instanceof ApiError) {
      return error.cause;
    }
    return new ApiError("BAD_REQUEST", "The request body could not be parsed");
  }
  return new ApiError(
    "INTERNAL",
    "Internal error",
    {},
    { cause: error instanceof Error ? error : new Error(String(error)) },
  );
}

/** A path the entry plugin counts per IP (ADR-029 ②), and the limit it counts against. */
export interface IpLimit {
  method: string;
  /** An exact path, such as `/api/health/db`. Paths sharing a `limit.name` share a count. */
  path: string;
  limit: Limit;
}

// Elysia answers HEAD with the GET handler and routes a trailing slash to the same
// handler, so neither may slip past a limit.
const limitKey = (method: string, pathname: string) =>
  `${method === "HEAD" ? "GET" : method} ${pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname}`;

const routeOf = (request: Request, route: string | undefined) =>
  route === undefined || route === "" ? null : `${request.method} ${route}`;

export interface EntryOptions {
  config: Pick<Config, "appEnv" | "trustedOrigins">;
  log: Logger;
  reporter: ErrorReporter;
  limiter: RateLimiter;
  ipLimits: readonly IpLimit[];
  now?: () => number;
}

/**
 * The entry plugin of ADR-029 ②, which every request passes through before anything
 * else: it fixes the caller's IP and the request ID, adds the headers every response
 * carries (security headers of 7.2, `Cache-Control: no-store` of 5.1, `X-Request-Id`),
 * counts the paths limited per IP, enforces the CSRF and body-size rules of 7.2,
 * shapes every error as in 8.1, and writes the access log and the failure log of 8.3.
 * Install it before any route.
 */
export function entryPlugin({
  config,
  log,
  reporter,
  limiter,
  ipLimits,
  now = Date.now,
}: EntryOptions) {
  const isFlooding = createDenialCounter(now);
  const limits = new Map(
    ipLimits.map((entry) => [limitKey(entry.method, entry.path), entry.limit]),
  );
  const headers = {
    "cache-control": "no-store",
    ...securityHeaders(config.appEnv),
  };

  return new Elysia()
    .onRequest(async (context) => {
      const { request, server, set } = context;
      // Elysia puts the path it routes by on every context, onRequest's included, though
      // its type for onRequest leaves it out. Checking anything else (say, a parsed
      // request.url) could check a different path than the one that runs, and parsing
      // throws on a malformed Host.
      const { path } = context as typeof context & { path: string };
      const state: RequestState = {
        path,
        requestId: crypto.randomUUID(),
        clientIp: callerIp(
          request.headers.get("x-forwarded-for"),
          server?.requestIP(request)?.address,
        ),
        client: clientKindOf(request.headers.get("x-moonx-client")),
        userId: null,
        startedAt: performance.now(),
      };
      states.set(request, state);
      Object.assign(set.headers, headers, { "x-request-id": state.requestId });

      const limit = limits.get(limitKey(request.method, path));
      if (limit !== undefined) {
        // The counts live in the database, so failing to count is the database's failure.
        const counted = await limiter
          .consume("ip", limit, ipSubject(state.clientIp ?? "unknown"))
          .catch((error: unknown) => {
            throw new ApiError(
              "UPSTREAM_UNAVAILABLE",
              "The database is unreachable",
              {},
              { cause: error },
            );
          });
        if (!counted.allowed) {
          throw new ApiError("RATE_LIMITED", "Too many requests from this IP", {
            retryAfterSeconds: counted.retryAfterSeconds,
          });
        }
      }
      if (path.startsWith("/api/auth/")) {
        await checkBodyWithin(request, JSON_BODY_MAX_BYTES);
      } else if (
        path.startsWith("/api/v1/") &&
        STATE_CHANGING.has(request.method)
      ) {
        checkStateChange(request, path, config.trustedOrigins);
      }
    })
    .onParse({ as: "global" }, ({ request, path }) => {
      // Only /api/v1 hands bodies to Elysia. Elsewhere the handler reads the request
      // itself (Better Auth on /api/auth/*), so the stream must stay unread; returning a
      // value also keeps Elysia 1.4 from failing on `parse: "none"` routes, which it
      // does when a global parser returns nothing.
      if (!path.startsWith("/api/v1/")) return null;
      if (
        mediaType(request.headers.get("content-type")) === "application/json"
      ) {
        return parseJsonBody(request);
      }
    })
    .onError(
      { as: "global" },
      async ({ code, error, request, set, route, path }) => {
        const state = states.get(request);
        const apiError = await toApiError(code, error);
        set.status = apiError.status;
        if (state !== undefined) state.status = apiError.status;
        const requestId = state?.requestId ?? crypto.randomUUID();

        if (apiError.status >= 500) {
          log.write("error", "request failed", {
            requestId,
            errorCode: apiError.code,
            ...describeFailure(apiError),
          });
          await reporter
            .report({
              error: apiError,
              requestId,
              route: routeOf(request, route),
              userId: state?.userId ?? null,
              method: request.method,
              url: request.url,
            })
            .catch((reportError: unknown) =>
              log.write("error", "sentry report failed", {
                requestId,
                ...describeFailure(reportError),
              }),
            );
        }

        // Better Auth's paths answer in Better Auth's shape, so the client reads one shape
        // there (8.1).
        if ((state?.path ?? path).startsWith("/api/auth/")) {
          const retryAfter = apiError.extra.retryAfterSeconds;
          if (
            apiError.code === "RATE_LIMITED" &&
            typeof retryAfter === "number"
          ) {
            set.headers["x-retry-after"] = String(retryAfter);
          }
          return { code: apiError.code, message: apiError.message };
        }
        return {
          error: {
            code: apiError.code,
            message: apiError.message,
            requestId,
            ...apiError.extra,
          },
        };
      },
    )
    .onAfterResponse(
      { as: "global" },
      ({ request, set, route, responseValue }) => {
        const state = states.get(request);
        if (state === undefined) return;
        const status =
          state.status ??
          (responseValue instanceof Response
            ? responseValue.status
            : typeof set.status === "number"
              ? set.status
              : 200);
        let level: LogLevel = status >= 500 ? "error" : "info";
        if (
          (status === 401 || status === 403) &&
          isFlooding(ipSubject(state.clientIp ?? "unknown"))
        ) {
          level = "warn";
        }
        log.write(level, "request", {
          requestId: state.requestId,
          userId: state.userId,
          route: routeOf(request, route),
          status,
          latencyMs: Math.round(performance.now() - state.startedAt),
          client: state.client,
          clientIp: state.clientIp ?? null,
        });
      },
    );
}
