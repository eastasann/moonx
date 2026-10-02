import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, userId } from "@moonx/db/seed";
import { and, asc, eq, isNull } from "drizzle-orm";
import { computeValidationState, loadValidationData } from "../src/lib/validation-data";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;
let piaya: string;
let bikeRepair: string;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
  piaya = await validationOf("piaya");
  bikeRepair = await validationOf("bike-repair");
});
afterAll(async () => {
  await t.close();
});

async function validationOf(key: Parameters<typeof ideaId>[0]) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  return (row as { id: string }).id;
}

const base = (vid: string) => `/api/v1/validations/${vid}`;
const history = (targetId: string) =>
  t.db
    .select()
    .from(schema.changeHistory)
    .where(eq(schema.changeHistory.targetId, targetId))
    .orderBy(asc(schema.changeHistory.changedAt));
const nonexistent = "6f1f3f3a-1111-4111-8111-111111111111";

async function setArchived(archived: boolean) {
  await t.db
    .update(schema.ideas)
    .set({ archivedAt: archived ? new Date() : null })
    .where(eq(schema.ideas.id, ideaId("piaya")));
}

const COMPETITOR_KEYS = [
  "id",
  "name",
  "type",
  "targetCustomer",
  "offering",
  "typicalPrice",
  "priceNote",
  "strength",
  "weakness",
  "whyChosen",
  "whySurvive",
  "evidence",
  "sortOrder",
  "commentCount",
  "lockVersion",
  "updatedAt",
  "updatedBy",
];

describe("V8 GET competitors", () => {
  test("returns the rows in order with evidence, patterns and guidance", async () => {
    const res = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(["guidance", "items", "patterns"]);
    expect(res.body.items).toHaveLength(4);
    expect(Object.keys(res.body.items[0]).sort()).toEqual([...COMPETITOR_KEYS].sort());
    expect(res.body.items.map((c: { sortOrder: number }) => c.sortOrder)).toEqual([0, 1, 2, 3]);
    expect(res.body.items[0]).toMatchObject({
      name: "Airport piaya shop",
      type: "direct",
      typicalPrice: 380,
      priceNote: "per box",
    });
    expect(res.body.guidance).toEqual({ min: 3, max: 5 });
    expect(res.body.patterns.map((p: { questionKey: string }) => p.questionKey)).toEqual([
      "V.04.SURVIVOR_PATTERNS",
      "V.04.FAILURE_PATTERNS",
    ]);
    for (const pattern of res.body.patterns) {
      expect(pattern).toMatchObject({ hidden: false, commentCount: expect.any(Number) });
      expect(pattern.classification).toHaveProperty("state");
    }
  });

  test("a validation without answers still returns both patterns, unsaved", async () => {
    const res = await call(t.app, "GET", `${base(bikeRepair)}/competitors`, { as: ana });
    expect(res.body.items).toEqual([]);
    for (const pattern of res.body.patterns) {
      expect(pattern).toMatchObject({
        text: null,
        lockVersion: 0,
        updatedAt: null,
        updatedBy: null,
        hidden: false,
        classification: { fau: null, confidence: null, state: "empty", evidence: [] },
      });
    }
  });

  test("a pattern answer carries its F/A/U and a row carries evidence and comments", async () => {
    const [row] = await t.db
      .select()
      .from(schema.competitors)
      .where(and(eq(schema.competitors.validationId, piaya), eq(schema.competitors.sortOrder, 1)));
    const competitor = row as NonNullable<typeof row>;
    await t.db.insert(schema.evidenceLinks).values({
      workspaceId: BCDX,
      validationId: piaya,
      targetType: "competitor",
      targetId: competitor.id,
      url: "https://example.com/mall",
      note: "price board",
      createdById: userId("ana"),
    });
    await t.db.insert(schema.comments).values([
      {
        workspaceId: BCDX,
        targetType: "competitor",
        targetId: competitor.id,
        authorId: userId("kenji"),
        body: "Check their weekend price",
      },
      {
        workspaceId: BCDX,
        targetType: "competitor",
        targetId: competitor.id,
        authorId: userId("kenji"),
        body: "deleted one",
        deletedAt: new Date(),
      },
    ]);
    await t.db
      .update(schema.validationAnswers)
      .set({ text: "Convenience", fau: "assumption", confidence: "high", lockVersion: 3 })
      .where(
        and(
          eq(schema.validationAnswers.validationId, piaya),
          eq(schema.validationAnswers.questionKey, "V.04.SURVIVOR_PATTERNS"),
        ),
      );
    const res = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana });
    const mall = res.body.items[1];
    expect(mall.id).toBe(competitor.id);
    expect(mall.commentCount).toBe(1);
    expect(mall.evidence).toEqual([
      {
        id: expect.any(String),
        kind: "url",
        researchLog: null,
        url: "https://example.com/mall",
        note: "price board",
      },
    ]);
    const survivor = res.body.patterns[0];
    expect(survivor).toMatchObject({ text: "Convenience", lockVersion: 3 });
    expect(survivor.classification).toMatchObject({
      fau: "assumption",
      confidence: "high",
      state: "assumption",
    });
  });

  test("every role reads; the Admin who is not a member, a stranger id and no session do not", async () => {
    expect((await call(t.app, "GET", `${base(piaya)}/competitors`, { as: grace })).status).toBe(
      200,
    );
    const denied = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: admin });
    expect([denied.status, denied.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect((await call(t.app, "GET", `${base(nonexistent)}/competitors`, { as: ana })).status).toBe(
      404,
    );
    expect((await call(t.app, "GET", `${base(piaya)}/competitors`)).status).toBe(401);
    expect(
      (await call(t.app, "GET", `${base("not-a-uuid")}/competitors`, { as: ana })).status,
    ).toBe(422);
  });
});

