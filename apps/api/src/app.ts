import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { z } from "zod";
import { assertAllRoutesDeclared } from "./access";
import { createAuth } from "./auth";
import type { AppConfig } from "./config";
import type { AppContext } from "./context";
import { type AvatarStore, createAvatarStore } from "./lib/avatar-store";
import type { Db } from "./lib/db";
import { createLogger, type Logger } from "./lib/logger";
import type { OidcKeySource } from "./lib/oidc";
import { createMailer, type Mailer } from "./mail/mailer";
import { basePlugin } from "./plugins";
import { apiV1 } from "./routes";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { internalRoutes } from "./routes/internal";

export type { AppConfig } from "./config";

/** What a deployment or a test supplies: the database, and optionally its own mailer, logger and clock. */
export interface AppDeps {
  db: Db;
  mailer?: Mailer;
  /** Where profile photos go; tests pass a temporary directory. */
  avatars?: AvatarStore;
  logger?: Logger;
  now?: () => Date;
  /** Where Z3 finds the keys that sign Cloud Scheduler's tokens; tests pass their own. */
  oidcKeys?: OidcKeySource;
}

/** Builds the app. The database and the mailer are passed in so tests use their own. */
export function createApp(config: AppConfig, deps: AppDeps) {
  const logger = deps.logger ?? createLogger(config.logLevel);
  const base = {
    db: deps.db,
    config,
    logger,
    mailer: deps.mailer ?? createMailer(config.mail, logger),
    now: deps.now ?? (() => new Date()),
  };
  const ctx: AppContext = {
    ...base,
    auth: createAuth(base),
    avatars: deps.avatars ?? createAvatarStore(config),
  };
  const app = new Elysia()
    .use(basePlugin(ctx))
    .use(healthRoutes(ctx))
    .use(authRoutes(ctx))
    .use(internalRoutes(ctx, deps.oidcKeys))
    .use(apiV1(ctx));
  // Before the OpenAPI plugin: its documentation routes come from the library and have no access declaration.
  assertAllRoutesDeclared(app);
  if (config.openapi) {
    app.use(
      openapi({
        path: "/api/docs",
        // Transforms (e.g. query strings parsed to numbers) have no JSON Schema form: document the
        // input side and fall back to "any" instead of failing the whole document.
        mapJsonSchema: {
          zod: (schema: z.ZodType) =>
            z.toJSONSchema(schema, { unrepresentable: "any", io: "input" }),
        },
        documentation: { info: { title: "moonx API", version: config.version } },
      }),
    );
  }
  return app;
}

/** The type Eden Treaty derives the client from (ADR-006). */
export type App = ReturnType<typeof createApp>;
