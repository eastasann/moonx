import { treaty } from "@elysiajs/eden";
import type { App } from "@moonx/api";
import { ApiError, fromEnvelope } from "./api-error";

let client: ReturnType<typeof treaty<App>> | undefined;

/** The Eden Treaty client for `/api/v1` (ADR-006). Created on first use because it needs the page's origin. */
export function api() {
  client ??= treaty<App>(window.location.origin, {
    headers: { "X-Moonx-Client": "web" },
    // A wrapper, not `fetch` itself, so a replaced `globalThis.fetch` (tests) is honoured.
    fetcher: ((input: RequestInfo | URL, init?: RequestInit) =>
      globalThis.fetch(input, { ...init, credentials: "same-origin" })) as typeof fetch,
  });
  return client;
}

interface TreatyResult<Data> {
  data: Data | null;
  error: { status: number | unknown; value: unknown } | null;
  status: number;
}

/**
 * Awaits a Treaty call and returns its data, or throws an {@link ApiError}. A call that got no
 * answer at all (offline, the server down) throws `NETWORK`.
 */
export async function call<Data>(request: Promise<TreatyResult<Data>>): Promise<Data> {
  let result: TreatyResult<Data>;
  try {
    result = await request;
  } catch (error) {
    throw new ApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
  }
  if (result.error) throw fromEnvelope(result.status, result.error.value);
  return result.data as Data;
}

/** How long `sendJson` waits for an answer. */
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Sends a JSON request with `fetch` and returns the parsed answer (null for an empty one), or
 * throws an {@link ApiError}. For requests that are described as data, such as the saves of the
 * pending queue (ADR-021), which a Treaty call cannot express, and for reads whose text must
 * arrive untouched: Treaty turns any string that looks like a date into a `Date`, which would
 * change an exported `exportedAt` or an answer that is a date.
 */
export async function sendJson<Data = unknown>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Data> {
  let response: Response;
  try {
    response = await globalThis.fetch(path, {
      method,
      credentials: "same-origin",
      headers:
        method === "GET"
          ? { "X-Moonx-Client": "web" }
          : { "content-type": "application/json", "X-Moonx-Client": "web" },
      body: method === "GET" ? undefined : JSON.stringify(body),
      // A request that never answers must end: it holds the item's lock and the logout flush.
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
  }
  const text = await response.text().catch(() => "");
  let parsed: unknown = null;
  try {
    parsed = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    // A gateway's HTML error page: `fromEnvelope` reads a body without an envelope as UNKNOWN or 5xx.
  }
  if (!response.ok) throw fromEnvelope(response.status, parsed);
  return parsed as Data;
}

/**
 * POST for the one route Treaty cannot reach: `/me/delete`, whose last segment is also the name
 * of an HTTP method, which Treaty reads as a method call.
 */
export async function postJson(path: string, body: unknown): Promise<void> {
  await sendJson("POST", path, body);
}
