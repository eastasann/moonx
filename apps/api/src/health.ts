import type { Database } from "@moonx/db";
import { errorBodySchema, healthDbSchema, healthSchema } from "@moonx/schemas";
import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import type { Config } from "./config";
import type { IpLimit } from "./entry";
import { ApiError } from "./errors";

/** Z2 per IP (SDD 7.2「レート制限」), counted by the entry plugin. */
export const HEALTH_DB_IP_LIMIT: IpLimit = {
  method: "GET",
  path: "/api/health/db",
  limit: { name: "health-db", max: 10, windowMs: 60_000 },
};

/** Z1 and Z2 (SDD 5.14). */
export function healthRoutes(
  config: Pick<Config, "appEnv" | "appVersion">,
  db: Database,
) {
  return new Elysia()
    .get(
      "/api/health",
      () => ({
        status: "ok" as const,
        version: config.appVersion,
        env: config.appEnv,
      }),
      {
        response: { 200: healthSchema },
        detail: {
          summary: "Z1 Health check",
          description:
            "Never touches the database, so monitoring does not wake Neon (ADR-008).",
        },
      },
    )
    .get(
      "/api/health/db",
      async () => {
        const started = performance.now();
        await db.execute(sql`select 1`).catch((error: unknown) => {
          throw new ApiError(
            "UPSTREAM_UNAVAILABLE",
            "The database is unreachable",
            {},
            { cause: error },
          );
        });
        return {
          status: "ok" as const,
          latencyMs: Math.round(performance.now() - started),
        };
      },
      {
        response: {
          200: healthDbSchema,
          429: errorBodySchema,
          503: errorBodySchema,
        },
        detail: {
          summary: "Z2 Database health check",
          description: "For the checks after a deploy. Limited per IP.",
        },
      },
    );
}
