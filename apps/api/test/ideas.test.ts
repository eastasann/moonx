import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, personalWorkspaceId, userId } from "@moonx/db/seed";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let paolo: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  paolo = await login(t.app, "paolo");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

const list = `/api/v1/workspaces/${BCDX}/ideas`;
const names = (body: { items: { name: string }[] }) => body.items.map((i) => i.name);
const history = (where: SQL | undefined) => t.db.select().from(schema.changeHistory).where(where);

const NOT_DROPPED = [
  "Piaya Gift Box Delivery",
  "Bacolod Health Bowl",
  "Piaya Gift Box (Corporate)",
  "Mobile Bike Repair",
  "Student Study Café",
];

describe("I1 GET list", () => {
  test("default filter hides Drop, orders by activity and counts the hidden ones", async () => {
    const res = await call(t.app, "GET", list, { as: ana });
    expect(res.status).toBe(200);
    expect(names(res.body)).toEqual(NOT_DROPPED);
    expect(res.body.hiddenDroppedCount).toBe(1);
    expect(res.body.nextCursor).toBeNull();
  });

  test("a summary carries stage, checks, key metrics and plans", async () => {
    const res = await call(t.app, "GET", list, { as: ana });
    const piaya = res.body.items[0];
    expect(piaya).toMatchObject({
      id: ideaId("piaya"),
      oneLineConcept: "Boxed piaya and local gifts delivered to offices and homes in Bacolod.",
      stage: "planning",
      latestDecision: "proceed",
      archived: false,
      proposer: { id: userId("ana"), displayName: "Ana Villanueva", badge: null },
    });
    expect(piaya.checks.map((c: { key: string }) => c.key)).toEqual([
      "competitors",
      "local_price",
      "costs",
      "break_even",
      "permits",
      "demand_signal",
    ]);
    expect(piaya.checks.every((c: { state: string }) => c.state === "done")).toBe(true);
    expect(piaya.keyMetrics.initial_cost_total.value).toBe(169500);
    expect(piaya.keyMetrics.break_even_units_day.value).toBeCloseTo(6.93, 2);
    expect(piaya.keyMetrics.expected_operating_profit.value).toBe(18490);
    expect(piaya.keyMetrics.payback_months.value).toBeCloseTo(9.17, 2);
    expect(piaya.plans.map((p: { name: string }) => p.name)).toEqual(["Plan A", "Plan B"]);
    expect(piaya.plans[0]).toMatchObject({
      latestVersionName: "v1 For advisors",
      latestGoNoGo: "delay",
    });
    expect(piaya.plans[1]).toMatchObject({ latestVersionName: null, latestGoNoGo: null });
    expect(typeof piaya.lastActivityAt).toBe("string");
    expect(typeof piaya.createdAt).toBe("string");

    const bowl = res.body.items.find((i: { name: string }) => i.name === "Bacolod Health Bowl");
    expect(bowl.checks.map((c: { state: string }) => c.state)).toEqual([
      "done",
      "done",
      "partial",
      "done",
      "not_started",
      "done",
    ]);
    expect(bowl.keyMetrics.initial_cost_total.bound).toBe("lower");
    const bike = res.body.items.find((i: { name: string }) => i.name === "Mobile Bike Repair");
    expect(bike.checks.every((c: { state: string }) => c.state === "not_started")).toBe(true);
    expect(bike.keyMetrics.initial_cost_total.value).toBeNull();
    const cafe = res.body.items.find((i: { name: string }) => i.name === "Student Study Café");
    expect(cafe.stage).toBe("launch_prep");
  });

  test("decision filter values", async () => {
    const get = async (q: string) =>
      names((await call(t.app, "GET", `${list}?${q}`, { as: ana })).body);
    expect(await get("decision=drop")).toEqual(["Laundry Pickup"]);
    expect(await get("decision=all")).toHaveLength(6);
    expect(await get("decision=undecided")).toEqual([
      "Piaya Gift Box (Corporate)",
      "Mobile Bike Repair",
    ]);
    expect(await get("decision=proceed")).toEqual([
      "Piaya Gift Box Delivery",
      "Student Study Café",
    ]);
    expect(await get("decision=hold")).toEqual(["Bacolod Health Bowl"]);
  });

  test("stage, proposer and text filters; hidden count follows the other filters", async () => {
    const get = (q: string) => call(t.app, "GET", `${list}?${q}`, { as: ana });
    expect(names((await get("stage=planning")).body)).toEqual(["Piaya Gift Box Delivery"]);
    expect(names((await get("stage=launch_prep")).body)).toEqual(["Student Study Café"]);
    const validation = await get("stage=validation");
    expect(names(validation.body)).toEqual([
      "Bacolod Health Bowl",
      "Piaya Gift Box (Corporate)",
      "Mobile Bike Repair",
    ]);
    expect(validation.body.hiddenDroppedCount).toBe(1);
    expect((await get("stage=planning")).body.hiddenDroppedCount).toBe(0);

    const paoloIdeas = await get(`proposerId=${userId("paolo")}`);
    expect(names(paoloIdeas.body)).toEqual(["Student Study Café"]);
    expect(paoloIdeas.body.hiddenDroppedCount).toBe(1);
    const anaIdeas = await get(`proposerId=${userId("ana")}`);
    expect(names(anaIdeas.body)).toEqual(["Piaya Gift Box Delivery", "Mobile Bike Repair"]);
    expect(anaIdeas.body.hiddenDroppedCount).toBe(0);

    expect(names((await get("q=PIAYA")).body)).toEqual([
      "Piaya Gift Box Delivery",
      "Piaya Gift Box (Corporate)",
    ]);
    expect(names((await get("q=quiet%20caf")).body)).toEqual(["Student Study Café"]);
    expect(names((await get("q=%25")).body)).toEqual([]);
    const all = await get("decision=all&q=laundry");
    expect(names(all.body)).toEqual(["Laundry Pickup"]);
    expect(all.body.hiddenDroppedCount).toBe(0);
  });

  test("sort by name and creation", async () => {
    const byName = await call(t.app, "GET", `${list}?sort=name&decision=all`, { as: ana });
    expect(names(byName.body)).toEqual([
      "Bacolod Health Bowl",
      "Laundry Pickup",
      "Mobile Bike Repair",
      "Piaya Gift Box (Corporate)",
      "Piaya Gift Box Delivery",
      "Student Study Café",
    ]);
    const byCreated = await call(t.app, "GET", `${list}?sort=created&decision=all`, { as: ana });
    const created = byCreated.body.items.map((i: { createdAt: string }) => i.createdAt);
    expect(created).toEqual([...created].sort().reverse());
    expect(names(byCreated.body).at(-1)).toBe("Student Study Café");
  });

  test("paging walks the whole result with the cursor", async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: { body: { items: { name: string }[]; nextCursor: string | null } } = await call(
        t.app,
        "GET",
        `${list}?limit=2${cursor ? `&cursor=${cursor}` : ""}`,
        { as: ana },
      );
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...names(res.body));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(NOT_DROPPED);
  });

  test("stage filter and paging combine", async () => {
    const res = await call(t.app, "GET", `${list}?stage=validation&limit=2`, { as: ana });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).not.toBeNull();
    const next = await call(
      t.app,
      "GET",
      `${list}?stage=validation&limit=2&cursor=${res.body.nextCursor}`,
      {
        as: ana,
      },
    );
    expect(names(next.body)).toEqual(["Mobile Bike Repair"]);
    expect(next.body.nextCursor).toBeNull();
  });

  test("bad query values are 422 VALIDATION_FAILED", async () => {
    for (const q of [
      "decision=maybe",
      "limit=500",
      "limit=0",
      "stage=late",
      "sort=best",
      "proposerId=x",
      "cursor=%%%",
    ]) {
      const res = await call(t.app, "GET", `${list}?${q}`, { as: ana });
      expect(res.status, q).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
  });

  test("every role reads; strangers and anonymous callers do not", async () => {
    for (const who of [ana, kenji, paolo, grace]) {
      expect((await call(t.app, "GET", list, { as: who })).status).toBe(200);
    }
    const stranger = await call(t.app, "GET", list, { as: admin });
    expect(stranger.status).toBe(403);
    expect(stranger.body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "GET", list)).status).toBe(401);
    const missing = await call(
      t.app,
      "GET",
      "/api/v1/workspaces/6f1f3f3a-1111-4111-8111-111111111111/ideas",
      {
        as: ana,
      },
    );
    expect(missing.status).toBe(404);
  });
});

