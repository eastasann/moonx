import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { BCDX, ideaId } from "@moonx/db/seed";
import { Elysia } from "elysia";
import { assertAllRoutesDeclared, openPlugin } from "../src/access";
import { createLogger } from "../src/lib/logger";
import { appOn, call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
});
afterAll(async () => {
  await t.close();
});

describe("the access declaration (SDD 7.1, ADR-005)", () => {
  test("a route without a declaration stops the app from starting", () => {
    const app = new Elysia()
      .use(openPlugin())
      .get("/declared", () => "ok", { open: true })
      .get("/forgotten", () => "oops")
      .post("/also-forgotten", () => "oops");
    expect(() => assertAllRoutesDeclared(app)).toThrow("GET /forgotten, POST /also-forgotten");
  });

  test("a guard declares every route inside it", () => {
    const app = new Elysia()
      .use(openPlugin())
      .guard({ open: true })
      .get("/a", () => "a")
      .get("/b", () => "b");
    expect(() => assertAllRoutesDeclared(app)).not.toThrow();
  });

  test("every route of the real app is declared", () => {
    expect(() => assertAllRoutesDeclared(t.app as never)).not.toThrow();
  });

  test("a stranger gets 401 before the body is validated", async () => {
    const res = await call(t.app, "POST", `/api/v1/workspaces/${BCDX}/ideas`, {
      body: { name: 42 },
    });
    expect(res.status).toBe(401);
  });

  test("a Viewer's edit of an archived idea is 409, not 403", async () => {
    const grace = await login(t.app, "grace");
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/archive`, { as: ana });
    try {
      const edit = await call(t.app, "PATCH", `/api/v1/ideas/${ideaId("piaya")}`, {
        as: grace,
        body: { lockVersion: 0, name: "Nope" },
      });
      expect([edit.status, edit.body.error.code]).toEqual([409, "ARCHIVED"]);
    } finally {
      await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/restore`, { as: ana });
    }
    const live = await call(t.app, "PATCH", `/api/v1/ideas/${ideaId("piaya")}`, {
      as: grace,
      body: { lockVersion: 0, name: "Nope" },
    });
    expect([live.status, live.body.error.code]).toEqual([403, "FORBIDDEN"]);
  });
});

describe("CSRF: Content-Type on every state-changing request (SDD 7.2)", () => {
  const send = (method: string, path: string, headers: Record<string, string>, body?: string) =>
    t.app.handle(
      new Request(`http://localhost${path}`, { method, headers: { ...ana, ...headers }, body }),
    );

  test("a POST or DELETE without a body still needs application/json", async () => {
    for (const [method, path] of [
      ["POST", "/api/v1/notifications/read-all"],
      ["DELETE", "/api/v1/me/avatar"],
    ] as const) {
      const none = await send(method, path, {});
      expect(none.status).toBe(400);
      expect(((await none.json()) as { error: { code: string } }).error.code).toBe("BAD_REQUEST");
      const text = await send(method, path, { "content-type": "text/plain" });
      expect(text.status).toBe(400);
      expect(
        (await send(method, path, { "content-type": "application/json" })).status,
      ).toBeLessThan(300);
    }
  });

  test("a form post is refused", async () => {
    const res = await send(
      "POST",
      "/api/v1/notifications/read-all",
      { "content-type": "application/x-www-form-urlencoded" },
      "a=b",
    );
    expect(res.status).toBe(400);
  });

  test("multipart is accepted for the photo only", async () => {
    const form = () => {
      const data = new FormData();
      data.set("file", new File(["not an image"], "a.png", { type: "image/png" }));
      return data;
    };
    const photo = await t.app.handle(
      new Request("http://localhost/api/v1/me/avatar", {
        method: "PUT",
        headers: ana,
        body: form(),
      }),
    );
    expect(photo.status).toBe(422);
    const elsewhere = await t.app.handle(
      new Request(`http://localhost/api/v1/workspaces/${BCDX}/ideas`, {
        method: "POST",
        headers: ana,
        body: form(),
      }),
    );
    expect(elsewhere.status).toBe(400);
  });

  test("reads need no type", async () => {
    expect((await send("GET", "/api/v1/me", {})).status).toBe(200);
  });
});

describe("one bucket per IP for the paths that take a secret (SDD 7.2)", () => {
  const post = (path: string, ip: string, body: unknown) =>
    call(t.app, "POST", path, { headers: { "cf-connecting-ip": ip }, body });

  test("sign-in, reset and sign-up attempts count together; reads do not", async () => {
    const ip = "198.51.100.77";
    for (let i = 0; i < 4; i++) {
      await post("/api/auth/sign-in/email", ip, {
        email: "ana@bcdx.example",
        password: "wrong password!",
      });
    }
    for (let i = 0; i < 3; i++) {
      await post("/api/auth/request-password-reset", ip, { email: "nobody@bcdx.example" });
    }
    for (let i = 0; i < 2; i++)
      await post("/api/v1/invitations/by-token/nope/sign-up", ip, {
        displayName: "Walk In",
        password: "correct horse 42",
        timezone: "Asia/Manila",
      });
    await post("/api/auth/change-password", ip, { currentPassword: "x", newPassword: "y" });
    const reads = await call(t.app, "GET", "/api/auth/get-session", {
      headers: { "cf-connecting-ip": ip },
    });
    expect(reads.status).toBeLessThan(500);
    const over = await post("/api/auth/sign-in/email", ip, {
      email: "ana@bcdx.example",
      password: "wrong password!",
    });
    expect([over.status, over.body.error.code]).toEqual([429, "RATE_LIMITED"]);
    const other = await post("/api/auth/sign-in/email", "198.51.100.78", {
      email: "ana@bcdx.example",
      password: "wrong password!",
    });
    expect(other.status).toBe(401);
  });
});

describe("401 and 403 bursts are logged at warn (SDD 8.3)", () => {
  test("the access log goes to warn after ten from one IP in a minute", async () => {
    const lines: string[] = [];
    const app = appOn(t.db, {}, { logger: createLogger("info", (line) => lines.push(line)) });
    const hit = (ip: string) =>
      call(app, "GET", "/api/v1/me", { headers: { "cf-connecting-ip": ip } });
    for (let i = 0; i < 11; i++) expect((await hit("203.0.113.50")).status).toBe(401);
    await hit("203.0.113.51");
    // `onAfterResponse` runs once the response has been handed over.
    await Bun.sleep(50);
    const severities = lines
      .map((line) => JSON.parse(line) as { message: string; status: number; severity: string })
      .filter((line) => line.message === "request" && line.status === 401)
      .map((line) => line.severity);
    expect(severities).toEqual([...Array(10).fill("INFO"), "WARNING", "INFO"]);
  });
});
