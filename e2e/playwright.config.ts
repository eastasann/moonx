import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, DATABASE_URL, WEB_ORIGIN, WEB_PORT } from "./env";

/**
 * The browser tests run against their own API and Web servers on their own ports, over the
 * `DATABASE_URL_TEST` database, which `global-setup.ts` resets and seeds first. The development
 * servers and the `moonx` database stay untouched.
 */

const root = fileURLToPath(new URL("..", import.meta.url));

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  globalSetup: "./global-setup.ts",
  // One database, shared by every test: they run one after another.
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "bun run --cwd apps/api start",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      cwd: root,
      env: {
        APP_ENV: "local",
        PORT: String(API_PORT),
        DATABASE_URL: DATABASE_URL,
        BETTER_AUTH_SECRET: "e2e-secret-0123456789abcdef0123456789abcdef",
        BETTER_AUTH_URL: WEB_ORIGIN,
        TRUSTED_ORIGINS: WEB_ORIGIN,
        MAIL_TRANSPORT: "console",
        LOG_LEVEL: "warn",
      },
    },
    {
      command: `bun run --cwd apps/web vite dev --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      cwd: root,
      env: { API_ORIGIN: `http://localhost:${API_PORT}` },
    },
  ],
});