describe("I1 POST create", () => {
  test("creates the idea on the newest published validation template with Empty cost rows", async () => {
    const before = await t.db.select().from(schema.changeHistory);
    const res = await call(t.app, "POST", list, {
      as: kenji,
      body: {
        name: "  Night Market Stall ",
        oneLineConcept: "A weekend food stall",
        proposedSolution: "Pre-order by chat",
      },
    });
    expect(res.status).toBe(201);
    const idea = res.body;
    expect(idea).toMatchObject({
      name: "Night Market Stall",
      oneLineConcept: "A weekend food stall",
      proposedSolution: "Pre-order by chat",
      workspaceId: BCDX,
      stage: "validation",
      latestDecision: null,
      archived: false,
      duplicatedFrom: null,
      lockVersion: 0,
      plans: [],
      proposer: { id: userId("kenji") },
    });
    expect(idea.checks.map((c: { state: string }) => c.state)).toEqual(
      Array(6).fill("not_started"),
    );
    expect(idea.keyMetrics.initial_cost_total.value).toBeNull();

    const [validation] = await t.db
      .select()
      .from(schema.validations)
      .where(eq(schema.validations.id, idea.validationId));
    expect(validation?.ideaId).toBe(idea.id);
    const [version] = await t.db
      .select()
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, validation?.templateVersionId as string));
    expect(version).toMatchObject({ status: "published", versionNumber: 2 });

    const defaults = await t.db
      .select()
      .from(schema.templateCostDefaults)
      .where(eq(schema.templateCostDefaults.templateVersionId, version?.id as string));
    const rows = await t.db
      .select()
      .from(schema.costItems)
      .where(eq(schema.costItems.validationId, idea.validationId));
    expect(defaults.length).toBeGreaterThan(0);
    expect(rows).toHaveLength(defaults.length);
    for (const d of defaults) {
      const row = rows.find((r) => r.templateKey === d.key);
      expect(row).toMatchObject({
        category: d.category,
        name: d.name,
        sortOrder: d.sortOrder,
        amount: null,
        percent: null,
        fau: null,
        confidence: null,
        lockVersion: 0,
        deletedAt: null,
      });
    }
    const economics = await t.db
      .select()
      .from(schema.economicsInputs)
      .where(eq(schema.economicsInputs.validationId, idea.validationId));
    expect(economics).toHaveLength(0);

    const after = await t.db.select().from(schema.changeHistory);
    const added = after.filter((h) => !before.some((b) => b.id === h.id));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      workspaceId: BCDX,
      containerType: "idea",
      containerId: idea.id,
      targetType: "idea",
      targetId: idea.id,
      action: "create",
      source: "manual",
      batchId: null,
      before: null,
      changedById: userId("kenji"),
      after: {
        name: "Night Market Stall",
        oneLineConcept: "A weekend food stall",
        proposedSolution: "Pre-order by chat",
      },
    });
    const [ws] = await t.db.select().from(schema.workspaces).where(eq(schema.workspaces.id, BCDX));
    expect(Date.now() - (ws?.lastActiveAt?.getTime() ?? 0)).toBeLessThan(60_000);
    const [row] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, idea.id));
    expect(Date.now() - (row?.lastActivityAt.getTime() ?? 0)).toBeLessThan(60_000);
  });

  test("Owner and Member create; Viewer and strangers cannot", async () => {
    const body = { name: "Owner idea", oneLineConcept: "c" };
    expect((await call(t.app, "POST", list, { as: ana, body })).status).toBe(201);
    expect((await call(t.app, "POST", list, { as: paolo, body })).status).toBe(201);
    const viewer = await call(t.app, "POST", list, { as: grace, body });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const stranger = await call(t.app, "POST", list, { as: admin, body });
    expect(stranger.body.error.code).toBe("NO_ACCESS");
    expect((await call(t.app, "POST", list, { body })).status).toBe(401);
  });

  test("an idea without a proposed solution reads null", async () => {
    const res = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Bare", oneLineConcept: "c" },
    });
    expect(res.body.proposedSolution).toBeNull();
  });

  test("lengths are checked", async () => {
    const bad = [
      { oneLineConcept: "c" },
      { name: "", oneLineConcept: "c" },
      { name: "   ", oneLineConcept: "c" },
      { name: "n".repeat(101), oneLineConcept: "c" },
      { name: "n" },
      { name: "n", oneLineConcept: "c".repeat(201) },
    ];
    for (const body of bad) {
      const res = await call(t.app, "POST", list, { as: ana, body });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    const edge = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "n".repeat(100), oneLineConcept: "c".repeat(200) },
    });
    expect(edge.status).toBe(201);
  });
});

