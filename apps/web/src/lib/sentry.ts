import {
  type BrowserOptions,
  captureException,
  dedupeIntegration,
  type ErrorEvent,
  eventFiltersIntegration,
  getClient,
  globalHandlersIntegration,
  init,
  linkedErrorsIntegration,
  setUser,
} from "@sentry/browser";
import type { WebEnv } from "./env";

// The path segment after these is a secret token: /invite/<token> (SDD 7.2「個人情報」).
// The password reset's token is in the query, which never goes.
const TOKEN_PARENTS = new Set(["invite"]);

/** The URL as an event may carry it: no query, no fragment, no invitation token. */
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
 * A stack frame's file as an event may carry it. The handler of uncaught errors names
 * the page itself (`location.href`) as the file of an error without a stack.
 */
const redactFile = (file: string | undefined) =>
  file === undefined || !/^[a-z][a-z0-9+.-]*:\/\//i.test(file)
    ? file
    : redactUrl(file);

/**
 * The last step before an event leaves (`beforeSend`, SDD 7.2「個人情報」): the page's
 * redacted URL as the request, nothing of its headers or cookies, only the user's id,
 * no breadcrumbs, no `extra`, and stack frames without their local variables and with
 * their files' URLs redacted. The client is also built not to collect them; this holds
 * even if an integration added some.
 */
export function scrubEvent(event: ErrorEvent, pageUrl: string): ErrorEvent {
  const { request: _, user, breadcrumbs: __, extra: ___, ...rest } = event;
  const scrubbed: ErrorEvent = { ...rest };
  const url = redactUrl(pageUrl);
  if (url !== "") scrubbed.request = { url };
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
                  ({ vars: ____, filename, abs_path, ...frame }) => ({
                    ...frame,
                    ...(filename === undefined
                      ? {}
                      : { filename: redactFile(filename) }),
                    ...(abs_path === undefined
                      ? {}
                      : { abs_path: redactFile(abs_path) }),
                  }),
                ),
              },
            },
      ),
    };
  }
  return scrubbed;
}

/**
 * Sends the Web's unexpected errors to Sentry (`moonx-web`, ADR-023・SDD 11章), or does
 * nothing without a DSN. Of the default integrations only the handlers for uncaught
 * errors and the filters of browser noise are kept: the others would record breadcrumbs
 * (the URLs of every screen visited) and the request's headers, which 7.2 forbids.
 *
 * @param options.transport Tests replace it to read the envelopes instead of sending them.
 */
export function startSentry(
  env: WebEnv,
  options: Pick<BrowserOptions, "transport"> = {},
) {
  if (env.sentryDsn === null) return;
  init({
    dsn: env.sentryDsn,
    environment: env.appEnv,
    release: import.meta.env.MOONX_RELEASE,
    ...options,
    defaultIntegrations: false,
    integrations: [
      globalHandlersIntegration(),
      linkedErrorsIntegration(),
      dedupeIntegration(),
      // The browser's own noise (a ResizeObserver loop, "Script error." from another
      // origin) is no failure of the app.
      eventFiltersIntegration(),
    ],
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
    // The message of a failed fetch stays the app's own.
    enhanceFetchErrorMessages: false,
    maxBreadcrumbs: 0,
    beforeBreadcrumb: () => null,
    beforeSend: (event) => scrubEvent(event, window.location.href),
  });
}

/**
 * Reports an unexpected error of the Web (SDD 8.3) and returns its event id, which the
 * screen shows as `Ref` (8.2). Null when Sentry is off: there is no event to refer to.
 */
export function reportError(error: unknown): string | null {
  if (getClient() === undefined) return null;
  return captureException(error);
}

/** Ties the events that follow to the signed-in user by id alone, or to nobody. */
export function setReportedUser(userId: string | null) {
  setUser(userId === null ? null : { id: userId });
}
