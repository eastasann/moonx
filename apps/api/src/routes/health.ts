import { sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { openPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError } from "../errors";

/** Z1 and Z2 (SDD 5.14). Z1 never touches the DB, so monitoring does not wake Neon (ADR-008). */
export function healthRoutes(ctx: AppContext) {
  return new Elysia({ name: "moonx-health" })
    .use(openPlugin())
    .guard({ open: true })
    .get("/api/health", () => ({
      status: "ok" as const,
      version: ctx.config.version,
      env: ctx.config.env,
    }))
    .get("/api/health/db", async () => {
      const started = performance.now();
      try {
        await ctx.db.execute(sql`select 1`);
      } catch (error) {
        ctx.logger.log("error", "database health check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
        throw new ApiError("UPSTREAM_UNAVAILABLE", "Database is unreachable");
      }
      return { status: "ok" as const, latencyMs: Math.round(performance.now() - started) };
    });
}