describe("I2 GET / PATCH", () => {
  const piaya = `/api/v1/ideas/${ideaId("piaya")}`;

  test("GET returns the detail", async () => {
    const res = await call(t.app, "GET", piaya, { as: grace });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: ideaId("piaya"),
      workspaceId: BCDX,
      proposedSolution: "Order online, choose a delivery slot, and receive a gift-ready box.",
      duplicatedFrom: null,
      lockVersion: 0,
    });
    expect(res.body.validationId).toMatch(/^[0-9a-f-]{36}$/);
    const copy = await call(t.app, "GET", `/api/v1/ideas/${ideaId("piaya-corp")}`, { as: ana });
    expect(copy.body.duplicatedFrom).toEqual({
      id: ideaId("piaya"),
      name: "Piaya Gift Box Delivery",
    });
  });

  test("GET: 401, 404 and another workspace's idea is 403", async () => {
    expect((await call(t.app, "GET", piaya)).status).toBe(401);
    expect(
      (await call(t.app, "GET", "/api/v1/ideas/6f1f3f3a-1111-4111-8111-111111111111", { as: ana }))
        .status,
    ).toBe(404);
    const own = await call(
      t.app,
      "POST",
      `/api/v1/workspaces/${personalWorkspaceId("kenji")}/ideas`,
      {
        as: kenji,
        body: { name: "Private", oneLineConcept: "c" },
      },
    );
    expect(own.status).toBe(201);
    const other = `/api/v1/ideas/${own.body.id}`;
    expect((await call(t.app, "GET", other, { as: ana })).body.error.code).toBe("NO_ACCESS");
    expect(
      (await call(t.app, "PATCH", other, { as: ana, body: { name: "x", lockVersion: 0 } })).status,
    ).toBe(403);
    expect((await call(t.app, "POST", `${other}/duplicate`, { as: ana, body: {} })).status).toBe(
      403,
    );
    expect((await call(t.app, "POST", `${other}/archive`, { as: ana })).status).toBe(403);
    expect((await call(t.app, "POST", `${other}/restore`, { as: ana })).status).toBe(403);
    expect(
      (await call(t.app, "GET", list, { as: ana })).body.items.map((i: { id: string }) => i.id),
    ).not.toContain(own.body.id);
  });

  test("PATCH changes the sent fields, bumps the version and writes one history row", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Patch me", oneLineConcept: "first", proposedSolution: "plan" },
    });
    const path = `/api/v1/ideas/${created.body.id}`;
    const rowsBefore = await history(eq(schema.changeHistory.targetId, created.body.id));
    const res = await call(t.app, "PATCH", path, {
      as: paolo,
      body: { oneLineConcept: "second", lockVersion: 0 },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: "Patch me",
      oneLineConcept: "second",
      proposedSolution: "plan",
      lockVersion: 1,
      updatedBy: { id: userId("paolo") },
    });
    const rows = await history(eq(schema.changeHistory.targetId, created.body.id));
    expect(rows).toHaveLength(rowsBefore.length + 1);
    const row = rows.find((r) => r.action === "update");
    expect(row).toMatchObject({
      workspaceId: BCDX,
      containerType: "idea",
      containerId: created.body.id,
      targetType: "idea",
      source: "manual",
      batchId: null,
      changedById: userId("paolo"),
      before: { name: "Patch me", oneLineConcept: "first", proposedSolution: "plan" },
      after: { name: "Patch me", oneLineConcept: "second", proposedSolution: "plan" },
    });

    const cleared = await call(t.app, "PATCH", path, {
      as: ana,
      body: { proposedSolution: null, lockVersion: 1 },
    });
    expect(cleared.body).toMatchObject({ proposedSolution: null, lockVersion: 2 });
  });

  test("a request that changes nothing writes no history and keeps the version", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Same", oneLineConcept: "c" },
    });
    const path = `/api/v1/ideas/${created.body.id}`;
    const res = await call(t.app, "PATCH", path, {
      as: ana,
      body: { name: "Same", lockVersion: 0 },
    });
    expect(res.status).toBe(200);
    expect(res.body.lockVersion).toBe(0);
    const rows = await history(eq(schema.changeHistory.targetId, created.body.id));
    expect(rows).toHaveLength(1);
  });

  test("a stale version is 409 CONFLICT with the current content; force overwrites", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Race", oneLineConcept: "mine" },
    });
    const path = `/api/v1/ideas/${created.body.id}`;
    await call(t.app, "PATCH", path, { as: kenji, body: { name: "Kenji's name", lockVersion: 0 } });

    const conflict = await call(t.app, "PATCH", path, {
      as: ana,
      body: { name: "Ana's name", lockVersion: 0 },
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe("CONFLICT");
    expect(conflict.body.error.current).toMatchObject({
      value: { name: "Kenji's name", oneLineConcept: "mine", proposedSolution: null },
      lockVersion: 1,
      updatedBy: { id: userId("kenji") },
    });
    expect(typeof conflict.body.error.current.updatedAt).toBe("string");
    expect((await call(t.app, "GET", path, { as: ana })).body.name).toBe("Kenji's name");

    const forced = await call(t.app, "PATCH", path, {
      as: ana,
      body: { name: "Ana's name", lockVersion: 0, force: true },
    });
    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ name: "Ana's name", lockVersion: 2 });
    const rows = await history(
      and(
        eq(schema.changeHistory.targetId, created.body.id),
        eq(schema.changeHistory.action, "update"),
      ),
    );
    expect(rows).toHaveLength(2);
  });

  test("Viewer cannot edit; bad bodies are 422", async () => {
    const viewer = await call(t.app, "PATCH", piaya, {
      as: grace,
      body: { name: "x", lockVersion: 0 },
    });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    expect(
      (await call(t.app, "PATCH", piaya, { as: admin, body: { name: "x", lockVersion: 0 } }))
        .status,
    ).toBe(403);
    expect(
      (await call(t.app, "PATCH", piaya, { body: { name: "x", lockVersion: 0 } })).status,
    ).toBe(401);
    for (const body of [
      { name: "x" },
      { name: "", lockVersion: 0 },
      { name: "n".repeat(101), lockVersion: 0 },
      { oneLineConcept: "c".repeat(201), lockVersion: 0 },
      { name: "x", lockVersion: -1 },
      { name: "x", lockVersion: 0, force: "yes" },
    ]) {
      const res = await call(t.app, "PATCH", piaya, { as: ana, body });
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect((await call(t.app, "GET", piaya, { as: ana })).body.name).toBe(
      "Piaya Gift Box Delivery",
    );
  });
});

