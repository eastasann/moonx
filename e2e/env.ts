import { fileURLToPath } from "node:url";

// The e2e ports, apart from the development servers' (SDD 2章「環境変数」): Web 5273,
// API 3100, and 3200 for the PWA checks, where the API serves the Web's build.

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
 * The copy of make build-web's output that API serves (WEB_DIST_DIR), made afresh as it
 * starts: pwa.spec.ts changes its sw.js to stand for a new version, which must not touch
 * the build itself.
 */
export const PWA_WEB_DIR = fileURLToPath(
  new URL("../.data/e2e/web", import.meta.url),
);
