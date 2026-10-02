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

/**
 * POST for the one route Treaty cannot reach: `/me/delete`, whose last segment is also the name
 * of an HTTP method, which Treaty reads as a method call.
 */
export async function postJson(path: string, body: unknown): Promise<void> {
  let response: Response;
  try {
    response = await globalThis.fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "X-Moonx-Client": "web" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
  }
  if (!response.ok) {
    throw fromEnvelope(response.status, await response.json().catch(() => null));
  }
}