describe("I4 archive and restore", () => {
  test("archive hides the idea, restore brings it back, both are idempotent", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Shelve me", oneLineConcept: "c" },
    });
    const id = created.body.id;
    const path = `/api/v1/ideas/${id}`;
    const historyBefore = await t.db.select().from(schema.changeHistory);
    const [rowBefore] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
    await Bun.sleep(5);

    const restoreFirst = await call(t.app, "POST", `${path}/restore`, { as: ana });
    expect(restoreFirst.status).toBe(200);
    expect(restoreFirst.body.archived).toBe(false);

    const archived = await call(t.app, "POST", `${path}/archive`, { as: paolo });
    expect(archived.status).toBe(200);
    expect(archived.body).toMatchObject({ id, archived: true, lockVersion: 0 });
    const [rowAfter] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
    expect(rowAfter?.archivedAt).not.toBeNull();
    expect(rowAfter?.lastActivityAt.getTime()).toBeGreaterThan(
      rowBefore?.lastActivityAt.getTime() as number,
    );
    expect(rowAfter?.updatedAt.getTime()).toBe(rowBefore?.updatedAt.getTime() as number);

    const again = await call(t.app, "POST", `${path}/archive`, { as: ana });
    expect(again.status).toBe(200);
    expect(again.body.archived).toBe(true);
    const [rowAgain] = await t.db.select().from(schema.ideas).where(eq(schema.ideas.id, id));
    expect(rowAgain?.archivedAt?.getTime()).toBe(rowAfter?.archivedAt?.getTime() as number);

    expect(
      names((await call(t.app, "GET", `${list}?decision=all`, { as: ana })).body),
    ).not.toContain("Shelve me");
    const included = await call(t.app, "GET", `${list}?includeArchived=true&q=shelve`, { as: ana });
    expect(included.body.items).toHaveLength(1);
    expect(included.body.items[0].archived).toBe(true);
    expect((await call(t.app, "GET", path, { as: grace })).body.archived).toBe(true);

    const restored = await call(t.app, "POST", `${path}/restore`, { as: kenji });
    expect(restored.body.archived).toBe(false);
    expect(names((await call(t.app, "GET", list, { as: ana })).body)).toContain("Shelve me");

    const historyAfter = await t.db.select().from(schema.changeHistory);
    expect(historyAfter.length).toBe(historyBefore.length);
  });

  test("Viewer and strangers cannot archive or restore", async () => {
    const path = `/api/v1/ideas/${ideaId("bike-repair")}`;
    for (const action of ["archive", "restore"]) {
      const viewer = await call(t.app, "POST", `${path}/${action}`, { as: grace });
      expect(viewer.status).toBe(403);
      expect(viewer.body.error.code).toBe("FORBIDDEN");
      expect((await call(t.app, "POST", `${path}/${action}`, { as: admin })).body.error.code).toBe(
        "NO_ACCESS",
      );
      expect((await call(t.app, "POST", `${path}/${action}`)).status).toBe(401);
    }
    expect(
      (
        await call(t.app, "POST", "/api/v1/ideas/6f1f3f3a-1111-4111-8111-111111111111/archive", {
          as: ana,
        })
      ).status,
    ).toBe(404);
  });

  test("an archived idea refuses PATCH with ARCHIVED but can be read and duplicated", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "Old one", oneLineConcept: "c" },
    });
    const path = `/api/v1/ideas/${created.body.id}`;
    await call(t.app, "POST", `${path}/archive`, { as: ana });
    const patch = await call(t.app, "PATCH", path, {
      as: ana,
      body: { name: "New name", lockVersion: 0 },
    });
    expect(patch.status).toBe(409);
    expect(patch.body.error.code).toBe("ARCHIVED");
    const viewerPatch = await call(t.app, "PATCH", path, {
      as: grace,
      body: { name: "x", lockVersion: 0 },
    });
    expect(viewerPatch.status).toBe(409);
    expect((await call(t.app, "GET", path, { as: ana })).status).toBe(200);
    const copy = await call(t.app, "POST", `${path}/duplicate`, { as: ana, body: {} });
    expect(copy.status).toBe(201);
    expect(copy.body).toMatchObject({ name: "Old one (copy)", archived: false });
  });
});

