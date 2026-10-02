import { Elysia } from "elysia";

/** Settings the app reads from the environment, passed in so tests can build isolated apps. */
export interface AppConfig {
  env: string;
  version: string;
}

export function createApp(config: AppConfig) {
  return new Elysia().get("/api/health", () => ({
    status: "ok" as const,
    version: config.version,
    env: config.env,
  }));
}

export type App = ReturnType<typeof createApp>;
