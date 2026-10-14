import type { Database } from "@moonx/db";
import { Elysia } from "elysia";
import type { Config } from "./config";
import { docsRoutes } from "./docs";
import { entryPlugin } from "./entry";
import { HEALTH_DB_IP_LIMIT, healthRoutes } from "./health";
import type { Logger } from "./log";
import { createRateLimiter } from "./rate-limit";
import type { ErrorReporter } from "./sentry";

/** What the API talks to. `src/index.ts` builds the real ones; tests pass their own. */
export interface AppServices {
  db: Database;
  log: Logger;
  reporter: ErrorReporter;
  /** The clock of the rate limits and the log levels, in epoch milliseconds. */
  now?: () => number;
}

/**
 * Builds the API. Tests call this with a config they assemble themselves instead of
 * reading environment variables.
 */
export function createApp(config: Config, services: AppServices) {
  const { db, log, reporter, now = Date.now } = services;
  const app = new Elysia()
    .use(
      entryPlugin({
        config,
        log,
        reporter,
        limiter: createRateLimiter(db, now),
        ipLimits: [HEALTH_DB_IP_LIMIT],
        now,
      }),
    )
    .use(healthRoutes(config, db));
  // Registered without widening the type, so Eden clients never see the docs routes.
  if (config.appEnv === "staging") app.use(docsRoutes());
  return app;
}

/** The API's type, shared with clients through Eden Treaty (ADR-006). */
export type App = ReturnType<typeof createApp>;
