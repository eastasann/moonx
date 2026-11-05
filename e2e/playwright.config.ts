import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import {
  API_LOG,
  API_ORIGIN,
  API_PORT,
  PWA_API_LOG,
  PWA_ORIGIN,
  PWA_PORT,
  PWA_SENTRY_DSN,
  PWA_WEB_DIR,
  SLOWNESS,
  WEB_ORIGIN,
  WEB_PORT,
} from "./env";

const root = fileURLToPath(new URL("..", import.meta.url));

/**
 * make first-paint: SDD 7.3's first display estimated against the PWA checks' build,
 * alone (first-paint.spec.ts). Its timings follow the host's CPU, so make test-e2e and
 * CI leave it out.
 */
const firstPaint = process.env.MOONX_FIRST_PAINT === "1";

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
  // Playwright's 30 and 5 seconds, longer on CI (env.ts): /dev/components draws its
  // heading 2.2 to 3 seconds after the load in the container SLOWNESS was measured on, so
  // about 6 to 8 on the runner, past 5 though the page is right.
  timeout: 30_000 * SLOWNESS,
  expect: { timeout: 5_000 * SLOWNESS },
  use: { baseURL: WEB_ORIGIN, trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: [
        "admin-publish.spec.ts",
        "template-migration.spec.ts",
        "pwa.spec.ts",
        "production.spec.ts",
        "first-paint.spec.ts",
      ],
    },
    // The PWA and the serving of ADR-004 and ADR-031 (SDD 10章), and the API's production
    // branches (production.spec.ts): against the API that serves make build-web's output,
    // which make test-e2e builds first. One test at a time, --repeat-each included: a
    // test stands for a deploy by changing the sw.js of the one copy of the build that API
    // serves to every test (pwa.spec.ts).
    {
      name: "pwa",
      use: { ...devices["Desktop Chrome"], baseURL: PWA_ORIGIN },
      testMatch: ["pwa.spec.ts", "production.spec.ts"],
      workers: 1,
    },
    // A published template version is what every new self analysis, idea and plan takes
    // from then on (design-spec 6.0.7): publishing waits until the others are done.
    {
      name: "after-the-others",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "admin-publish.spec.ts",
      dependencies: ["chromium", "pwa"],
    },
    // Moving to a newer version (M8) needs the ones published: the self analysis v2
    // admin-publish.spec.ts publishes, and the versions this one publishes itself.
    {
      name: "after-publishing",
      use: { ...devices["Desktop Chrome"] },
      testMatch: "template-migration.spec.ts",
      dependencies: ["after-the-others"],
    },
    // No trace, screenshot or video: recording them runs on the page's slowed CPU.
    ...(firstPaint
      ? [
          {
            name: "first-paint",
            use: {
              baseURL: PWA_ORIGIN,
              trace: "off" as const,
              screenshot: "off" as const,
              video: "off" as const,
            },
            testMatch: "first-paint.spec.ts",
          },
        ]
      : []),
  ],
  webServer: [
    // The estimate needs only the API that serves the build.
    ...(firstPaint
      ? []
      : [
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
        ]),
    {
      // The build is copied, so the tests may change the copy (env.ts PWA_WEB_DIR).
      command: [
        `rm -rf "${PWA_WEB_DIR}"`,
        `mkdir -p "${dirname(PWA_WEB_DIR)}"`,
        `cp -R "${root}apps/web/dist/client" "${PWA_WEB_DIR}"`,
        `exec bun src/index.ts > "${PWA_API_LOG}"`,
      ].join(" && "),
      cwd: `${root}apps/api`,
      url: `${PWA_ORIGIN}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      // SDD 2章「環境変数」: the PWA checks' values over the root .env, with the image's
      // NODE_ENV (apps/api/Dockerfile), so the tests take the libraries' production branches.
      env: {
        NODE_ENV: "production",
        PORT: String(PWA_PORT),
        WEB_DIST_DIR: PWA_WEB_DIR,
        WEB_SENTRY_DSN: PWA_SENTRY_DSN,
        BETTER_AUTH_URL: PWA_ORIGIN,
        TRUSTED_ORIGINS: PWA_ORIGIN,
        DATABASE_URL: testDatabase,
        MAIL_TRANSPORT: "console",
        LOG_LEVEL: "info",
      },
    },
    ...(firstPaint
      ? []
      : [
          {
            command: `bun --bun x --no-install vite dev --port ${WEB_PORT} --strictPort`,
            cwd: `${root}apps/web`,
            url: `${WEB_ORIGIN}/dev/components`,
            reuseExistingServer: false,
            timeout: 120_000,
            // Vite forwards /api/ to PORT (vite.config.ts): the e2e API's port.
            env: { PORT: String(API_PORT) },
          },
        ]),
  ],
});
