/** The deployments the API names in the HTML it serves (SDD 2章 APP_ENV). */
export type AppEnv = "local" | "staging" | "production";

/** What the Web takes from its environment at run time (ADR-004). */
export interface WebEnv {
  appEnv: AppEnv;
  /** `moonx-web`'s DSN, or null where errors go nowhere (local, and the dev server). */
  sentryDsn: string | null;
}

const content = (document: Document, name: string) =>
  document
    .querySelector(`meta[name="${name}"]`)
    ?.getAttribute("content")
    ?.trim() ?? "";

/**
 * Reads the meta elements the API writes into the HTML (ADR-004): one build serves every
 * environment, so nothing of it is baked into the bundle. Vite's dev server writes none,
 * which reads as `local` without Sentry (SDD 2章「環境変数」).
 */
export function readWebEnv(document: Document): WebEnv {
  const env = content(document, "moonx-app-env");
  const dsn = content(document, "moonx-sentry-dsn");
  return {
    appEnv: env === "staging" || env === "production" ? env : "local",
    sentryDsn: dsn === "" ? null : dsn,
  };
}
