/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Commit SHA for the Sentry release, or `dev` (vite.config.ts). */
  readonly MOONX_RELEASE: string;
}
