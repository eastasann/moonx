import type { Database } from "@moonx/db";
import { Elysia } from "elysia";
import { accessPlugin, assertAccessDeclared } from "./access";
import { AUTH_IP_LIMITS, createAuth } from "./auth";
import type { Config } from "./config";
import { docsRoutes } from "./docs";
import { entryPlugin } from "./entry";
import { HEALTH_DB_IP_LIMIT, healthRoutes } from "./health";
import { invitationRoutes, SIGN_UP_IP_LIMIT } from "./invitations";
import type { Logger } from "./log";
import type { Mailer } from "./mail";
import { createRateLimiter } from "./rate-limit";
import type { ErrorReporter } from "./sentry";

/** What the API talks to. `src/index.ts` builds the real ones; tests pass their own. */
export interface AppServices {
  db: Database;
  log: Logger;
  reporter: ErrorReporter;
  mailer: Mailer;
  /**
   * How long A6 takes to answer, and so how long its mail may take (SDD 5.4). Tests
   * shorten it; it defaults to 2 s.
   */
  resetAnswerMs?: number;
  /**
   * The clock of the rate limits, the log levels, `users.last_active_at`, invitations
   * (their expiry, and what accepting them records) and sign-up's records, in epoch
   * milliseconds. Better Auth keeps its own for sessions and tokens.
   */
  now?: () => number;
}

/**
 * Builds the API. Tests call this with a config they assemble themselves instead of
 * reading environment variables.
 *
 * @throws {AccessDeclarationError} when a route declares no way of access (ADR-005),
 * so the API does not start.
 */
export function createApp(config: Config, services: AppServices) {
  const { db, log, reporter, mailer, resetAnswerMs, now = Date.now } = services;
  const { auth, routes: authRoutes } = createAuth({
    config,
    db,
    log,
    mailer,
    now,
    resetAnswerMs,
  });
  const access = accessPlugin({ auth, db });
  const app = new Elysia()
    .use(
      entryPlugin({
        config,
        log,
        reporter,
        limiter: createRateLimiter(db, now),
        ipLimits: [HEALTH_DB_IP_LIMIT, ...AUTH_IP_LIMITS, SIGN_UP_IP_LIMIT],
        now,
      }),
    )
    .use(healthRoutes(config, db, access))
    .use(invitationRoutes({ access, auth, db, now }));
  // Better Auth's paths take its own shapes (SDD 5.4), not the typed REST API Eden
  // reads (ADR-006), so they and the docs stay out of the app's type.
  app.use(authRoutes(access));
  if (config.appEnv === "staging") app.use(docsRoutes(access));
  assertAccessDeclared(app);
  return app;
}

/** The API's type, shared with clients through Eden Treaty (ADR-006). */
export type App = ReturnType<typeof createApp>;
