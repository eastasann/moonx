import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { API_PORT, WEB_ORIGIN, WEB_PORT } from "./env";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * Browser tests against their own Web server on the e2e port, so the development server
 * keeps running. Only the Web starts: the page under test (/dev/components) does not call
 * the API.
 */
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.spec.ts",
  reporter: [["list"]],
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
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
