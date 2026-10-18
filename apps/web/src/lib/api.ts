import { treaty } from "@elysiajs/eden";
import type { App } from "@moonx/api";
import { type ErrorCode, errorCodeSchema } from "@moonx/schemas";

/**
 * A failed call to the API (SDD 8.1). `status` is null when no response came back (the
 * network failed); `code` is null when the response carried none.
 */
export class ApiError extends Error {
  readonly status: number | null;
  readonly code: ErrorCode | null;
  /** The request's id (SDD 8.3), shown as `Ref` for an unexpected error (8.2). */
  readonly requestId: string | null;
  /** The body's `error` object, with the fields some codes add (`current`, `details`…). */
  readonly detail: Readonly<Record<string, unknown>>;

  constructor(options: {
    status: number | null;
    code: ErrorCode | null;
    requestId: string | null;
    detail?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(
      options.status === null
        ? "The API could not be reached"
        : `The API answered ${options.status}${options.code === null ? "" : ` ${options.code}`}`,
      { cause: options.cause },
    );
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    this.requestId = options.requestId;
    this.detail = options.detail ?? {};
  }
}

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/**
 * The ApiError of a response that was not a success. A bare 502, 503 or 504 from the
 * front of Cloud Run, which carries no body of ours, is UPSTREAM_UNAVAILABLE (SDD 8.1).
 */
export function apiErrorOf(status: number, body: unknown): ApiError {
  const error = record(record(body)?.error);
  const code = errorCodeSchema.safeParse(error?.code);
  const requestId = error?.requestId;
  return new ApiError({
    status,
    code: code.success
      ? code.data
      : status === 502 || status === 503 || status === 504
        ? "UPSTREAM_UNAVAILABLE"
        : null,
    requestId: typeof requestId === "string" ? requestId : null,
    detail: error ?? {},
  });
}

function createClient() {
  return treaty<App>(window.location.origin, {
    // Dates stay the strings the API sends (SDD 5.1): Eden would otherwise turn any
    // string that looks like a date, a date-only due date or a typed answer included,
    // into a Date.
    parseDate: false,
    onRequest: (_path, init) => {
      // A body-less POST or DELETE carries the JSON type too: the API refuses a state
      // change of any other type (SDD 7.2 CSRF). Eden asks this before and after it
      // serialises a body; a request with a body gets its type from Eden (JSON, or
      // multipart for a file, whose boundary only the browser can write).
      const method = (init.method ?? "GET").toUpperCase();
      if (
        method !== "GET" &&
        method !== "HEAD" &&
        init.body == null &&
        !new Headers(init.headers).has("content-type")
      ) {
        return { headers: { "content-type": "application/json" } };
      }
    },
  });
}

let client: ReturnType<typeof createClient> | null = null;

/**
 * The typed client of the API (Eden Treaty, ADR-006), on the page's own origin (ADR-004).
 * Made on first use: the shell is prerendered where there is no window.
 */
export function api() {
  client ??= createClient();
  return client;
}

interface EdenResult {
  data: unknown;
  error: { status: unknown; value: unknown } | null;
  response: Response | undefined;
  status: number;
}

/**
 * The data of an Eden call, or its failure as an ApiError: Eden answers a failed fetch
 * with a 503 and no response, which is told apart here as the network.
 *
 * @throws {ApiError}
 */
export async function unwrap<R extends EdenResult>(
  pending: Promise<R>,
): Promise<Exclude<R["data"], null>> {
  const result = await pending;
  if (result.error === null) return result.data as Exclude<R["data"], null>;
  if (result.response === undefined) {
    throw new ApiError({
      status: null,
      code: null,
      requestId: null,
      cause: result.error.value,
    });
  }
  throw apiErrorOf(result.status, result.error.value);
}
