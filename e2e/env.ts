import { fileURLToPath } from "node:url";

// The e2e ports, apart from the development servers' (SDD 2章「環境変数」): Web 5273,
// API 3100.

export const WEB_PORT = 5273;
export const API_PORT = 3100;
export const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;
export const API_ORIGIN = `http://localhost:${API_PORT}`;

/**
 * Where the e2e API writes its log: with MAIL_TRANSPORT=console (SDD 2章「環境変数」) each
 * mail it sends is a line there, links included, which the tests read in place of an
 * inbox. Under the repository's ignored .data/.
 */
export const API_LOG = fileURLToPath(
  new URL("../.data/e2e/api.log", import.meta.url),
);
