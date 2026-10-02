import { ERROR_STATUS, type ErrorCode } from "@moonx/schemas";

/**
 * An error the API answers with the `{ error }` envelope of SDD 8.1. `extra` carries the
 * per-code fields (`current`, `conflicts`, `latest`, `retryAfterSeconds`, ...).
 */
export class ApiError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message ?? code);
    this.status = ERROR_STATUS[code];
  }
}

/** One entry of `error.details` in a 422: the field path, the Zod issue code and a developer message. */
export interface ValidationDetail {
  path: string;
  code: string;
  message: string;
}

/** A 422 VALIDATION_FAILED for checks that Zod cannot express (cross-field rules in a handler). */
export function validationFailed(details: ValidationDetail[]): ApiError {
  const first = details[0];
  return new ApiError(
    "VALIDATION_FAILED",
    first ? `${first.path || "body"}: ${first.message}` : "Validation failed",
    { details },
  );
}