describe("V8 POST and V9 competitors", () => {
  let created: { id: string; lockVersion: number; sortOrder: number };

  test("POST appends a row at lockVersion 0 and writes a create history row", async () => {
    const res = await call(t.app, "POST", `${base(piaya)}/competitors`, {
      as: kenji,
      headers: { "x-moonx-client": "ios", "x-moonx-app-version": "99.0.0" },
      body: {
        name: "  Roadside stall ",
        type: "substitute",
        typicalPrice: 0,
        priceNote: "per pack",
      },
    });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([...COMPETITOR_KEYS].sort());
    expect(res.body).toMatchObject({
      name: "Roadside stall",
      type: "substitute",
      typicalPrice: 0,
      targetCustomer: null,
      evidence: [],
      sortOrder: 4,
      commentCount: 0,
      lockVersion: 0,
      updatedBy: { id: userId("kenji") },
    });
    created = res.body;
    const rows = await history(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "create",
      source: "manual",
      containerType: "validation",
      containerId: piaya,
      workspaceId: BCDX,
      sectionKey: "competitors",
      targetType: "competitor",
      targetKey: null,
      before: null,
      changedById: userId("kenji"),
      client: "ios",
    });
    expect(rows[0]?.after).toMatchObject({ name: "Roadside stall", typicalPrice: 0, evidence: [] });
  });

  test("POST touches the idea and the workspace activity", async () => {
    const before = new Date(Date.now() - 3600_000);
    await t.db
      .update(schema.ideas)
      .set({ lastActivityAt: before })
      .where(eq(schema.ideas.id, ideaId("piaya")));
    await call(t.app, "POST", `${base(piaya)}/competitors`, { as: ana, body: { name: "Touch" } });
    const [idea] = await t.db
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("piaya")));
    const [workspace] = await t.db
      .select()
      .from(schema.workspaces)
      .where(eq(schema.workspaces.id, BCDX));
    expect((idea?.lastActivityAt ?? before).getTime()).toBeGreaterThan(before.getTime());
    expect(
      ((workspace as NonNullable<typeof workspace>).lastActiveAt as Date).getTime(),
    ).toBeGreaterThan(before.getTime());
  });

  test("POST validates the body", async () => {
    const send = (body: unknown) =>
      call(t.app, "POST", `${base(piaya)}/competitors`, { as: ana, body });
    for (const body of [
      {},
      { name: "" },
      { name: "   " },
      { name: "x".repeat(201) },
      { name: "A", typicalPrice: -1 },
      { name: "A", type: "partner" },
      { name: "A", strength: "x".repeat(20_001) },
    ]) {
      const res = await send(body);
      expect([res.status, res.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    }
    expect((await send({ name: "x".repeat(200), strength: "y".repeat(20_000) })).status).toBe(201);
  });

  test("a Viewer, a stranger and an archived idea cannot create", async () => {
    const send = (as: Record<string, string>) =>
      call(t.app, "POST", `${base(piaya)}/competitors`, { as, body: { name: "No" } });
    expect((await send(grace)).body.error.code).toBe("FORBIDDEN");
    expect((await send(admin)).body.error.code).toBe("NO_ACCESS");
    await setArchived(true);
    const archived = await send(ana);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect((await send(grace)).body.error.code).toBe("FORBIDDEN");
    await setArchived(false);
  });

  test("PATCH changes the sent fields, bumps lockVersion and records before and after", async () => {
    const res = await call(t.app, "PATCH", `/api/v1/competitors/${created.id}`, {
      as: ana,
      body: { lockVersion: 0, strength: "Cheap", typicalPrice: 25.5, type: null },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created.id,
      name: "Roadside stall",
      strength: "Cheap",
      typicalPrice: 25.5,
      type: null,
      priceNote: "per pack",
      lockVersion: 1,
      updatedBy: { id: userId("ana") },
    });
    const updates = (await history(created.id)).filter((r) => r.action === "update");
    expect(updates).toHaveLength(1);
    expect(updates[0]?.before).toMatchObject({
      strength: null,
      typicalPrice: 0,
      type: "substitute",
    });
    expect(updates[0]?.after).toMatchObject({ strength: "Cheap", typicalPrice: 25.5, type: null });
  });

  test("a snapshot lists the active evidence ids", async () => {
    const [link] = await t.db
      .insert(schema.evidenceLinks)
      .values({
        workspaceId: BCDX,
        validationId: piaya,
        targetType: "competitor",
        targetId: created.id,
        url: "https://example.com/stall",
        createdById: userId("ana"),
      })
      .returning();
    await call(t.app, "PATCH", `/api/v1/competitors/${created.id}`, {
      as: ana,
      body: { lockVersion: 1, weakness: "Weather" },
    });
    const latest = (await history(created.id)).filter((r) => r.action === "update").at(-1);
    expect(
      ((latest as NonNullable<typeof latest>).after as { evidence: string[] }).evidence,
    ).toEqual([link?.id as string]);
    expect(
      ((latest as NonNullable<typeof latest>).before as { evidence: string[] }).evidence,
    ).toEqual([link?.id as string]);
    created.lockVersion = 2;
  });

  test("a stale lockVersion is 409 with the other person's content; force overwrites", async () => {
    const stale = await call(t.app, "PATCH", `/api/v1/competitors/${created.id}`, {
      as: kenji,
      body: { lockVersion: 0, strength: "Mine" },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(stale.body.error.current).toMatchObject({
      lockVersion: 2,
      updatedBy: { id: userId("ana") },
      value: { id: created.id, strength: "Cheap", weakness: "Weather" },
    });
    const forced = await call(t.app, "PATCH", `/api/v1/competitors/${created.id}`, {
      as: kenji,
      body: { lockVersion: 0, strength: "Mine", force: true },
    });
    expect(forced.status).toBe(200);
    expect(forced.body).toMatchObject({ strength: "Mine", lockVersion: 3 });
    created.lockVersion = 3;
  });

  test("PATCH validates, authorizes and 404s", async () => {
    const patch = (id: string, as: Record<string, string>, body: unknown) =>
      call(t.app, "PATCH", `/api/v1/competitors/${id}`, { as, body });
    expect((await patch(created.id, ana, { strength: "x" })).body.error.code).toBe(
      "VALIDATION_FAILED",
    );
    expect((await patch(created.id, ana, { lockVersion: 3, name: "" })).status).toBe(422);
    expect((await patch(created.id, ana, { lockVersion: 3, typicalPrice: -5 })).status).toBe(422);
    expect((await patch(created.id, grace, { lockVersion: 3, name: "x" })).body.error.code).toBe(
      "FORBIDDEN",
    );
    expect((await patch(created.id, admin, { lockVersion: 3, name: "x" })).body.error.code).toBe(
      "NO_ACCESS",
    );
    expect((await patch(nonexistent, ana, { lockVersion: 0 })).status).toBe(404);
    await setArchived(true);
    expect((await patch(created.id, ana, { lockVersion: 3, name: "x" })).body.error.code).toBe(
      "ARCHIVED",
    );
    await setArchived(false);
  });

  test("DELETE hides the row from the list and from the checks, and records a delete", async () => {
    const stateBefore = async () => {
      const data = (await loadValidationData(t.db, [piaya])).get(piaya);
      return computeValidationState(data as NonNullable<typeof data>, {
        workspaceId: BCDX,
        ideaId: ideaId("piaya"),
      }).checks.find((c) => c.key === "competitors");
    };
    const checkBefore = await stateBefore();
    const list = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana });
    const count = list.body.items.length;

    const denied = await call(t.app, "DELETE", `/api/v1/competitors/${created.id}`, { as: grace });
    expect(denied.status).toBe(403);
    const res = await call(t.app, "DELETE", `/api/v1/competitors/${created.id}`, { as: ana });
    expect(res.status).toBe(204);
    expect(res.body).toBeNull();

    const after = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana });
    expect(after.body.items).toHaveLength(count - 1);
    expect(after.body.items.some((c: { id: string }) => c.id === created.id)).toBe(false);
    expect((await stateBefore())?.count).toBe((checkBefore?.count ?? 0) - 1);

    const deletes = (await history(created.id)).filter((r) => r.action === "delete");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ after: null, source: "manual", changedById: userId("ana") });
    expect(deletes[0]?.before).toMatchObject({ name: "Roadside stall", strength: "Mine" });

    const again = await call(t.app, "DELETE", `/api/v1/competitors/${created.id}`, { as: ana });
    expect(again.status).toBe(404);
    const patch = await call(t.app, "PATCH", `/api/v1/competitors/${created.id}`, {
      as: ana,
      body: { lockVersion: 3, name: "Back" },
    });
    expect(patch.status).toBe(404);
  });

  test("a competitor of another validation is not reachable through a foreign id", async () => {
    const other = await call(t.app, "POST", `${base(bikeRepair)}/competitors`, {
      as: ana,
      body: { name: "Bike shop" },
    });
    const list = await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana });
    expect(list.body.items.some((c: { id: string }) => c.id === other.body.id)).toBe(false);
    expect(other.body.sortOrder).toBe(0);
  });
});

