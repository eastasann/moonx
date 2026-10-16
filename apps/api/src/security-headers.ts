import type { AppEnv } from "./config";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "img-src 'self' data: https://storage.googleapis.com",
  "connect-src 'self' https://*.ingest.sentry.io",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "frame-ancestors 'none'",
].join("; ");

/**
 * The headers of SDD 7.2「セキュリティヘッダー」, sent with every response, static files
 * included. HSTS only where the API is served over HTTPS.
 */
export function securityHeaders(appEnv: AppEnv): Record<string, string> {
  return {
    "content-security-policy": CONTENT_SECURITY_POLICY,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy":
      "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
    ...(appEnv === "staging" || appEnv === "production"
      ? { "strict-transport-security": "max-age=31536000; includeSubDomains" }
      : {}),
  };
}
