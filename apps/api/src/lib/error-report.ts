import { DrizzleQueryError } from "drizzle-orm/errors";

/**
 * What may be written to the log or sent to Sentry about an unexpected error. Drizzle puts the SQL
 * and its parameters into the message of a failed query, which would copy answers, reasons and
 * e-mail addresses into the logs (SDD 7.2), so a database error is reduced to its class and the
 * Postgres code of its cause; the stack keeps only its frames.
 */
export interface ErrorReport {
  name: string;
  message: string;
  /** SQLSTATE of a database error, e.g. `23505`. */
  code?: string;
  constraint?: string;
  stack?: string;
}

/** The stack frames only: a multi-line message (the SQL and its parameters) sits above them. */
const frames = (stack: string | undefined) =>
  stack
    ?.split("\n")
    .filter((line) => /^\s+at /.test(line))
    .join("\n");

const isDatabaseError = (error: Error) => error instanceof DrizzleQueryError;

/** Elysia's validation error carries the offending value in its message (`found`). */
const isValidationError = (error: Error) => (error as { code?: string }).code === "VALIDATION";

export function reportable(error: unknown): ErrorReport {
  if (!(error instanceof Error))
    return { name: "NonError", message: "A non-error value was thrown" };
  if (isValidationError(error)) {
    return {
      name: error.name,
      message: "A response failed its schema",
      stack: frames(error.stack),
    };
  }
  if (!isDatabaseError(error)) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  const cause = error.cause as { code?: string; constraint_name?: string } | undefined;
  return {
    name: error.name,
    message: "A database query failed",
    code: cause?.code,
    constraint: cause?.constraint_name,
    stack: frames(error.stack),
  };
}

/** An error that is safe to hand to Sentry: the original, or a query-free stand-in for a database error. */
export function sentrySafe(error: unknown): unknown {
  if (!(error instanceof Error) || !(isDatabaseError(error) || isValidationError(error))) {
    return error;
  }
  const report = reportable(error);
  const safe = new Error(`${report.message} (${report.code ?? "no code"})`);
  safe.name = error.name;
  safe.stack = `${safe.name}: ${safe.message}\n${report.stack ?? ""}`;
  return safe;
}