describe("V10 and V11 assumptions", () => {
  let created: { id: string };

  test("GET lists the rows in sortOrder with evidence and comment counts", async () => {
    const res = await call(t.app, "GET", `${base(piaya)}/assumptions`, { as: grace });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["items"]);
    expect(res.body.items).toHaveLength(3);
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        "id",
        "statement",
        "whyBelieve",
        "evidence",
        "evidenceNote",
        "confidence",
        "disproveCondition",
        "nextCheck",
        "sortOrder",
        "commentCount",
        "lockVersion",
        "updatedAt",
        "updatedBy",
      ].sort(),
    );
    expect(res.body.items.map((a: { sortOrder: number }) => a.sortOrder)).toEqual([0, 1, 2]);
    expect(res.body.items[0].confidence).toBe("medium");
  });

  test("POST creates at the end; the body is validated", async () => {
    const res = await call(t.app, "POST", `${base(piaya)}/assumptions`, {
      as: kenji,
      body: { statement: "Offices reorder", confidence: "low", nextCheck: "Pilot" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      statement: "Offices reorder",
      confidence: "low",
      whyBelieve: null,
      sortOrder: 3,
      lockVersion: 0,
      evidence: [],
    });
    created = res.body;
    const rows = await history(created.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "create",
      sectionKey: "assumptions_risks",
      targetType: "assumption",
      containerId: piaya,
    });
    for (const body of [{}, { statement: "" }, { statement: "A", confidence: "huge" }]) {
      const bad = await call(t.app, "POST", `${base(piaya)}/assumptions`, { as: ana, body });
      expect(bad.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(
      (
        await call(t.app, "POST", `${base(piaya)}/assumptions`, {
          as: grace,
          body: { statement: "x" },
        })
      ).status,
    ).toBe(403);
  });

  test("PATCH with lock and force, then DELETE", async () => {
    const ok = await call(t.app, "PATCH", `/api/v1/assumptions/${created.id}`, {
      as: ana,
      body: { lockVersion: 0, confidence: "high", evidenceNote: "Two calls" },
    });
    expect(ok.body).toMatchObject({
      confidence: "high",
      evidenceNote: "Two calls",
      lockVersion: 1,
    });
    const update = (await history(created.id)).find((r) => r.action === "update");
    expect(update?.before).toMatchObject({ confidence: "low", evidenceNote: null });
    expect(update?.after).toMatchObject({ confidence: "high", evidenceNote: "Two calls" });

    const stale = await call(t.app, "PATCH", `/api/v1/assumptions/${created.id}`, {
      as: kenji,
      body: { lockVersion: 0, statement: "Mine" },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.value).toMatchObject({ confidence: "high" });
    const forced = await call(t.app, "PATCH", `/api/v1/assumptions/${created.id}`, {
      as: kenji,
      body: { lockVersion: 0, statement: "Mine", force: true },
    });
    expect(forced.body).toMatchObject({ statement: "Mine", lockVersion: 2 });
    expect(
      (
        await call(t.app, "PATCH", `/api/v1/assumptions/${created.id}`, {
          as: grace,
          body: { lockVersion: 2 },
        })
      ).status,
    ).toBe(403);

    expect(
      (await call(t.app, "DELETE", `/api/v1/assumptions/${created.id}`, { as: grace })).status,
    ).toBe(403);
    expect(
      (await call(t.app, "DELETE", `/api/v1/assumptions/${created.id}`, { as: ana })).status,
    ).toBe(204);
    const list = await call(t.app, "GET", `${base(piaya)}/assumptions`, { as: ana });
    expect(list.body.items).toHaveLength(3);
    const rows = (await history(created.id)).filter((r) => r.action === "delete");
    expect(rows).toHaveLength(1);
    expect(
      (await call(t.app, "DELETE", `/api/v1/assumptions/${created.id}`, { as: ana })).status,
    ).toBe(404);
  });
});

describe("V10 and V11 risks", () => {
  const ids: string[] = [];
  const order = async () =>
    (await call(t.app, "GET", `${base(piaya)}/risks`, { as: ana })).body.items.map(
      (r: { statement: string }) => r.statement,
    );

  test("GET orders automatically: Impact, then Probability, high first", async () => {
    const res = await call(t.app, "GET", `${base(piaya)}/risks`, { as: grace });
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["items"]);
    expect(res.body.items.map((r: { statement: string }) => r.statement)).toEqual([
      "A single bakery supplies all boxes.",
      "Demand is concentrated in the holiday season.",
      "Late deliveries damage trust with offices.",
    ]);
    expect(res.body.items.every((r: { sortOrder: number | null }) => r.sortOrder == null)).toBe(
      true,
    );
    expect(Object.keys(res.body.items[0]).sort()).toEqual(
      [
        "id",
        "statement",
        "probability",
        "impact",
        "whyMatters",
        "mitigation",
        "howToValidate",
        "sortOrder",
        "commentCount",
        "lockVersion",
        "updatedAt",
        "updatedBy",
      ].sort(),
    );
  });

  test("new risks slot in by level, unset levels last, ties by age", async () => {
    const make = async (statement: string, impact?: string, probability?: string) => {
      const res = await call(t.app, "POST", `${base(piaya)}/risks`, {
        as: ana,
        body: { statement, impact, probability },
      });
      expect(res.status).toBe(201);
      expect(res.body.sortOrder).toBeNull();
      ids.push(res.body.id);
    };
    await make("R-high-high", "high", "high");
    await make("R-none");
    await make("R-high-low", "high", "low");
    await make("R-high-none", "high");
    expect(await order()).toEqual([
      "R-high-high",
      "A single bakery supplies all boxes.",
      "R-high-low",
      "R-high-none",
      "Demand is concentrated in the holiday season.",
      "Late deliveries damage trust with offices.",
      "R-none",
    ]);
    const rows = await history(ids[0] as string);
    expect(rows[0]).toMatchObject({
      action: "create",
      targetType: "risk",
      sectionKey: "assumptions_risks",
    });
  });

  test("V17 switches to a manual order; later risks join at the end", async () => {
    const list = await call(t.app, "GET", `${base(piaya)}/risks`, { as: ana });
    const reversed = list.body.items.map((r: { id: string }) => r.id).reverse();
    const res = await call(t.app, "PUT", `${base(piaya)}/risks/order`, {
      as: kenji,
      body: { ids: reversed },
    });
    expect(res.status).toBe(204);
    const after = await call(t.app, "GET", `${base(piaya)}/risks`, { as: ana });
    expect(after.body.items.map((r: { id: string }) => r.id)).toEqual(reversed);
    expect(after.body.items.map((r: { sortOrder: number }) => r.sortOrder)).toEqual(
      reversed.map((_: string, i: number) => i),
    );
    expect(after.body.items.every((r: { lockVersion: number }) => r.lockVersion === 0)).toBe(true);
    const added = await call(t.app, "POST", `${base(piaya)}/risks`, {
      as: ana,
      body: { statement: "R-last", impact: "high", probability: "high" },
    });
    expect(added.body.sortOrder).toBe(reversed.length);
    expect((await order()).at(-1)).toBe("R-last");
    ids.push(added.body.id);
  });

  test("PATCH with lock and force, level change, and DELETE", async () => {
    const id = ids[1] as string;
    const ok = await call(t.app, "PATCH", `/api/v1/risks/${id}`, {
      as: ana,
      body: { lockVersion: 0, probability: "medium", mitigation: "Buffer" },
    });
    expect(ok.body).toMatchObject({ probability: "medium", mitigation: "Buffer", lockVersion: 1 });
    const update = (await history(id)).find((r) => r.action === "update");
    expect(update?.before).toMatchObject({ probability: null, mitigation: null });
    expect(update?.after).toMatchObject({ probability: "medium", mitigation: "Buffer" });
    const stale = await call(t.app, "PATCH", `/api/v1/risks/${id}`, {
      as: kenji,
      body: { lockVersion: 0, impact: "low" },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.value).toMatchObject({ mitigation: "Buffer" });
    const forced = await call(t.app, "PATCH", `/api/v1/risks/${id}`, {
      as: kenji,
      body: { lockVersion: 0, impact: "low", force: true },
    });
    expect(forced.body).toMatchObject({ impact: "low", lockVersion: 2 });
    expect(
      (await call(t.app, "PATCH", `/api/v1/risks/${id}`, { as: grace, body: { lockVersion: 2 } }))
        .status,
    ).toBe(403);
    expect(
      (
        await call(t.app, "PATCH", `/api/v1/risks/${id}`, {
          as: ana,
          body: { lockVersion: 2, probability: "extreme" },
        })
      ).body.error.code,
    ).toBe("VALIDATION_FAILED");
    expect((await call(t.app, "DELETE", `/api/v1/risks/${id}`, { as: grace })).status).toBe(403);
    expect((await call(t.app, "DELETE", `/api/v1/risks/${id}`, { as: ana })).status).toBe(204);
    expect((await order()).includes("R-none")).toBe(false);
    expect((await history(id)).filter((r) => r.action === "delete")).toHaveLength(1);
    expect(
      (await call(t.app, "PATCH", `/api/v1/risks/${id}`, { as: ana, body: { lockVersion: 2 } }))
        .status,
    ).toBe(404);
  });
});

describe("V17 order", () => {
  const ids = async (list: string) => {
    const res = await call(t.app, "GET", `${base(piaya)}/${list}`, { as: ana });
    return res.body.items.map((r: { id: string }) => r.id) as string[];
  };
  const put = (list: string, body: unknown, as = ana, vid = piaya) =>
    call(t.app, "PUT", `${base(vid)}/${list}/order`, { as, body });

  test("competitors and assumptions are renumbered 0..n-1 without history or a version bump", async () => {
    for (const list of ["competitors", "assumptions"] as const) {
      const before = await ids(list);
      const reversed = [...before].reverse();
      const historyBefore = (await t.db.select().from(schema.changeHistory)).length;
      const res = await put(list, { ids: reversed });
      expect(res.status).toBe(204);
      expect(await ids(list)).toEqual(reversed);
      const items = (await call(t.app, "GET", `${base(piaya)}/${list}`, { as: ana })).body.items;
      expect(items.map((r: { sortOrder: number }) => r.sortOrder)).toEqual(
        reversed.map((_, i) => i),
      );
      expect((await t.db.select().from(schema.changeHistory)).length).toBe(historyBefore);
    }
  });

  test("a reorder leaves lockVersion and updatedAt alone, so an open edit does not conflict", async () => {
    const [first] = await ids("competitors");
    const before = (
      await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana })
    ).body.items.find((c: { id: string }) => c.id === first);
    await put("competitors", { ids: [...(await ids("competitors"))].reverse() });
    const after = (
      await call(t.app, "GET", `${base(piaya)}/competitors`, { as: ana })
    ).body.items.find((c: { id: string }) => c.id === first);
    expect(after.lockVersion).toBe(before.lockVersion);
    expect(after.updatedAt).toBe(before.updatedAt);
  });

  test("ids must be exactly the current ids of the list", async () => {
    const current = await ids("competitors");
    const cases: unknown[] = [
      { ids: current.slice(1) },
      { ids: [...current, nonexistent] },
      { ids: [current[0], current[0], ...current.slice(2)] },
      { ids: [...current.slice(1), nonexistent] },
      { ids: [] },
      { ids: ["nope"] },
      {},
    ];
    for (const body of cases) {
      const res = await put("competitors", body);
      expect([res.status, res.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    }
    const other = await ids("assumptions");
    expect((await put("competitors", { ids: other })).status).toBe(422);
  });

  test("a deleted row is not part of the list and an unknown list is refused", async () => {
    const created = await call(t.app, "POST", `${base(piaya)}/assumptions`, {
      as: ana,
      body: { statement: "Temp" },
    });
    await call(t.app, "DELETE", `/api/v1/assumptions/${created.body.id}`, { as: ana });
    const current = await ids("assumptions");
    expect(current).not.toContain(created.body.id);
    expect((await put("assumptions", { ids: [...current, created.body.id] })).status).toBe(422);
    expect((await put("assumptions", { ids: current })).status).toBe(204);
    const unknown = await put("research-log", { ids: [] });
    expect([unknown.status, unknown.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
  });

  test("an empty list is reordered by an empty ids", async () => {
    expect((await put("assumptions", { ids: [] }, ana, bikeRepair)).status).toBe(204);
  });

  test("Viewer, stranger, archived idea and a missing validation", async () => {
    const current = await ids("competitors");
    expect((await put("competitors", { ids: current }, grace)).body.error.code).toBe("FORBIDDEN");
    expect((await put("competitors", { ids: current }, admin)).body.error.code).toBe("NO_ACCESS");
    expect((await put("competitors", { ids: current }, ana, nonexistent)).status).toBe(404);
    expect(
      (await call(t.app, "PUT", `${base(piaya)}/competitors/order`, { body: { ids: current } }))
        .status,
    ).toBe(401);
    await setArchived(true);
    expect((await put("competitors", { ids: current })).body.error.code).toBe("ARCHIVED");
    await setArchived(false);
  });

  test("another workspace's rows are never listed", async () => {
    const mine = await ids("competitors");
    const rows = await t.db
      .select({ id: schema.competitors.id })
      .from(schema.competitors)
      .where(
        and(eq(schema.competitors.validationId, bikeRepair), isNull(schema.competitors.deletedAt)),
      );
    for (const row of rows) expect(mine).not.toContain(row.id);
  });
});
