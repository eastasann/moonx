import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppConfig } from "./config";
import type { AppContext } from "./context";
import type { Db } from "./lib/db";
import { createLogger, type Logger } from "./lib/logger";
import { createMailer, type Mailer } from "./mail/mailer";
import { basePlugin } from "./plugins";
import { apiV1 } from "./routes";
import { healthRoutes } from "./routes/health";

export type { AppConfig } from "./config";

/** What a deployment or a test supplies: the database, and optionally its own mailer, logger and clock. */
export interface AppDeps {
  db: Db;
  mailer?: Mailer;
  logger?: Logger;
  now?: () => Date;
}

/** Builds the app. The database and the mailer are passed in so tests use their own. */
export function createApp(config: AppConfig, deps: AppDeps) {
  const logger = deps.logger ?? createLogger(config.logLevel);
  const ctx: AppContext = {
    db: deps.db,
    config,
    logger,
    mailer: deps.mailer ?? createMailer(config.mail, logger),
    now: deps.now ?? (() => new Date()),
  };
  const app = new Elysia().use(basePlugin(ctx)).use(healthRoutes(ctx)).use(apiV1(ctx));
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
