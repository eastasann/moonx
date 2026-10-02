import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, planId, userId } from "@moonx/db/seed";
import { eq } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

/**
 * SDD 7.1 for the endpoints of Step 7 that belong to a workspace: each endpoint names the lowest
 * role that may call it. Every lower role gets 403 FORBIDDEN, a signed-in stranger gets NO_ACCESS
 * and an anonymous caller gets 401. Refusals run first so that no success has changed the data
 * they depend on.
 */

type Min = "read" | "editor";

interface Fixture {
  idea: string;
  plan: string;
  validation: string;
  itemId: string;
  deleteId: string;
}

interface Endpoint {
  name: string;
  method: string;
  path: (f: Fixture) => string;
  body?: (f: Fixture) => unknown;
  min: Min;
  ok: number;
}

let t: TestApp;
let f: Fixture;
const who = {} as Record<"ana" | "kenji" | "grace" | "admin", Record<string, string>>;
const PLAN_ANSWER = { text: "x", lockVersion: 0 };

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "grace", "admin"] as const) who[p] = await login(t.app, p);
  const [validation] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId("piaya")));
  const plan = planId("piaya-b");
  const items = await t.db
    .select({ id: schema.executionItems.id })
    .from(schema.executionItems)
    .where(eq(schema.executionItems.businessPlanId, plan));
  f = {
    idea: ideaId("piaya"),
    plan,
    validation: (validation as { id: string }).id,
    itemId: (items[0] as { id: string }).id,
    deleteId: (items[1] as { id: string }).id,
  };
});
afterAll(async () => {
  await t.close();
});

