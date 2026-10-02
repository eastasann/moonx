import { ERROR_CODES, type ErrorCode } from "@moonx/schemas";

/**
 * Codes the client adds to the API's: `NETWORK` when no answer came back, `INVALID_CREDENTIALS`
 * and `INVALID_TOKEN` for Better Auth answers that have no API code, `UNKNOWN` for anything else.
 */
export type ClientErrorCode =
  | ErrorCode
  | "INVITATION_REQUIRED"
  | "ACCOUNT_SUSPENDED"
  | "NETWORK"
  | "INVALID_CREDENTIALS"
  | "INVALID_TOKEN"
  | "UNKNOWN";

export interface ValidationDetail {
  path: string;
  code: string;
  message: string;
}

/** A failed API or Better Auth call, in the shape SDD 8.1 gives every error. */
export class ApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    message: string,
    readonly requestId: string | null = null,
    readonly details: ValidationDetail[] = [],
    /** The code-specific fields of the envelope: `invitedEmail`, `workspaces`, `retryAfterSeconds` ... */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const KNOWN_CODES = new Set<string>(ERROR_CODES);

/** Reads the `{ error }` envelope of an API response body; anything else becomes `UNKNOWN`. */
export function fromEnvelope(status: number, value: unknown): ApiError {
  const error = (value as { error?: Record<string, unknown> } | null)?.error;
  if (error && typeof error.code === "string") {
    const { code, message, requestId, details, ...extra } = error;
    return new ApiError(
      KNOWN_CODES.has(code) ? (code as ErrorCode) : "UNKNOWN",
      status,
      typeof message === "string" ? message : code,
      typeof requestId === "string" ? requestId : null,
      Array.isArray(details) ? (details as ValidationDetail[]) : [],
      extra,
    );
  }
  return new ApiError(
    status >= 500 ? "UPSTREAM_UNAVAILABLE" : "UNKNOWN",
    status,
    "Unreadable error",
  );
}

/**
 * The code Better Auth sends for a wrong email or password, and for a bad or used reset token.
 * Everything else it sends is one of the codes the hooks set (SDD 5.4) or unexpected.
 */
export function fromAuthError(error: {
  status?: number;
  code?: string;
  message?: string;
}): ApiError {
  const status = error.status ?? 0;
  switch (error.code) {
    case "INVALID_EMAIL_OR_PASSWORD":
      return new ApiError("INVALID_CREDENTIALS", status, error.message ?? "Invalid credentials");
    case "INVALID_TOKEN":
      return new ApiError("INVALID_TOKEN", status, error.message ?? "Invalid token");
    case "INVALID_PASSWORD":
      return new ApiError("INVALID_PASSWORD", status, error.message ?? "Invalid password");
    case "INVITATION_REQUIRED":
    case "ACCOUNT_SUSPENDED":
      return new ApiError(error.code, status, error.message ?? error.code);
  }
  if (status === 429) return new ApiError("RATE_LIMITED", status, error.message ?? "Rate limited");
  if (status === 0 || status >= 500) {
    return new ApiError("UPSTREAM_UNAVAILABLE", status, error.message ?? "Unavailable");
  }
  return new ApiError("UNKNOWN", status, error.message ?? "Unknown error");
}

export const isApiError = (error: unknown): error is ApiError => error instanceof ApiError;

/** Whether the error means the session is gone (SDD 8.2: go to the login screen). */
export const isUnauthenticated = (error: unknown) =>
  isApiError(error) && error.code === "UNAUTHENTICATED";
