import { fileURLToPath } from "node:url";

// The e2e ports, apart from the development servers' (SDD 2章「環境変数」): Web 5273,
// API 3100, and 3200 for the PWA checks, where the API serves the Web's build.

/**
 * How many times as long the time limits are on CI: ci.yml's runner (4 vCPUs, two
 * workers) takes about 2.6 times as long for a test as a 4-CPU Linux container on an
 * Apple M1 Max (SDD 10章). It multiplies playwright.config.ts's defaults and the limits
 * the tests set on work the CPU does (a long flow, a page loading, a PDF read); the waits
 * on timers (React Aria's 7-second announcement, retries, a tooltip's delay) stay as
 * written, since a slower CPU does not stretch them.
 */
export const SLOWNESS = process.env.CI === "true" ? 3 : 1;

export const WEB_PORT = 5273;
export const API_PORT = 3100;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_ORIGIN = `http://localhost:${API_PORT}`;
export const PWA_PORT = 3200;
export const PWA_ORIGIN = `http://localhost:${PWA_PORT}`;

/**
 * Where the e2e API writes its log: with MAIL_TRANSPORT=console (SDD 2章「環境変数」) each
 * mail it sends is a line there, links included, which the tests read in place of an
 * inbox. Under the repository's ignored .data/.
 */
export const API_LOG = fileURLToPath(
  new URL("../.data/e2e/api.log", import.meta.url),
);

/** The log of the API that serves the Web's build on PWA_PORT. */
export const PWA_API_LOG = fileURLToPath(
  new URL("../.data/e2e/api-pwa.log", import.meta.url),
);

/**
 * The Web's Sentry DSN the API on PWA_PORT writes into its pages (SDD 2章 WEB_SENTRY_DSN),
 * so the build reports as on staging and production. Its host is under .invalid, which
 * never resolves (RFC 6761): an event no test receives through page.route goes nowhere.
 */
export const PWA_SENTRY_DSN = "https://e2e@sentry.invalid/1";

/**
 * The copy of make build-web's output that API serves (WEB_DIST_DIR), made afresh as it
 * starts: pwa.spec.ts changes its sw.js to stand for a new version, which must not touch
 * the build itself.
 */
export const PWA_WEB_DIR = fileURLToPath(
  new URL("../.data/e2e/web", import.meta.url),
);
