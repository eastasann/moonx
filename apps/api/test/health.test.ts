import { expect, test } from "bun:test";
import { createApp } from "../src/app";

test("GET /api/health returns status, version and env without touching the DB", async () => {
  const app = createApp({ env: "local", version: "abc123" });
  const res = await app.handle(new Request("http://localhost/api/health"));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok", version: "abc123", env: "local" });
});