describe("I3 duplicate", () => {
  const countsOf = async (validationId: string) => {
    return {
      answers: await t.db
        .select()
        .from(schema.validationAnswers)
        .where(eq(schema.validationAnswers.validationId, validationId)),
      logs: await t.db
        .select()
        .from(schema.researchLogEntries)
        .where(
          and(
            eq(schema.researchLogEntries.validationId, validationId),
            isNull(schema.researchLogEntries.deletedAt),
          ),
        ),
      competitors: await t.db
        .select()
        .from(schema.competitors)
        .where(
          and(
            eq(schema.competitors.validationId, validationId),
            isNull(schema.competitors.deletedAt),
          ),
        ),
      assumptions: await t.db
        .select()
        .from(schema.assumptions)
        .where(
          and(
            eq(schema.assumptions.validationId, validationId),
            isNull(schema.assumptions.deletedAt),
          ),
        ),
      risks: await t.db
        .select()
        .from(schema.risks)
        .where(and(eq(schema.risks.validationId, validationId), isNull(schema.risks.deletedAt))),
      costs: await t.db
        .select()
        .from(schema.costItems)
        .where(
          and(eq(schema.costItems.validationId, validationId), isNull(schema.costItems.deletedAt)),
        ),
      economics: await t.db
        .select()
        .from(schema.economicsInputs)
        .where(eq(schema.economicsInputs.validationId, validationId)),
      evidence: await t.db
        .select()
        .from(schema.evidenceLinks)
        .where(
          and(
            eq(schema.evidenceLinks.validationId, validationId),
            isNull(schema.evidenceLinks.deletedAt),
          ),
        ),
    };
  };

  test("copies the validation, re-points evidence and records one batch", async () => {
    const source = await call(t.app, "GET", `/api/v1/ideas/${ideaId("piaya")}`, { as: ana });
    const before = await countsOf(source.body.validationId);
    expect(before.evidence.some((e) => e.researchLogEntryId)).toBe(true);
    expect(before.evidence.some((e) => e.url)).toBe(true);

    const res = await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, {
      as: kenji,
      body: {},
    });
    expect(res.status).toBe(201);
    const copy = res.body;
    expect(copy).toMatchObject({
      name: "Piaya Gift Box Delivery (copy)",
      oneLineConcept: source.body.oneLineConcept,
      proposedSolution: source.body.proposedSolution,
      workspaceId: BCDX,
      archived: false,
      latestDecision: null,
      stage: "validation",
      plans: [],
      lockVersion: 0,
      proposer: { id: userId("kenji") },
      duplicatedFrom: { id: ideaId("piaya"), name: "Piaya Gift Box Delivery" },
    });
    expect(copy.id).not.toBe(source.body.id);
    expect(copy.validationId).not.toBe(source.body.validationId);

    const after = await countsOf(copy.validationId);
    for (const key of Object.keys(before) as (keyof typeof before)[]) {
      expect(after[key].length, key).toBe(before[key].length);
    }
    const oldIds = new Set(
      Object.values(before).flatMap((rows) => rows.map((r: { id: string }) => r.id)),
    );
    // Keyed items (answers, economics inputs) start at 1: 0 means "no row yet" to the lock.
    const keyed = new Set<unknown>([after.answers, after.economics]);
    for (const rows of Object.values(after)) {
      for (const row of rows as { id: string; lockVersion?: number }[]) {
        expect(oldIds.has(row.id)).toBe(false);
        if (row.lockVersion !== undefined) expect(row.lockVersion).toBe(keyed.has(rows) ? 1 : 0);
      }
    }

    const newLogs = new Set(after.logs.map((l) => l.id));
    const oldLogs = new Set(before.logs.map((l) => l.id));
    const newRows = new Set([
      ...after.competitors.map((r) => r.id),
      ...after.assumptions.map((r) => r.id),
      ...after.costs.map((r) => r.id),
    ]);
    for (const link of after.evidence) {
      expect(link.workspaceId).toBe(BCDX);
      if (link.researchLogEntryId) {
        expect(newLogs.has(link.researchLogEntryId)).toBe(true);
        expect(oldLogs.has(link.researchLogEntryId)).toBe(false);
      }
      if (link.targetType === "validation_answer" || link.targetType === "economics_input") {
        expect(link.targetId).toBe(copy.validationId);
      } else {
        expect(newRows.has(link.targetId)).toBe(true);
      }
    }
    const sig = (links: typeof after.evidence) =>
      links
        .map(
          (l) =>
            `${l.targetType}|${l.targetKey}|${l.url}|${l.note}|${l.researchLogEntryId ? "log" : "url"}`,
        )
        .sort();
    expect(sig(after.evidence)).toEqual(sig(before.evidence));
    const content = (rows: typeof after.answers) =>
      rows
        .map(
          (r: {
            questionKey: string;
            text: string | null;
            fau: string | null;
            confidence: string | null;
          }) => `${r.questionKey}|${r.text}|${r.fau}|${r.confidence}`,
        )
        .sort();
    expect(content(after.answers)).toEqual(content(before.answers));

    const reread = await call(t.app, "GET", `/api/v1/ideas/${copy.id}`, { as: ana });
    const original = await call(t.app, "GET", `/api/v1/ideas/${ideaId("piaya")}`, { as: ana });
    expect(reread.body.checks).toEqual(original.body.checks);
    expect(reread.body.keyMetrics).toEqual(original.body.keyMetrics);
    const [sourceValidation] = await t.db
      .select()
      .from(schema.validations)
      .where(eq(schema.validations.id, source.body.validationId));
    const [copyValidation] = await t.db
      .select()
      .from(schema.validations)
      .where(eq(schema.validations.id, copy.validationId));
    expect(copyValidation?.templateVersionId).toBe(sourceValidation?.templateVersionId);

    const decisions = await t.db
      .select()
      .from(schema.decisionLogEntries)
      .where(eq(schema.decisionLogEntries.ideaId, copy.id));
    expect(decisions).toHaveLength(0);
    const plans = await t.db
      .select()
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.ideaId, copy.id));
    expect(plans).toHaveLength(0);

    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, copy.id));
    expect(rows).toHaveLength(1);
    const batchId = rows[0]?.batchId as string;
    expect(batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(rows[0]).toMatchObject({
      action: "create",
      source: "duplicate",
      targetType: "idea",
      targetId: copy.id,
      changedById: userId("kenji"),
    });
    const batch = await history(eq(schema.changeHistory.batchId, batchId));
    const expected =
      1 +
      before.answers.length +
      before.economics.length +
      before.logs.length +
      before.competitors.length +
      before.assumptions.length +
      before.risks.length +
      before.costs.length;
    expect(batch).toHaveLength(expected);
    expect(
      batch.every(
        (r) =>
          r.source === "duplicate" &&
          r.action === "create" &&
          r.before === null &&
          r.after !== null,
      ),
    ).toBe(true);
    expect(batch.every((r) => r.workspaceId === BCDX && r.changedById === userId("kenji"))).toBe(
      true,
    );
    const answerRow = batch.find(
      (r) => r.targetType === "validation_answer" && r.targetKey === "V.01.WHO",
    );
    expect(answerRow).toMatchObject({
      containerType: "validation",
      containerId: copy.validationId,
      targetId: copy.validationId,
    });
    const sourceAnswer = before.answers.find(
      (a: { questionKey: string }) => a.questionKey === "V.01.WHO",
    ) as { text: string };
    expect(answerRow?.after).toMatchObject({ text: sourceAnswer.text });
  });

  test("a given name is used; Drop sources can be copied; Viewer cannot", async () => {
    const named = await call(t.app, "POST", `/api/v1/ideas/${ideaId("laundry")}/duplicate`, {
      as: paolo,
      body: { name: "Laundry, version 2" },
    });
    expect(named.status).toBe(201);
    expect(named.body).toMatchObject({
      name: "Laundry, version 2",
      latestDecision: null,
      duplicatedFrom: { id: ideaId("laundry") },
    });
    const noBody = await call(t.app, "POST", `/api/v1/ideas/${ideaId("laundry")}/duplicate`, {
      as: ana,
    });
    expect(noBody.status).toBe(201);
    expect(noBody.body.name).toBe("Laundry Pickup (copy)");
    const viewer = await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, {
      as: grace,
      body: {},
    });
    expect(viewer.status).toBe(403);
    expect(
      (
        await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, {
          as: admin,
          body: {},
        })
      ).status,
    ).toBe(403);
    expect(
      (await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, { body: {} }))
        .status,
    ).toBe(401);
    const tooLong = await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya")}/duplicate`, {
      as: ana,
      body: { name: "n".repeat(101) },
    });
    expect(tooLong.status).toBe(422);
  });

  test("a long name still fits the default copy name", async () => {
    const created = await call(t.app, "POST", list, {
      as: ana,
      body: { name: "L".repeat(100), oneLineConcept: "c" },
    });
    const copy = await call(t.app, "POST", `/api/v1/ideas/${created.body.id}/duplicate`, {
      as: ana,
      body: {},
    });
    expect(copy.body.name).toHaveLength(100);
    expect(copy.body.name.endsWith(" (copy)")).toBe(true);
  });

  test("deleted research logs and the evidence that points at them are not copied", async () => {
    const source = await call(t.app, "GET", `/api/v1/ideas/${ideaId("piaya-corp")}`, { as: ana });
    const validationId = source.body.validationId as string;
    const before = await countsOf(validationId);
    const links = before.evidence.filter((e) => e.researchLogEntryId);
    expect(links.length).toBeGreaterThan(0);
    const doomed = links[0]?.researchLogEntryId as string;
    const pointing = links.filter((l) => l.researchLogEntryId === doomed).length;
    await t.db
      .update(schema.researchLogEntries)
      .set({ deletedAt: new Date() })
      .where(eq(schema.researchLogEntries.id, doomed));
    const [deletedRow] = await t.db
      .select()
      .from(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.id, doomed));
    await t.db
      .update(schema.competitors)
      .set({ deletedAt: new Date() })
      .where(
        inArray(
          schema.competitors.id,
          before.competitors.slice(0, 1).map((c) => c.id),
        ),
      );

    const copy = await call(t.app, "POST", `/api/v1/ideas/${ideaId("piaya-corp")}/duplicate`, {
      as: ana,
      body: {},
    });
    expect(copy.status).toBe(201);
    const after = await countsOf(copy.body.validationId);
    expect(after.logs).toHaveLength(before.logs.length - 1);
    expect(after.competitors).toHaveLength(before.competitors.length - 1);
    expect(
      after.logs.some(
        (l) => l.topic === deletedRow?.topic && l.observation === deletedRow?.observation,
      ),
    ).toBe(false);
    const droppedCompetitor = before.competitors[0]?.id as string;
    const lostWithCompetitor = before.evidence.filter(
      (e) => e.targetId === droppedCompetitor && e.researchLogEntryId !== doomed,
    ).length;
    expect(after.evidence).toHaveLength(before.evidence.length - pointing - lostWithCompetitor);
    for (const link of after.evidence) {
      if (link.researchLogEntryId) {
        expect(after.logs.some((l) => l.id === link.researchLogEntryId)).toBe(true);
      }
    }
  });
});
