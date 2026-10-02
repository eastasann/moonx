import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, personalWorkspaceId, userId } from "@moonx/db/seed";
import { eq } from "drizzle-orm";
import { enforceRateLimit, RATE_LIMITS } from "../src/lib/rate-limit";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let grace: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  grace = await login(t.app, "grace");
});
afterAll(async () => {
  await t.close();
});

const path = `/api/v1/workspaces/${BCDX}`;

describe("request pipeline", () => {
  test("every response carries a request id and no-store; a supplied id is kept", async () => {
    const res = await call(t.app, "GET", path, {
      as: ana,
      headers: { "x-request-id": "req-12345678" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-request-id")).toBe("req-12345678");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const fresh = await call(t.app, "GET", path, { as: ana });
    expect(fresh.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  test("an unauthenticated request is 401 in the error envelope", async () => {
    const res = await call(t.app, "GET", path);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(res.body.error.requestId).toBe(res.headers.get("x-request-id"));
  });

  test("the dev header is refused outside local and test", async () => {
    const prod = await startTestApp({ env: "production" });
    const res = await call(prod.app, "GET", path, { as: await login(prod.app, "ana") });
    expect(res.status).toBe(401);
    await prod.close();
    // the other app reseeded the shared database; bring the data of this file back
    t = await startTestApp();
  });

  test("a suspended user is 401", async () => {
    await t.db
      .update(schema.users)
      .set({ status: "suspended" })
      .where(eq(schema.users.id, userId("grace")));
    expect((await call(t.app, "GET", path, { as: grace })).status).toBe(401);
    await t.db
      .update(schema.users)
      .set({ status: "active" })
      .where(eq(schema.users.id, userId("grace")));
  });

  test("unknown route and unknown workspace are 404", async () => {
    expect((await call(t.app, "GET", "/api/v1/nope", { as: ana })).body.error.code).toBe(
      "NOT_FOUND",
    );
    const res = await call(
      t.app,
      "GET",
      "/api/v1/workspaces/6f1f3f3a-1111-4111-8111-111111111111",
      { as: ana },
    );
    expect(res.status).toBe(404);
  });

  test("a workspace the caller does not belong to is 403 NO_ACCESS", async () => {
    const res = await call(t.app, "GET", `/api/v1/workspaces/${personalWorkspaceId("kenji")}`, {
      as: ana,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_ACCESS");
  });

  test("invalid input is 422 VALIDATION_FAILED with details; a bad JSON body is 400", async () => {
    const res = await call(t.app, "POST", "/api/v1/workspaces", { as: ana, body: { name: "" } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("VALIDATION_FAILED");
    expect(res.body.error.details).toEqual([
      { path: "name", code: "too_small", message: expect.any(String) },
    ]);
    const bad = await t.app.handle(
      new Request(`http://localhost/api/v1/workspaces`, {
        method: "POST",
        headers: { ...ana, "content-type": "application/json", "content-length": "5" },
        body: "{bad",
      }),
    );
    expect(bad.status).toBe(400);
    const malformed = await t.app.handle(
      new Request(`http://localhost/api/v1/workspaces/not-a-uuid`, { headers: ana }),
    );
    expect(malformed.status).toBe(422);
  });

  test("CSRF: a foreign Origin is 403, a body that is not JSON is 400, an oversized one is 413", async () => {
    const origin = await call(t.app, "POST", "/api/v1/workspaces", {
      as: ana,
      body: { name: "X" },
      headers: { origin: "https://evil.example" },
    });
    expect(origin.status).toBe(403);
    const trusted = await call(t.app, "PATCH", path, {
      as: ana,
      body: {},
      headers: { origin: "http://localhost:5173" },
    });
    expect(trusted.status).toBe(200);
    const text = await t.app.handle(
      new Request("http://localhost/api/v1/workspaces", {
        method: "POST",
        headers: { ...ana, "content-type": "text/plain" },
        body: "name=x",
      }),
    );
    expect(text.status).toBe(400);
    const big = await t.app.handle(
      new Request("http://localhost/api/v1/workspaces", {
        method: "POST",
        headers: { ...ana, "content-type": "application/json", "content-length": "1100020" },
        body: JSON.stringify({ name: "x".repeat(1_100_000) }),
      }),
    );
    expect(big.status).toBe(413);
  });

  test("old or unidentified mobile builds are 426; the web and current builds pass", async () => {
    const old = await call(t.app, "GET", path, {
      as: ana,
      headers: { "x-moonx-client": "ios", "x-moonx-app-version": "0.9.0" },
    });
    expect(old.status).toBe(426);
    expect(old.body.error.code).toBe("APP_UPDATE_REQUIRED");
    const unknown = await call(t.app, "GET", path, {
      as: ana,
      headers: { "x-moonx-client": "android" },
    });
    expect(unknown.status).toBe(426);
    for (const headers of <Record<string, string>[]>[
      { "x-moonx-client": "web" },
      { "x-moonx-client": "ios", "x-moonx-app-version": "1.0.0" },
    ]) {
      expect((await call(t.app, "GET", path, { as: ana, headers })).status).toBe(200);
    }
  });

  test("the Worker's shared secret guards everything but health; two secrets rotate", async () => {
    const guarded = await startTestApp({ proxySecrets: ["old-secret", "new-secret"] });
    const as = await login(guarded.app, "ana");
    expect((await call(guarded.app, "GET", path, { as })).status).toBe(403);
    expect(
      (await call(guarded.app, "GET", path, { as, headers: { "x-moonx-proxy-secret": "wrong" } }))
        .status,
    ).toBe(403);
    for (const secret of ["old-secret", "new-secret"]) {
      expect(
        (await call(guarded.app, "GET", path, { as, headers: { "x-moonx-proxy-secret": secret } }))
          .status,
      ).toBe(200);
    }
    expect((await call(guarded.app, "GET", "/api/health")).status).toBe(200);
    expect((await call(guarded.app, "GET", "/api/health/db")).status).toBe(403);
    expect(
      (
        await call(guarded.app, "GET", "/api/health/db", {
          headers: { "x-moonx-proxy-secret": "new-secret" },
        })
      ).status,
    ).toBe(200);
    await guarded.close();
    t = await startTestApp();
  });

  test("an unexpected error is 500 INTERNAL without details and is logged with the request id", async () => {
    const broken = await startTestApp();
    const failing = broken.app.get("/api/boom", () => {
      throw new Error("secret detail");
    });
    const res = await failing.handle(new Request("http://localhost/api/boom"));
    expect(res.status).toBe(500);
    const body = (await res.json()) as {
      error: { code: string; message: string; requestId: string };
    };
    expect(body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(body)).not.toContain("secret detail");
    expect(
      broken.logLines.some(
        (l) => l.includes(body.error.requestId) && l.includes('"severity":"ERROR"'),
      ),
    ).toBe(true);
    await broken.close();
    t = await startTestApp();
  });

  test("each request writes one JSON log line with the ADR-023 fields", async () => {
    t.logLines.length = 0;
    await call(t.app, "GET", path, { as: ana, headers: { "x-moonx-client": "web" } });
    await Bun.sleep(20);
    const line = JSON.parse(t.logLines.find((l) => l.includes('"message":"request"')) as string);
    expect(line).toMatchObject({
      severity: "INFO",
      message: "request",
      userId: userId("ana"),
      route: "GET /api/v1/workspaces/:workspaceId",
      status: 200,
      client: "web",
    });
    expect(typeof line.latencyMs).toBe("number");
    expect(typeof line.requestId).toBe("string");
    expect(line.appVersion).toBeNull();
  });
});

describe("rate limit", () => {
  test("the limit-th use passes and the next one is 429 with retryAfterSeconds", async () => {
    const user = userId("paolo");
    const now = Date.now();
    for (let i = 0; i < RATE_LIMITS.invitation.limit; i++)
      await enforceRateLimit(t.db, "invitation", user, now);
    const error = await enforceRateLimit(t.db, "invitation", user, now + 1000).catch((e) => e);
    expect(error.code).toBe("RATE_LIMITED");
    expect(error.extra.retryAfterSeconds).toBe(3599);
    // a new window starts after an hour
    await enforceRateLimit(t.db, "invitation", user, now + 3600_001);
    // limits are per user and per name
    await enforceRateLimit(t.db, "invitation", userId("kenji"), now);
    await enforceRateLimit(t.db, "pdf", user, now);
  });
});

describe("body limits", () => {
  test("a chunked JSON body over 1 MB is 413 even without Content-Length", async () => {
    const big = JSON.stringify({ name: "x".repeat(1_100_000) });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(big));
        controller.close();
      },
    });
    const res = await t.app.handle(
      new Request("http://localhost/api/v1/workspaces", {
        method: "POST",
        headers: { ...ana, "content-type": "application/json" },
        body: stream,
        duplex: "half",
      } as RequestInit),
    );
    expect(res.status).toBe(413);
  });

  test("an empty JSON body reaches validation instead of failing the parser", async () => {
    const res = await t.app.handle(
      new Request("http://localhost/api/v1/workspaces", {
        method: "POST",
        headers: { ...ana, "content-type": "application/json" },
        body: "",
      }),
    );
    expect(res.status).toBe(422);
  });
});
