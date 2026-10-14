import { Elysia } from "elysia";
import type { Config } from "./config";

/**
 * Builds the API. Tests call this with a config they assemble themselves instead of
 * reading environment variables.
 */
export function createApp(config: Config) {
  return new Elysia().get("/api/health", () => ({
    status: "ok" as const,
    version: config.appVersion,
    env: config.appEnv,
  }));
}

/** The API's type, shared with clients through Eden Treaty (ADR-006). */
export type App = ReturnType<typeof createApp>;
