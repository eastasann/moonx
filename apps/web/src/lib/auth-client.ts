import { createAuthClient } from "better-auth/client";
import { ApiError, fromAuthError } from "./api-error";

let client: ReturnType<typeof createAuthClient> | undefined;

/** The Better Auth client for `/api/auth`. Created on first use because it needs the page's origin. */
export function authClient() {
  client ??= createAuthClient({
    baseURL: window.location.origin,
    fetchOptions: { customFetchImpl: (input, init) => globalThis.fetch(input, init) },
  });
  return client;
}

interface AuthResult<Data> {
  data: Data | null;
  error: { status?: number; code?: string; message?: string } | null;
}

/** Awaits a Better Auth call and returns its data, or throws an {@link ApiError}. */
export async function authCall<Data>(request: Promise<AuthResult<Data>>): Promise<Data> {
  let result: AuthResult<Data>;
  try {
    result = await request;
  } catch (error) {
    throw new ApiError("NETWORK", 0, error instanceof Error ? error.message : "Network error");
  }
  if (result.error) throw fromAuthError(result.error);
  return result.data as Data;
}
