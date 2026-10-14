import {
  dedupeIntegration,
  defaultStackParser,
  type ErrorEvent,
  makeFetchTransport,
  NodeClient,
  Scope,
} from "@sentry/bun";
import type { Config } from "./config";
import { reportableError } from "./errors";

/** A failed request (5xx) as it goes to Sentry (SDD 8.3, 11章). */
export interface FailureReport {
  error: unknown;
  requestId: string;
  /** `METHOD /pattern`, the same value as the access log's `route`. */
  route: string | null;
  userId: string | null;
  method: string;
  url: string;
}

export interface ErrorReporter {
  /**
   * Sends the failure and waits for it to leave, at most {@link FLUSH_TIMEOUT_MS}: Cloud
   * Run may stop the CPU once the response is out, which would strand a queued event.
   */
  report(failure: FailureReport): Promise<void>;
}

const FLUSH_TIMEOUT_MS = 2000;

type MakeTransport = ConstructorParameters<typeof NodeClient>[0]["transport"];

// Path segments that follow these hold a secret token: the Web's /invite/<token>, the
// API's /invitations/by-token/<token> (U4 to U6) and Better Auth's reset link.
const TOKEN_PARENTS = new Set(["invite", "by-token", "reset-password"]);

/**
 * The URL as an event may carry it (SDD 7.2「個人情報」): no query, no fragment, and
 * no invitation or password-reset token in the path.
 */
export function redactUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return "";
  }
  const segments = parsed.pathname.split("/");
  const path = segments
    .map((segment, i) =>
      i > 0 && TOKEN_PARENTS.has(segments[i - 1] ?? "") && segment !== ""
        ? "[redacted]"
        : segment,
    )
    .join("/");
  return `${parsed.origin}${path}`;
}

/**
 * The last step before an event leaves (`beforeSend`): keeps only the request's method
 * and redacted URL, only the user's id, and drops breadcrumbs, `extra` and the local
 * variables of stack frames (SDD 7.2「個人情報」). The client is also built not to
 * collect them; this holds even if an integration or a later change adds them.
 */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const { request, user, breadcrumbs: _, extra: __, ...rest } = event;
  const scrubbed: ErrorEvent = { ...rest };
  if (request !== undefined) {
    scrubbed.request = {
      method: request.method,
      ...(request.url === undefined ? {} : { url: redactUrl(request.url) }),
    };
  }
  if (user?.id !== undefined) scrubbed.user = { id: user.id };
  if (scrubbed.exception?.values !== undefined) {
    scrubbed.exception = {
      ...scrubbed.exception,
      values: scrubbed.exception.values.map((value) =>
        value.stacktrace?.frames === undefined
          ? value
          : {
              ...value,
              stacktrace: {
                ...value.stacktrace,
                frames: value.stacktrace.frames.map(
                  ({ vars: ___, ...frame }) => frame,
                ),
              },
            },
      ),
    };
  }
  return scrubbed;
}

/**
 * Reports 5xx failures to Sentry (`moonx-api`, ADR-023), or does nothing without a DSN.
 *
 * The client is owned here instead of `Sentry.init()`'s global one, and has no default
 * integrations: those would record breadcrumbs, request headers, cookies and bodies,
 * and database spans, which 7.2 forbids. The API sends only the 5xx it catches itself
 * (8.3), so the global handlers for uncaught errors are not needed either.
 *
 * @param transport Tests replace it to read the envelopes instead of sending them.
 */
export function createErrorReporter(
  config: Pick<Config, "sentryDsn" | "appEnv" | "appVersion">,
  transport: MakeTransport = makeFetchTransport,
): ErrorReporter {
  if (config.sentryDsn === undefined) return { report: async () => {} };
  const client = new NodeClient({
    dsn: config.sentryDsn,
    environment: config.appEnv,
    release: config.appVersion,
    transport,
    stackParser: defaultStackParser,
    integrations: [dedupeIntegration()],
    // Sentry 11 names what it may collect here; every category is off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      graphQL: { document: false, variables: false },
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
  });
  client.init();
  return {
    async report(failure) {
      const scope = new Scope();
      scope.setClient(client);
      scope.setTags({
        requestId: failure.requestId,
        route: failure.route ?? "unmatched",
      });
      if (failure.userId !== null) scope.setUser({ id: failure.userId });
      scope.addEventProcessor((event) => ({
        ...event,
        request: { method: failure.method, url: redactUrl(failure.url) },
      }));
      scope.captureException(reportableError(failure.error));
      await client.flush(FLUSH_TIMEOUT_MS);
    },
  };
}
