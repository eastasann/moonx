import { expect, test } from "bun:test";
import { createApp } from "../src/app";
import { testConfig } from "../src/config";
import { createTestDb } from "./helpers";

test("GET /api/health returns status, version and env without touching the DB", async () => {
  const app = createApp(testConfig({ env: "local", version: "abc123" }), {
    db: null as never,
  });
  const res = await app.handle(new Request("http://localhost/api/health"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: "abc123", env: "local" });
});

test("GET /api/health/db reports the database latency", async () => {
  const { db, close } = createTestDb();
  const app = createApp(testConfig(), { db });
  const res = await app.handle(new Request("http://localhost/api/health/db"));
  expect(res.status).toBe(200);
  expect(((await res.json()) as { status: string }).status).toBe("ok");
  await close();
});
