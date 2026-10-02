import * as Sentry from "@sentry/react";

let started = false;

/** Starts Sentry once in the browser. Without a DSN (local) it stays off (SDD 11). */
export function initSentry() {
  if (started || typeof window === "undefined") return;
  started = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: import.meta.env.VITE_APP_ENV });
}

/** Reports an unexpected client error and returns the id the screen shows as `Ref`. */
export function captureClientError(error: unknown): string {
  return Sentry.captureException(error);
}