const ENDPOINTS: Endpoint[] = [
  {
    name: "P1 GET",
    method: "GET",
    path: (x) => `/api/v1/ideas/${x.idea}/plans`,
    min: "read",
    ok: 200,
  },
  { name: "P2 GET", method: "GET", path: (x) => `/api/v1/plans/${x.plan}`, min: "read", ok: 200 },
  {
    name: "P4",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/items/3`,
    min: "read",
    ok: 200,
  },
  {
    name: "P6 GET",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/versions`,
    min: "read",
    ok: 200,
  },
  {
    name: "P9 GET",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/execution-items`,
    min: "read",
    ok: 200,
  },
  {
    name: "P12",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/pitch-deck?variant=one`,
    min: "read",
    ok: 200,
  },
  {
    name: "P13",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/pitch-deck.pdf?variant=one`,
    min: "read",
    ok: 200,
  },
  {
    name: "P1 POST",
    method: "POST",
    path: (x) => `/api/v1/ideas/${x.idea}/plans`,
    body: () => ({ name: "Plan Perm" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "P2 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/plans/${x.plan}`,
    body: () => ({ preparedBy: "Someone", lockVersion: 0 }),
    min: "editor",
    ok: 200,
  },
  {
    name: "P5",
    method: "PUT",
    path: (x) => `/api/v1/plans/${x.plan}/answers/P.05.2`,
    body: () => PLAN_ANSWER,
    min: "editor",
    ok: 200,
  },
  {
    name: "P6 POST",
    method: "POST",
    path: (x) => `/api/v1/plans/${x.plan}/versions`,
    body: () => ({ name: "v1" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "P7",
    method: "GET",
    path: (x) => `/api/v1/plans/${x.plan}/go-no-go-context`,
    min: "editor",
    ok: 200,
  },
  {
    name: "P8",
    method: "POST",
    path: (x) => `/api/v1/plans/${x.plan}/go-no-go`,
    body: () => ({ value: "delay", reason: "Not yet" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "P9 POST",
    method: "POST",
    path: (x) => `/api/v1/plans/${x.plan}/execution-items`,
    body: () => ({ type: "next_action", title: "Do it" }),
    min: "editor",
    ok: 201,
  },
  {
    name: "P10 PATCH",
    method: "PATCH",
    path: (x) => `/api/v1/execution-items/${x.itemId}`,
    body: () => ({ title: "Renamed", lockVersion: 0 }),
    min: "editor",
    ok: 200,
  },
  {
    name: "P10 DELETE",
    method: "DELETE",
    path: (x) => `/api/v1/execution-items/${x.deleteId}`,
    min: "editor",
    ok: 204,
  },
  {
    name: "P11",
    method: "PUT",
    path: (x) => `/api/v1/plans/${x.plan}/execution-items/order`,
    body: () => ({ type: "launch", ids: [] }),
    min: "editor",
    ok: 422,
  },
  {
    name: "P3 archive",
    method: "POST",
    path: (x) => `/api/v1/plans/${x.plan}/archive`,
    min: "editor",
    ok: 200,
  },
  {
    name: "P3 restore",
    method: "POST",
    path: (x) => `/api/v1/plans/${x.plan}/restore`,
    min: "editor",
    ok: 200,
  },
  {
    name: "X1 validation",
    method: "GET",
    path: (x) => `/api/v1/ai/export?source=validation&id=${x.validation}`,
    min: "editor",
    ok: 200,
  },
  {
    name: "X1 plan",
    method: "GET",
    path: (x) => `/api/v1/ai/export?source=business_plan&id=${x.plan}`,
    min: "editor",
    ok: 200,
  },
  {
    name: "X2",
    method: "GET",
    path: (x) => `/api/v1/ai/import/context?target=business_plan&id=${x.plan}`,
    min: "editor",
    ok: 200,
  },
  {
    name: "X3",
    method: "POST",
    path: () => "/api/v1/ai/import/apply",
    body: (x) => ({
      target: { type: "business_plan", id: x.plan },
      changes: [{ questionKey: "P.05.3", text: "y", baseLockVersion: 0 }],
    }),
    min: "editor",
    ok: 200,
  },
];

/** The PDF answer is not JSON, so only its status is read. */
async function send(e: Endpoint, as?: Record<string, string>) {
  if (e.name === "P13") {
    const response = await t.app.handle(
      new Request(`http://localhost${e.path(f)}`, { headers: as }),
    );
    const type = response.headers.get("content-type") ?? "";
    const body = type.includes("json") ? await response.json() : null;
    return { status: response.status, body };
  }
  return call(t.app, e.method, e.path(f), { as, body: e.body?.(f) });
}

describe("refusals", () => {
  for (const e of ENDPOINTS) {
    test(`${e.name}: anonymous 401, stranger NO_ACCESS`, async () => {
      expect((await send(e)).status).toBe(401);
      const stranger = await send(e, who.admin);
      expect(stranger.status).toBe(403);
      expect(stranger.body.error.code).toBe("NO_ACCESS");
    });
    if (e.min === "editor") {
      test(`${e.name}: Viewer is FORBIDDEN`, async () => {
        const res = await send(e, who.grace);
        expect(res.status).toBe(403);
        expect(res.body.error.code).toBe("FORBIDDEN");
      });
    }
  }
});

describe("lowest allowed role", () => {
  for (const e of ENDPOINTS) {
    test(`${e.name}: ${e.min === "read" ? "Viewer" : "Member"} gets ${e.ok}`, async () => {
      const res = await send(e, e.min === "read" ? who.grace : who.kenji);
      expect(res.status).toBe(e.ok);
    });
  }
  test("the Member's writes are attributed to the Member", async () => {
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, f.plan));
    expect(rows.length).toBeGreaterThan(0);
    const mine = rows.filter((r) => r.changedById === userId("kenji"));
    expect(mine.some((r) => r.source === "manual")).toBe(true);
    expect(mine.some((r) => r.source === "ai_import")).toBe(true);
  });
  test("every plan of the workspace belongs to BCDX", async () => {
    const [row] = await t.db
      .select({ w: schema.ideas.workspaceId })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, f.idea));
    expect(row?.w).toBe(BCDX);
  });
});
