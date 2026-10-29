import type { Config } from "./config";

// A host-source's host as CSP Level 3 writes it (2.3.1 `host-part`): labels of letters,
// digits and hyphens. URL parsing lets through more (`;`, `'`, `*`), which in the header
// would end the directive or widen it.
const CSP_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*$/;

/**
 * Where the Web's Sentry sends its events, as a CSP source: the DSN's origin, since the
 * SDK posts to `<origin>/api/<project>/envelope/`. Sentry names an organization's ingest
 * host by its region (`o<number>.ingest.us.sentry.io`, `o<number>.ingest.de.sentry.io`),
 * which a wildcard such as `*.ingest.sentry.io` does not match. Null for a DSN that is not
 * an http or https URL whose host a CSP source can name.
 */
export function sentryConnectSource(dsn: string): string | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return CSP_HOST.test(url.hostname) ? url.origin : null;
}

function contentSecurityPolicy(webSentryDsn: string | undefined) {
  const sentry =
    webSentryDsn === undefined ? null : sentryConnectSource(webSentryDsn);
  // loadConfig refuses any other DSN, so only a Config built by hand can get here.
  if (webSentryDsn !== undefined && sentry === null) {
    throw new Error("WEB_SENTRY_DSN has no origin a CSP can name");
  }
  return [
    "default-src 'self'",
    "script-src 'self'",
    "img-src 'self' data: https://storage.googleapis.com",
    sentry === null ? "connect-src 'self'" : `connect-src 'self' ${sentry}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "manifest-src 'self'",
    "worker-src 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/**
 * The headers of SDD 7.2「セキュリティヘッダー」, sent with every response, static files
 * included. HSTS only where the API is served over HTTPS.
 */
export function securityHeaders(
  config: Pick<Config, "appEnv" | "webSentryDsn">,
): Record<string, string> {
  return {
    "content-security-policy": contentSecurityPolicy(config.webSentryDsn),
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    ...(config.appEnv === "staging" || config.appEnv === "production"
      ? { "strict-transport-security": "max-age=31536000; includeSubDomains" }
      : {}),
  };
}
