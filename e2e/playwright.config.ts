import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { API_LOG, API_ORIGIN, API_PORT, WEB_ORIGIN, WEB_PORT } from "./env";

const root = fileURLToPath(new URL("..", import.meta.url));

const testDatabase = process.env.DATABASE_URL_TEST?.trim();
if (!testDatabase) {
  throw new Error(
    "DATABASE_URL_TEST is not set: run make test-e2e, which reads it from .env",
  );
}

/**
 * Browser tests against their own API and Web on the e2e ports, so the development
 * servers keep running (docs/03_dev-setup.md 7章). The API uses the test database, which
 * global-setup.ts recreates and seeds before the tests; it connects only on its first
 * query, so starting before that is safe.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  reporter: [["list"]],
  globalSetup: "./global-setup.ts",
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      // Its log goes to API_LOG, where the tests read the mails it sends (env.ts).
      command: `mkdir -p "${dirname(API_LOG)}" && exec bun src/index.ts > "${API_LOG}"`,
      cwd: `${root}apps/api`,
      url: `${API_ORIGIN}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      // SDD 2章「環境変数」: the e2e values over the root .env, which make passes in.
      env: {
        PORT: String(API_PORT),
        BETTER_AUTH_URL: WEB_ORIGIN,
        TRUSTED_ORIGINS: WEB_ORIGIN,
        DATABASE_URL: testDatabase,
        // The mails go to the log at info, where the tests read them.
        MAIL_TRANSPORT: "console",
        LOG_LEVEL: "info",
      },
    },
    {
      command: `bun --bun x --no-install vite dev --port ${WEB_PORT} --strictPort`,
      cwd: `${root}apps/web`,
      url: `${WEB_ORIGIN}/dev/components`,
      reuseExistingServer: false,
      timeout: 120_000,
      // Vite forwards /api/ to PORT (vite.config.ts): the e2e API's port.
      env: { PORT: String(API_PORT) },
    },
  ],
});
