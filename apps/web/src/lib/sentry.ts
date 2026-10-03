import * as Sentry from "@sentry/react";

let started = false;

/** `/invite/<token>` carries a credential in the path, which `urlQueryParams` does not cover. */
const INVITE_PATH = /\/invite\/[^/?#\s]+/g;

function withoutQueryAndToken(url: string): string {
  const [beforeHash = ""] = url.split("#");
  const [path = ""] = beforeHash.split("?");
  return path.replace(INVITE_PATH, "/invite/:token");
}

const URL_LIKE = /^(?:https?:\/\/|\/)/;

/** Scrubs the strings of a free-form object (tags, extra, contexts) that hold an address. */
function scrubValues(value: unknown): unknown {
  if (typeof value === "string") return URL_LIKE.test(value) ? withoutQueryAndToken(value) : value;
  if (Array.isArray(value)) return value.map(scrubValues);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, scrubValues(v)]));
  }
  return value;
}

/**
 * Keeps the address of the page out of an event: no query (`/reset-password?token=`), no fragment,
 * and no invitation token in the path (SDD 7.2).
 */
export function scrubEvent<T extends Sentry.ErrorEvent>(event: T): T {
  if (event.request?.url) event.request.url = withoutQueryAndToken(event.request.url);
  if (event.request) {
    delete event.request.query_string;
    delete event.request.headers;
    delete event.request.cookies;
  }
  if (event.transaction) event.transaction = withoutQueryAndToken(event.transaction);
  // Bundles are served from the page's address, so a frame's file name can carry the same query.
  const stacks = [
    ...(event.exception?.values ?? []).map((value) => value.stacktrace),
    ...(event.threads?.values ?? []).map((thread) => thread.stacktrace),
  ];
  for (const frame of stacks.flatMap((stack) => stack?.frames ?? [])) {
    if (frame.filename) frame.filename = withoutQueryAndToken(frame.filename);
    if (frame.abs_path) frame.abs_path = withoutQueryAndToken(frame.abs_path);
  }
  if (event.tags) event.tags = scrubValues(event.tags) as typeof event.tags;
  if (event.extra) event.extra = scrubValues(event.extra) as typeof event.extra;
  if (event.contexts) event.contexts = scrubValues(event.contexts) as typeof event.contexts;
  return event;
}

/**
 * The browser SDK's options. `dataCollection` is off everywhere (the v11 replacement of
 * `sendDefaultPii: false`), breadcrumbs are dropped because they record navigation URLs and
 * request URLs with their queries, and `scrubEvent` removes what is left of the address.
 */
export function sentryOptions(dsn: string, environment: string | undefined): Sentry.BrowserOptions {
  return {
    dsn,
    environment,
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
    beforeBreadcrumb: () => null,
    beforeSend: scrubEvent,
  };
}

/** Starts Sentry once in the browser. Without a DSN (local) it stays off (SDD 11). */
export function initSentry() {
  if (started || typeof window === "undefined") return;
  started = true;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  Sentry.init(sentryOptions(dsn, import.meta.env.VITE_APP_ENV));
}

/** Reports an unexpected client error and returns the id the screen shows as `Ref`. */
export function captureClientError(error: unknown): string {
  return Sentry.captureException(error);
}
