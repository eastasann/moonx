import { afterAll, describe, expect, test } from "bun:test";
import { errorBodySchema, healthDbSchema, healthSchema } from "@moonx/schemas";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppEnv } from "./config";
import { entryPlugin } from "./entry";
import { HEALTH_DB_IP_LIMIT, healthRoutes } from "./health";
import { createLogger } from "./log";
import {
  accessLine,
  buildTestAccess,
  buildTestApp,
  connectTestDatabase,
  testConfig,
  uniqueIp,
  unreachableDatabase,
  waitForLine,
} from "./test-app";

const HEALTH_DB_LIMIT = HEALTH_DB_IP_LIMIT.limit;

const database = connectTestDatabase();
const unreachable = unreachableDatabase();
afterAll(async () => {
  await database.close();
  await unreachable.close();
});

const get = (path: string, headers: Record<string, string> = {}) =>
  new Request(`http://localhost${path}`, { headers });

const CSP =
  "default-src 'self'; script-src 'self'; img-src 'self' data: https://storage.googleapis.com; connect-src 'self' https://*.ingest.sentry.io; style-src 'self' 'unsafe-inline'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'none'";

describe("GET /api/health (Z1)", () => {
  test("returns ok with the version and environment", async () => {
    const response = await buildTestApp(database).app.handle(
      get("/api/health"),
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({ status: "ok", version: "abc1234", env: "test" });
    expect(z.strictObject(healthSchema.shape).safeParse(body).success).toBe(
      true,
    );
  });

  test("does not need a reachable database", async () => {
    const response = await buildTestApp(unreachable).app.handle(
      get("/api/health"),
    );

    expect(response.status).toBe(200);
  });
});

describe("headers on every response (SDD 5.1, 7.2, 8.3)", () => {
  const paths = ["/api/health", "/api/health/db", "/missing", "/api/v1/x"];

  for (const path of paths) {
    test(`${path} carries the security headers, no-store and a request ID`, async () => {
      const response = await buildTestApp(database).app.handle(
        get(path, { "x-forwarded-for": uniqueIp() }),
      );

      expect(response.headers.get("content-security-policy")).toBe(CSP);
      expect(response.headers.get("x-content-type-options")).toBe("nosniff");
      expect(response.headers.get("referrer-policy")).toBe(
        "strict-origin-when-cross-origin",
      );
      expect(response.headers.get("permissions-policy")).toBe(
        "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
      );
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-request-id")).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  }

  const hsts: [AppEnv, string | null][] = [
    ["local", null],
    ["test", null],
    ["staging", "max-age=31536000; includeSubDomains"],
    ["production", "max-age=31536000; includeSubDomains"],
  ];
  for (const [appEnv, expected] of hsts) {
    test(`Strict-Transport-Security on ${appEnv} is ${expected ?? "absent"}`, async () => {
      const response = await buildTestApp(database, {
        config: { appEnv },
      }).app.handle(get("/api/health"));

      expect(response.headers.get("strict-transport-security")).toBe(expected);
    });
  }
});

describe("GET /api/health/db (Z2)", () => {
  test("returns ok with the round trip of one query", async () => {
    const { app, lines } = buildTestApp(database);
    const response = await app.handle(
      get("/api/health/db", { "x-forwarded-for": uniqueIp() }),
    );

    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(z.strictObject(healthDbSchema.shape).safeParse(body).success).toBe(
      true,
    );
    expect(await accessLine(lines, response)).toMatchObject({
      route: "GET /api/health/db",
      status: 200,
    });
  });

  test("allows 10 checks a minute per IP, then answers 429 until the window ends", async () => {
    let clock = 1_000_000;
    const { app } = buildTestApp(database, { now: () => clock });
    const ip = uniqueIp();
    const check = () =>
      app.handle(get("/api/health/db", { "x-forwarded-for": ip }));

    for (let i = 0; i < HEALTH_DB_LIMIT.max; i++) {
      expect((await check()).status).toBe(200);
    }
    clock += 15_000;
    const limited = await check();

    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: {
        code: "RATE_LIMITED",
        message: expect.any(String),
        requestId: limited.headers.get("x-request-id"),
        retryAfterSeconds: 45,
      },
    });
    expect(limited.headers.get("x-retry-after")).toBeNull();

    clock += 45_000;
    expect((await check()).status).toBe(200);
  });

  test("counts each IP separately", async () => {
    const { app } = buildTestApp(database);
    const busy = uniqueIp();
    for (let i = 0; i <= HEALTH_DB_LIMIT.max; i++) {
      await app.handle(get("/api/health/db", { "x-forwarded-for": busy }));
    }

    const other = await app.handle(
      get("/api/health/db", { "x-forwarded-for": uniqueIp() }),
    );

    expect(other.status).toBe(200);
  });

  test("counts by the rightmost X-Forwarded-For value, whatever the left side claims", async () => {
    const { app } = buildTestApp(database);
    const ip = uniqueIp();
    for (let i = 0; i < HEALTH_DB_LIMIT.max; i++) {
      await app.handle(
        get("/api/health/db", { "x-forwarded-for": `${uniqueIp()}, ${ip}` }),
      );
    }

    const spoofed = await app.handle(
      get("/api/health/db", { "x-forwarded-for": `${uniqueIp()}, ${ip}` }),
    );

    expect(spoofed.status).toBe(429);
  });

  test("counts an IPv6 caller by its /64, wherever in it the address moves", async () => {
    const { app } = buildTestApp(database);
    const prefix = uniqueIp().replace(/::1$/, "");
    for (let i = 0; i < HEALTH_DB_LIMIT.max; i++) {
      await app.handle(
        get("/api/health/db", { "x-forwarded-for": `${prefix}::${i + 1}` }),
      );
    }

    const moved = await app.handle(
      get("/api/health/db", { "x-forwarded-for": `${prefix}::ffff` }),
    );

    expect(moved.status).toBe(429);
  });

  test("counts HEAD and a trailing slash, which reach the same handler, in the same window", async () => {
    const { app } = buildTestApp(database);
    const ip = uniqueIp();
    for (let i = 0; i < HEALTH_DB_LIMIT.max; i++) {
      const variant = i % 2 === 0 ? "/api/health/db/" : "/api/health/db";
      await app.handle(
        new Request(`http://localhost${variant}`, {
          method: i % 3 === 0 ? "HEAD" : "GET",
          headers: { "x-forwarded-for": ip },
        }),
      );
    }

    const limited = await app.handle(
      get("/api/health/db", { "x-forwarded-for": ip }),
    );

    expect(limited.status).toBe(429);
  });

  test("answers 503 when the query fails after the count succeeded", async () => {
    const lines: string[] = [];
    const app = new Elysia()
      .use(
        entryPlugin({
          config: testConfig,
          log: createLogger("debug", (line) => lines.push(line)),
          reporter: { report: async () => {} },
          limiter: { consume: async () => ({ allowed: true }) },
          ipLimits: [HEALTH_DB_IP_LIMIT],
        }),
      )
      .use(
        healthRoutes(testConfig, unreachable.db, buildTestAccess(unreachable)),
      );

    const response = await app.handle(get("/api/health/db"));

    expect(response.status).toBe(503);
    expect(errorBodySchema.parse(await response.json()).error.code).toBe(
      "UPSTREAM_UNAVAILABLE",
    );
  }, 10_000);

  test("answers 503 UPSTREAM_UNAVAILABLE and reports it when the database is down", async () => {
    const { app, lines, reports } = buildTestApp(unreachable);
    const response = await app.handle(
      get("/api/health/db", { "x-forwarded-for": uniqueIp() }),
    );
    const requestId = response.headers.get("x-request-id");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: {
        code: "UPSTREAM_UNAVAILABLE",
        message: "The database is unreachable",
        requestId,
      },
    });
    expect(
      await waitForLine(lines, (line) => line.message === "request failed"),
    ).toMatchObject({
      severity: "ERROR",
      requestId,
      errorCode: "UPSTREAM_UNAVAILABLE",
      errorName: expect.any(String),
    });
    expect(await accessLine(lines, response)).toMatchObject({
      severity: "ERROR",
      status: 503,
    });
    expect(reports).toHaveLength(1);
    // Counting fails first, in the entry plugin, before any route is matched.
    expect(reports[0]).toMatchObject({
      requestId,
      route: null,
      url: "http://localhost/api/health/db",
    });
  }, 10_000);
});

