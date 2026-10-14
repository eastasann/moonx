import { describe, expect, test } from "bun:test";
import { createApp } from "./app";
import type { Config } from "./config";

const config: Config = {
  appEnv: "test",
  appVersion: "abc1234",
  port: 3000,
  webDistDir: undefined,
  databaseUrl: "postgres://moonx:moonx@localhost:5432/moonx_test",
  betterAuthSecret: "x".repeat(32),
  betterAuthUrl: "http://localhost:5173",
  trustedOrigins: ["http://localhost:5173"],
  google: undefined,
  mail: {
    transport: "console",
    resendApiKey: undefined,
    from: "moonx <no-reply@localhost>",
    allowlist: undefined,
  },
  avatarBucket: undefined,
  sentryDsn: undefined,
  webSentryDsn: undefined,
  logLevel: "error",
};

describe("GET /api/health", () => {
  test("returns ok with the version and environment", async () => {
    const response = await createApp(config).handle(
      new Request("http://localhost/api/health"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      version: "abc1234",
      env: "test",
    });
  });

  test("does not need a reachable database", async () => {
    const unreachable = {
      ...config,
      databaseUrl: "postgres://nobody@127.0.0.1:1/none_test",
    };

    const response = await createApp(unreachable).handle(
      new Request("http://localhost/api/health"),
    );

    expect(response.status).toBe(200);
  });
});
