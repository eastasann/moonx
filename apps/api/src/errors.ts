import { type ErrorCode, type ErrorDetail, errorStatus } from "@moonx/schemas";
import { DrizzleQueryError } from "drizzle-orm";

/**
 * An error the API answers in the SDD 8.1 shape. Throw it from any hook or handler;
 * the entry plugin turns it into the response. `extra` holds the fields a code adds
 * (`current`, `retryAfterSeconds`, `details` and so on).
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly extra: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    message: string,
    extra: Record<string, unknown> = {},
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiError";
    this.code = code;
    this.status = errorStatus[code];
    this.extra = extra;
  }
}

/**
 * Whether `error`, or an error it was caused by, is PostgreSQL's unique violation on
 * `constraint`: how a write learns it lost a race to create the same row, such as the
 * first save of a keyed item (SDD 5.1「同時編集」) or two sign-ups for one address.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const fields = current as { code?: unknown; constraint_name?: unknown };
    if (fields.code === "23505" && fields.constraint_name === constraint) {
      return true;
    }
    current = current.cause;
  }
  return false;
}

/**
 * Whether `error`, or an error it was caused by, is PostgreSQL's `lock_not_available`:
 * a `NOWAIT` lock found the row held by another transaction.
 */
export function isLockNotAvailable(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    if ((current as { code?: unknown }).code === "55P03") return true;
    current = current.cause;
  }
  return false;
}

interface StandardIssue {
  readonly message: string;
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[];
  readonly code?: unknown;
}

/**
 * The `details` of SDD 8.1 for failed Standard Schema issues. Zod issues carry their
 * `code`; the input value is never copied.
 */
export function standardIssueDetails(
  issues: readonly StandardIssue[],
): ErrorDetail[] {
  return issues.map((issue) => ({
    path: (issue.path ?? [])
      .map((segment) =>
        String(typeof segment === "object" ? segment.key : segment),
      )
      .join("."),
    code: typeof issue.code === "string" ? issue.code : "custom",
    message: issue.message,
  }));
}

/** A thrown value as the "request failed" log line describes it (SDD 8.3). */
export interface ErrorDescription {
  errorName: string;
  errorMessage?: string;
  stack?: string;
  pgCode?: string;
  constraint?: string;
}

interface PostgresErrorLike extends Error {
  code: string;
  constraint_name?: string;
}

const isPostgresError = (error: unknown): error is PostgresErrorLike =>
  error instanceof Error &&
  error.name === "PostgresError" &&
  typeof (error as { code?: unknown }).code === "string";

/**
 * The stack's frames without the leading `name: message`. The message is cut off by its
 * length, not by line: a PostgreSQL message quotes the input, which may hold newlines
 * and lines that look like frames. A stack in another shape gives no frames at all.
 */
function framesOf(error: Error): string | undefined {
  const header = `${error.name}: ${error.message}`;
  const stack = error.stack ?? "";
  if (!stack.startsWith(header)) return undefined;
  return (
    stack
      .slice(header.length)
      .split("\n")
      .filter((line) => /^\s+at /.test(line))
      .join("\n") || undefined
  );
}

/**
 * The error a failed request is described and reported by: an {@link ApiError} with a
 * cause stands for that cause, and a Drizzle query error for the driver's error, since
 * Drizzle's message holds the SQL and its parameters.
 */
function rootFailure(error: unknown): unknown {
  let current = error;
  while (
    (current instanceof ApiError || current instanceof DrizzleQueryError) &&
    current.cause !== undefined
  ) {
    current = current.cause;
  }
  return current;
}

/**
 * Describes a failure for the log. A PostgreSQL error gives only its code and
 * constraint: its message and detail can hold the values of the query, which come
 * from user input (SDD 8.3). Connection errors carry only the host and port.
 */
export function describeFailure(error: unknown): ErrorDescription {
  const failure = rootFailure(error);
  if (isPostgresError(failure)) {
    return {
      errorName: failure.name,
      pgCode: failure.code,
      constraint: failure.constraint_name,
      stack: framesOf(failure),
    };
  }
  if (failure instanceof DrizzleQueryError) {
    // A query error without a driver error underneath: the message is the query.
    return { errorName: "DrizzleQueryError", stack: framesOf(failure) };
  }
  if (failure instanceof Error) {
    return {
      errorName: failure.name,
      errorMessage: failure.message,
      stack: failure.stack,
    };
  }
  return { errorName: typeof failure, errorMessage: String(failure) };
}

/**
 * The error to send to Sentry for a failure: the same as {@link describeFailure}
 * logs, so a PostgreSQL error loses its message and keeps its code and frames.
 */
export function reportableError(error: unknown): Error {
  const failure = rootFailure(error);
  if (isPostgresError(failure) || failure instanceof DrizzleQueryError) {
    const { errorName, pgCode, constraint, stack } = describeFailure(failure);
    const sanitized = new Error(
      pgCode === undefined
        ? "Database query failed"
        : `PostgreSQL error ${pgCode}${constraint === undefined ? "" : ` on ${constraint}`}`,
    );
    sanitized.name = errorName;
    sanitized.stack = `${errorName}: ${sanitized.message}\n${stack ?? ""}`;
    return sanitized;
  }
  return failure instanceof Error ? failure : new Error(String(failure));
}