describe("/api/docs (ADR-006)", () => {
  test("serves the OpenAPI document and a Swagger UI page on staging", async () => {
    const { app } = buildTestApp(database, {
      config: { appEnv: "staging", avatarBucket: "test-moonx-staging-avatars" },
    });

    const page = await app.handle(get("/api/docs"));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(page.headers.get("content-security-policy")).toBe(CSP);
    expect(page.headers.get("cache-control")).toBe("no-store");
    const html = await page.text();
    // Every script is a file from this origin, as the CSP requires.
    expect(html).not.toMatch(/<script>|<script [^>]*>[^<]/);
    const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map(
      (match) => match[1] ?? "",
    );
    const styles = [
      ...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g),
    ].map((match) => match[1] ?? "");
    expect(scripts).toEqual([
      "/api/docs/swagger-ui-bundle.js",
      "/api/docs/start.js",
    ]);
    for (const path of [...scripts, ...styles]) {
      const asset = await app.handle(get(path));
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-security-policy")).toBe(CSP);
      expect((await asset.text()).length).toBeGreaterThan(0);
    }

    const spec = await app.handle(get("/api/docs/json"));
    expect(spec.status).toBe(200);
    const document = (await spec.json()) as { paths: object };
    expect(Object.keys(document.paths).sort()).toEqual([
      "/api/auth/*",
      "/api/health",
      "/api/health/db",
      "/api/v1/assumptions/{id}",
      "/api/v1/competitors/{competitorId}",
      "/api/v1/cost-items/{costItemId}",
      "/api/v1/evidence/{evidenceId}",
      "/api/v1/execution-items/{itemId}",
      "/api/v1/ideas/{ideaId}",
      "/api/v1/ideas/{ideaId}/archive",
      "/api/v1/ideas/{ideaId}/decision-context",
      "/api/v1/ideas/{ideaId}/decisions",
      "/api/v1/ideas/{ideaId}/duplicate",
      "/api/v1/ideas/{ideaId}/plans",
      "/api/v1/ideas/{ideaId}/restore",
      "/api/v1/ideas/{ideaId}/validation",
      "/api/v1/invitations/by-token/{token}",
      "/api/v1/invitations/by-token/{token}/accept",
      "/api/v1/invitations/by-token/{token}/sign-up",
      "/api/v1/invitations/{invitationId}",
      "/api/v1/invitations/{invitationId}/resend",
      "/api/v1/me",
      "/api/v1/me/avatar",
      "/api/v1/me/delete",
      "/api/v1/me/password",
      "/api/v1/me/self-analysis",
      "/api/v1/me/self-analysis/answers/{questionKey}",
      "/api/v1/me/self-analysis/complete",
      "/api/v1/me/self-analysis/reopen",
      "/api/v1/me/self-analysis/sections/{sectionKey}",
      "/api/v1/me/self-analysis/shares",
      "/api/v1/plans/{planId}",
      "/api/v1/plans/{planId}/answers/{questionKey}",
      "/api/v1/plans/{planId}/archive",
      "/api/v1/plans/{planId}/execution-items",
      "/api/v1/plans/{planId}/execution-items/order",
      "/api/v1/plans/{planId}/go-no-go",
      "/api/v1/plans/{planId}/go-no-go-context",
      "/api/v1/plans/{planId}/items/{itemNo}",
      "/api/v1/plans/{planId}/pitch-deck",
      "/api/v1/plans/{planId}/pitch-deck.pdf",
      "/api/v1/plans/{planId}/restore",
      "/api/v1/plans/{planId}/versions",
      "/api/v1/research-log/{entryId}",
      "/api/v1/risks/{id}",
      "/api/v1/validations/{validationId}/answers/{questionKey}",
      "/api/v1/validations/{validationId}/assumptions",
      "/api/v1/validations/{validationId}/assumptions/order",
      "/api/v1/validations/{validationId}/competitors",
      "/api/v1/validations/{validationId}/competitors/order",
      "/api/v1/validations/{validationId}/cost-items",
      "/api/v1/validations/{validationId}/cost-items/order",
      "/api/v1/validations/{validationId}/costs",
      "/api/v1/validations/{validationId}/economics",
      "/api/v1/validations/{validationId}/economics/{fieldKey}",
      "/api/v1/validations/{validationId}/evidence",
      "/api/v1/validations/{validationId}/questions/{sectionKey}",
      "/api/v1/validations/{validationId}/research-log",
      "/api/v1/validations/{validationId}/risks",
      "/api/v1/validations/{validationId}/risks/order",
      "/api/v1/workspaces",
      "/api/v1/workspaces/{workspaceId}",
      "/api/v1/workspaces/{workspaceId}/dashboard/activity",
      "/api/v1/workspaces/{workspaceId}/dashboard/due-soon",
      "/api/v1/workspaces/{workspaceId}/dashboard/ideas",
      "/api/v1/workspaces/{workspaceId}/dashboard/self-analyses",
      "/api/v1/workspaces/{workspaceId}/ideas",
      "/api/v1/workspaces/{workspaceId}/invitations",
      "/api/v1/workspaces/{workspaceId}/members",
      "/api/v1/workspaces/{workspaceId}/members/{userId}",
      "/api/v1/workspaces/{workspaceId}/mention-candidates",
      "/api/v1/workspaces/{workspaceId}/self-analyses",
      "/api/v1/workspaces/{workspaceId}/self-analyses/{userId}",
    ]);
  });

  for (const appEnv of ["local", "test", "production"] as const) {
    test(`is not served on ${appEnv}`, async () => {
      const { app } = buildTestApp(database, { config: { appEnv } });

      for (const path of ["/api/docs", "/api/docs/json"]) {
        const response = await app.handle(get(path));
        expect(response.status).toBe(404);
        expect(errorBodySchema.parse(await response.json()).error.code).toBe(
          "NOT_FOUND",
        );
      }
    });
  }
});
