import * as Sentry from "@sentry/bun";
import type { AppConfig } from "./config";
import { sentrySafe } from "./lib/error-report";

let enabled = false;

/**
 * Starts Sentry when a DSN is configured. `dataCollection` is switched off everywhere (the v11
 * replacement of `sendDefaultPii: false`), so request bodies, cookies and e-mail addresses stay
 * out of events (SDD 7.2). The user id set by {@link captureServerError} is the only identity.
 */
export function initSentry(config: AppConfig): void {
  if (!config.sentryDsn) return;
  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    release: config.version,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
    },
  });
  enabled = true;
}

/** Reports an unexpected (5xx) error with the ids that link it to the logs. */
export function captureServerError(
  error: unknown,
  tags: { requestId: string; userId: string | null },
) {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    scope.setTag("requestId", tags.requestId);
    if (tags.userId) scope.setUser({ id: tags.userId });
    Sentry.captureException(sentrySafe(error));
  });
}
