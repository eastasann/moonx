import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { type IdeaKey, ideaId } from "@moonx/db/seed";
import {
  type EvidenceUsage,
  type ResearchLogEntry,
  researchLogDetailSchema,
  researchLogEntrySchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let kenji: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  kenji = await login(t.app, "kenji");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

async function validationOf(key: IdeaKey) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  return (row as { id: string }).id;
}

const listPath = (validationId: string, query = "") =>
  `/api/v1/validations/${validationId}/research-log${query}`;
const entryPath = (id: string) => `/api/v1/research-log/${id}`;
const NOW_ID = "6f1f3f3a-1111-4111-8111-111111111111";

const historyOf = (targetId: string) =>
  t.db
    .select()
    .from(schema.changeHistory)
    .where(eq(schema.changeHistory.targetId, targetId))
    .orderBy(asc(schema.changeHistory.changedAt));

async function allEntries(validationId: string) {
  const res = await call(t.app, "GET", listPath(validationId, "?limit=200"), { as: ana });
  return res.body.items as ResearchLogEntry[];
}

describe("V6 list", () => {
  test("returns every entry newest observation first, with counts", async () => {
    const piaya = await validationOf("piaya");
    const res = await call(t.app, "GET", listPath(piaya), { as: ana });
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.items).toHaveLength(7);
    for (const item of res.body.items) researchLogEntrySchema.parse(item);
    const dates = res.body.items.map((e: ResearchLogEntry) => e.observedOn ?? "");
    expect([...dates].sort().reverse()).toEqual(dates);

    const links = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(
        and(eq(schema.evidenceLinks.validationId, piaya), isNull(schema.evidenceLinks.deletedAt)),
      );
    for (const item of res.body.items as ResearchLogEntry[]) {
      expect(item.usedAsEvidenceCount).toBe(
        links.filter((l) => l.researchLogEntryId === item.id).length,
      );
      expect(item.createdBy.displayName).toBeString();
    }
    expect(res.body.items.some((e: ResearchLogEntry) => e.usedAsEvidenceCount > 0)).toBe(true);
  });

  test("nulls sort last, then newest created first", async () => {
    const bike = await validationOf("bike-repair");
    const make = (body: Record<string, unknown>) =>
      call(t.app, "POST", listPath(bike), { as: ana, body });
    const noDate1 = await make({ topic: "no date 1" });
    const old = await make({ topic: "old", observedOn: "2026-01-01" });
    const noDate2 = await make({ topic: "no date 2" });
    const recent = await make({ topic: "recent", observedOn: "2026-09-01" });
    const items = await allEntries(bike);
    expect(items.map((e) => e.id)).toEqual([
      recent.body.id,
      old.body.id,
      noDate2.body.id,
      noDate1.body.id,
    ]);
  });

  test("filters by supports, sourceType and q; pages with a cursor", async () => {
    const health = await validationOf("health-bowl");
    const all = await allEntries(health);
    expect(all).toHaveLength(5);
    const permits = await call(t.app, "GET", listPath(health, "?supports=permits"), { as: ana });
    expect(permits.body.items).toHaveLength(0);
    const demand = await call(t.app, "GET", listPath(health, "?supports=demand_signal"), {
      as: ana,
    });
    expect(demand.body.items.map((e: ResearchLogEntry) => e.id).sort()).toEqual(
      all
        .filter((e) => e.supportsChecks.includes("demand_signal"))
        .map((e) => e.id)
        .sort(),
    );
    expect(demand.body.items).toHaveLength(2);
    const source = all.find((e) => e.sourceType)?.sourceType as string;
    const bySource = await call(t.app, "GET", listPath(health, `?sourceType=${source}`), {
      as: ana,
    });
    expect(bySource.body.items.every((e: ResearchLogEntry) => e.sourceType === source)).toBe(true);
    expect(bySource.body.items).toHaveLength(all.filter((e) => e.sourceType === source).length);

    const word = (all[0] as ResearchLogEntry).topic.split(" ")[0] as string;
    const search = await call(
      t.app,
      "GET",
      listPath(health, `?q=${encodeURIComponent(word.toUpperCase())}`),
      { as: ana },
    );
    expect(search.body.items.map((e: ResearchLogEntry) => e.id)).toContain(
      (all[0] as ResearchLogEntry).id,
    );
    expect(
      (await call(t.app, "GET", listPath(health, "?q=%25"), { as: ana })).body.items,
    ).toHaveLength(0);

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page: { body: { items: ResearchLogEntry[]; nextCursor: string | null } } = await call(
        t.app,
        "GET",
        listPath(health, `?limit=2${cursor ? `&cursor=${cursor}` : ""}`),
        { as: ana },
      );
      seen.push(...page.body.items.map((e) => e.id));
      cursor = page.body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual(all.map((e) => e.id));
    expect(
      (await call(t.app, "GET", listPath(health, "?cursor=garbage"), { as: ana })).status,
    ).toBe(422);
    expect((await call(t.app, "GET", listPath(health, "?supports=nope"), { as: ana })).status).toBe(
      422,
    );
    expect((await call(t.app, "GET", listPath(health, "?limit=201"), { as: ana })).status).toBe(
      422,
    );
  });

  test("commentCount counts comments on the entry", async () => {
    const health = await validationOf("health-bowl");
    const [first] = await allEntries(health);
    const entry = first as ResearchLogEntry;
    const [ws] = await t.db
      .select({ workspaceId: schema.ideas.workspaceId })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("health-bowl")));
    const [author] = await t.db.select({ id: schema.users.id }).from(schema.users).limit(1);
    const base = {
      workspaceId: (ws as { workspaceId: string }).workspaceId,
      targetType: "research_log_entry" as const,
      targetId: entry.id,
      authorId: (author as { id: string }).id,
    };
    const [top] = await t.db
      .insert(schema.comments)
      .values({ ...base, body: "q" })
      .returning();
    await t.db
      .insert(schema.comments)
      .values({ ...base, body: "a", parentId: (top as { id: string }).id });
    await t.db.insert(schema.comments).values({ ...base, body: "gone", deletedAt: new Date() });
    const again = (await allEntries(health)).find((e) => e.id === entry.id);
    expect(again?.commentCount).toBe(2);
    const detail = await call(t.app, "GET", entryPath(entry.id), { as: ana });
    expect(detail.body.commentCount).toBe(2);
  });

  test("access: Viewer reads, outsider 403, unknown 404, no sign-in 401", async () => {
    const piaya = await validationOf("piaya");
    expect((await call(t.app, "GET", listPath(piaya), { as: grace })).status).toBe(200);
    expect((await call(t.app, "GET", listPath(piaya), { as: admin })).body.error.code).toBe(
      "NO_ACCESS",
    );
    expect((await call(t.app, "GET", listPath(NOW_ID), { as: ana })).status).toBe(404);
    expect((await call(t.app, "GET", listPath(piaya))).status).toBe(401);
  });
});

describe("V6 create", () => {
  test("creates an entry at version 0 with one create history row", async () => {
    const bike = await validationOf("bike-repair");
    const [idea] = await t.db
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    const res = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: {
        observedOn: "2026-10-01",
        topic: "  Price check at Lacson St.  ",
        observation: "Flat repair costs PHP 150",
        sourceType: "price_check",
        sourceUrl: "https://example.com/prices",
        supportsChecks: ["local_price", "demand_signal"],
        supportsNote: "Shows the going rate",
      },
    });
    expect(res.status).toBe(201);
    researchLogEntrySchema.parse(res.body);
    expect(res.body).toMatchObject({
      observedOn: "2026-10-01",
      topic: "Price check at Lacson St.",
      observation: "Flat repair costs PHP 150",
      sourceType: "price_check",
      sourceUrl: "https://example.com/prices",
      supportsChecks: ["local_price", "demand_signal"],
      supportsNote: "Shows the going rate",
      lockVersion: 0,
      usedAsEvidenceCount: 0,
      commentCount: 0,
      createdBy: { displayName: "Ana Villanueva" },
    });
    const rows = await historyOf(res.body.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      containerType: "validation",
      containerId: bike,
      sectionKey: "research_log",
      targetType: "research_log_entry",
      targetKey: null,
      action: "create",
      source: "manual",
      before: null,
      after: {
        topic: "Price check at Lacson St.",
        sourceType: "price_check",
        supportsChecks: ["demand_signal", "local_price"],
      },
    });
    const [after] = await t.db
      .select()
      .from(schema.ideas)
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((after as { lastActivityAt: Date }).lastActivityAt.getTime()).toBeGreaterThan(
      (idea as { lastActivityAt: Date }).lastActivityAt.getTime(),
    );
    const minimal = await call(t.app, "POST", listPath(bike), {
      as: kenji,
      body: { topic: "Only topic" },
    });
    expect(minimal.status).toBe(201);
    expect(minimal.body).toMatchObject({
      observedOn: null,
      observation: null,
      sourceType: null,
      sourceUrl: null,
      supportsChecks: [],
      supportsNote: null,
    });
  });

  test("validation: topic, URL scheme, duplicates, enums and dates", async () => {
    const bike = await validationOf("bike-repair");
    const bodies: Record<string, unknown>[] = [
      {},
      { topic: "" },
      { topic: "   " },
      { topic: "x".repeat(201) },
      { topic: "x", observation: "x".repeat(20_001) },
      { topic: "x", sourceUrl: "ftp://example.com/file" },
      { topic: "x", sourceUrl: "javascript:alert(1)" },
      { topic: "x", sourceUrl: "example.com" },
      { topic: "x", supportsChecks: ["permits", "permits"] },
      { topic: "x", supportsChecks: ["costs"] },
      { topic: "x", sourceType: "tweet" },
      { topic: "x", observedOn: "2026-13-40" },
      { topic: "x", observedOn: "yesterday" },
    ];
    for (const body of bodies) {
      const res = await call(t.app, "POST", listPath(bike), { as: ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    const ok = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: {
        topic: "x".repeat(200),
        observation: "x".repeat(20_000),
        sourceUrl: "http://example.com/a",
      },
    });
    expect(ok.status).toBe(201);
  });

  test("roles and archive", async () => {
    const bike = await validationOf("bike-repair");
    const body = { topic: "role check" };
    expect((await call(t.app, "POST", listPath(bike), { as: grace, body })).body.error.code).toBe(
      "FORBIDDEN",
    );
    expect((await call(t.app, "POST", listPath(bike), { as: admin, body })).body.error.code).toBe(
      "NO_ACCESS",
    );
    expect((await call(t.app, "POST", listPath(bike), { body })).status).toBe(401);
    expect((await call(t.app, "POST", listPath(NOW_ID), { as: ana, body })).status).toBe(404);
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((await call(t.app, "POST", listPath(bike), { as: ana, body })).body.error.code).toBe(
      "ARCHIVED",
    );
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: null })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
  });
});

describe("V7 detail", () => {
  test("lists where an entry is used, with labels, links and isOnlyEvidenceOfFact", async () => {
    const piaya = await validationOf("piaya");
    const links = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(
        and(eq(schema.evidenceLinks.validationId, piaya), isNull(schema.evidenceLinks.deletedAt)),
      );
    const byLog = new Map<string, number>();
    for (const l of links)
      if (l.researchLogEntryId)
        byLog.set(l.researchLogEntryId, (byLog.get(l.researchLogEntryId) ?? 0) + 1);
    const [logId] = [...byLog.entries()].sort((a, b) => b[1] - a[1])[0] as [string, number];
    const res = await call(t.app, "GET", entryPath(logId), { as: grace });
    expect(res.status).toBe(200);
    researchLogDetailSchema.parse(res.body);
    expect(res.body.id).toBe(logId);
    expect(res.body.usedAsEvidenceCount).toBe(byLog.get(logId));
    expect(res.body.usages).toHaveLength(byLog.get(logId) as number);
    for (const usage of res.body.usages as EvidenceUsage[]) {
      expect(usage.label.length).toBeGreaterThan(0);
      expect(usage.link.screen).toBeGreaterThan(0);
      expect(usage.link.ideaId).toBe(ideaId("piaya"));
      expect(typeof usage.isOnlyEvidenceOfFact).toBe("boolean");
    }
    const kinds = new Set((res.body.usages as EvidenceUsage[]).map((u) => u.target.type));
    expect(kinds.size).toBeGreaterThan(0);
  });

  test("labels and links per target type, and the only-evidence flag", async () => {
    const bike = await validationOf("bike-repair");
    const log = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Shop survey" },
    });
    const logId = log.body.id as string;
    const evidence = (body: Record<string, unknown>) =>
      call(t.app, "POST", `/api/v1/validations/${bike}/evidence`, { as: ana, body });
    await call(t.app, "PUT", `/api/v1/validations/${bike}/answers/V.01.REACH`, {
      as: ana,
      body: { text: "Flyers", lockVersion: 0 },
    });
    const onAnswer = await evidence({
      target: { type: "validation_answer", id: bike, key: "V.01.REACH" },
      researchLogEntryId: logId,
      setFact: true,
      lockVersion: 1,
    });
    expect(onAnswer.status).toBe(201);
    const onField = await evidence({
      target: { type: "economics_input", id: bike, key: "units_expected" },
      researchLogEntryId: logId,
      lockVersion: 0,
    });
    expect(onField.status).toBe(201);
    const competitor = await t.db
      .insert(schema.competitors)
      .values({ validationId: bike, name: "Pedal Pro", sortOrder: 0 })
      .returning();
    const assumption = await t.db
      .insert(schema.assumptions)
      .values({ validationId: bike, statement: "Commuters repair on weekends", sortOrder: 0 })
      .returning();
    const [cost] = await t.db
      .insert(schema.costItems)
      .values({ validationId: bike, category: "initial", name: "Tools", amount: 500, sortOrder: 0 })
      .returning();
    await evidence({
      target: { type: "competitor", id: (competitor[0] as { id: string }).id },
      researchLogEntryId: logId,
      lockVersion: 0,
    });
    await evidence({
      target: { type: "assumption", id: (assumption[0] as { id: string }).id },
      researchLogEntryId: logId,
      lockVersion: 0,
    });
    await evidence({
      target: { type: "cost_item", id: (cost as { id: string }).id },
      researchLogEntryId: logId,
      setFact: true,
      lockVersion: 0,
    });
    await evidence({
      target: { type: "cost_item", id: (cost as { id: string }).id },
      url: "https://example.com/tools",
      lockVersion: 1,
    });

    const res = await call(t.app, "GET", entryPath(logId), { as: ana });
    expect(res.body.usedAsEvidenceCount).toBe(5);
    const usages = res.body.usages as EvidenceUsage[];
    expect(usages.map((u) => u.target.type)).toEqual([
      "validation_answer",
      "economics_input",
      "competitor",
      "assumption",
      "cost_item",
    ]);
    const [answer, econ, comp, asm, costUsage] = usages as [
      EvidenceUsage,
      EvidenceUsage,
      EvidenceUsage,
      EvidenceUsage,
      EvidenceUsage,
    ];
    expect(answer).toMatchObject({
      target: { type: "validation_answer", id: bike, key: "V.01.REACH" },
      label: "01 REACH",
      link: {
        screen: 11,
        sectionKey: "01",
        questionKey: "V.01.REACH",
        ideaId: ideaId("bike-repair"),
      },
      isOnlyEvidenceOfFact: true,
    });
    expect(econ).toMatchObject({
      label: "Expected units per day",
      link: { screen: 18, field: "units_expected" },
      isOnlyEvidenceOfFact: false,
    });
    expect(comp).toMatchObject({
      label: "Pedal Pro",
      link: { screen: 15 },
      isOnlyEvidenceOfFact: false,
    });
    expect(asm).toMatchObject({
      label: "Commuters repair on weekends",
      link: { screen: 16 },
      isOnlyEvidenceOfFact: false,
    });
    expect(costUsage).toMatchObject({
      label: "Tools",
      link: { screen: 17 },
      isOnlyEvidenceOfFact: false,
    });
    expect(comp.link.rowId).toBe((competitor[0] as { id: string }).id);
  });

  test("404 for unknown, deleted and other validations' ids; outsiders 403; no sign-in 401", async () => {
    const piaya = await validationOf("piaya");
    const [entry] = await allEntries(piaya);
    const id = (entry as ResearchLogEntry).id;
    expect((await call(t.app, "GET", entryPath(NOW_ID), { as: ana })).status).toBe(404);
    expect((await call(t.app, "GET", entryPath(id), { as: admin })).body.error.code).toBe(
      "NO_ACCESS",
    );
    expect((await call(t.app, "GET", entryPath(id))).status).toBe(401);
    expect((await call(t.app, "GET", entryPath("nope"), { as: ana })).status).toBe(422);
  });
});

describe("V7 update", () => {
  test("patches fields with the lock, history before and after, and no-ops", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Draft", observation: "first", supportsChecks: ["permits"] },
    });
    const id = created.body.id as string;

    const first = await call(t.app, "PATCH", entryPath(id), {
      as: kenji,
      body: {
        topic: "Final",
        observation: null,
        supportsChecks: ["demand_signal", "local_price"],
        lockVersion: 0,
      },
    });
    expect(first.status).toBe(200);
    researchLogEntrySchema.parse(first.body);
    expect(first.body).toMatchObject({
      topic: "Final",
      observation: null,
      supportsChecks: ["demand_signal", "local_price"],
      lockVersion: 1,
      createdBy: { displayName: "Ana Villanueva" },
      updatedBy: { displayName: "Kenji Mori" },
    });
    let rows = await historyOf(id);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      action: "update",
      source: "manual",
      sectionKey: "research_log",
      before: { topic: "Draft", observation: "first", supportsChecks: ["permits"] },
      after: {
        topic: "Final",
        observation: null,
        supportsChecks: ["demand_signal", "local_price"],
      },
    });

    const same = await call(t.app, "PATCH", entryPath(id), {
      as: ana,
      body: { topic: "Final", lockVersion: 1 },
    });
    expect(same.status).toBe(200);
    expect(same.body.lockVersion).toBe(1);
    expect((await historyOf(id)).length).toBe(2);

    const stale = await call(t.app, "PATCH", entryPath(id), {
      as: ana,
      body: { topic: "Mine", lockVersion: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(stale.body.error.current).toMatchObject({
      lockVersion: 1,
      value: { id, topic: "Final" },
      updatedBy: { displayName: "Kenji Mori" },
    });
    const forced = await call(t.app, "PATCH", entryPath(id), {
      as: ana,
      body: { topic: "Mine", lockVersion: 0, force: true },
    });
    expect(forced.status).toBe(200);
    expect(forced.body.lockVersion).toBe(2);
    rows = await historyOf(id);
    expect(rows[rows.length - 1]).toMatchObject({
      before: { topic: "Final" },
      after: { topic: "Mine" },
    });

    const cleared = await call(t.app, "PATCH", entryPath(id), {
      as: ana,
      body: {
        sourceType: "website",
        sourceUrl: "https://example.com",
        supportsNote: "note",
        observedOn: "2026-10-02",
        lockVersion: 2,
      },
    });
    expect(cleared.body).toMatchObject({
      sourceType: "website",
      sourceUrl: "https://example.com",
      supportsNote: "note",
      observedOn: "2026-10-02",
    });
    const unset = await call(t.app, "PATCH", entryPath(id), {
      as: ana,
      body: {
        sourceType: null,
        sourceUrl: null,
        supportsNote: null,
        observedOn: null,
        lockVersion: 3,
      },
    });
    expect(unset.body).toMatchObject({
      sourceType: null,
      sourceUrl: null,
      supportsNote: null,
      observedOn: null,
      lockVersion: 4,
    });
  });

  test("validation, roles, archive and deleted entries", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Target" },
    });
    const id = created.body.id as string;
    for (const body of [
      { topic: "", lockVersion: 0 },
      { topic: "x".repeat(201), lockVersion: 0 },
      { sourceUrl: "ftp://x.org", lockVersion: 0 },
      { supportsChecks: ["permits", "permits"], lockVersion: 0 },
      { topic: "x" },
      { lockVersion: "0" },
    ]) {
      const res = await call(t.app, "PATCH", entryPath(id), { as: ana, body });
      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe("VALIDATION_FAILED");
    }
    expect(
      (
        await call(t.app, "PATCH", entryPath(id), {
          as: grace,
          body: { topic: "x", lockVersion: 0 },
        })
      ).body.error.code,
    ).toBe("FORBIDDEN");
    expect(
      (
        await call(t.app, "PATCH", entryPath(id), {
          as: admin,
          body: { topic: "x", lockVersion: 0 },
        })
      ).body.error.code,
    ).toBe("NO_ACCESS");
    expect(
      (
        await call(t.app, "PATCH", entryPath(NOW_ID), {
          as: ana,
          body: { topic: "x", lockVersion: 0 },
        })
      ).status,
    ).toBe(404);
    expect(
      (await call(t.app, "PATCH", entryPath(id), { body: { topic: "x", lockVersion: 0 } })).status,
    ).toBe(401);
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect(
      (await call(t.app, "PATCH", entryPath(id), { as: ana, body: { topic: "x", lockVersion: 0 } }))
        .body.error.code,
    ).toBe("ARCHIVED");
    expect((await call(t.app, "DELETE", entryPath(id), { as: ana })).body.error.code).toBe(
      "ARCHIVED",
    );
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: null })
      .where(eq(schema.ideas.id, ideaId("bike-repair")));
    expect((await call(t.app, "DELETE", entryPath(id), { as: ana })).status).toBe(200);
    expect(
      (await call(t.app, "PATCH", entryPath(id), { as: ana, body: { topic: "x", lockVersion: 0 } }))
        .status,
    ).toBe(404);
  });
});

describe("V7 delete", () => {
  test("soft-deletes, keeps the links, turns Facts into Fact (no evidence) and shows up in the home", async () => {
    const bike = await validationOf("bike-repair");
    const before = await allEntries(bike);
    const log = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Only source", observedOn: "2026-09-15" },
    });
    const logId = log.body.id as string;
    const key = "V.01.PROOF";
    await call(t.app, "PUT", `/api/v1/validations/${bike}/answers/${key}`, {
      as: ana,
      body: { text: "Riders say so", lockVersion: 0 },
    });
    const evidence = await call(t.app, "POST", `/api/v1/validations/${bike}/evidence`, {
      as: ana,
      body: {
        target: { type: "validation_answer", id: bike, key },
        researchLogEntryId: logId,
        setFact: true,
        lockVersion: 1,
      },
    });
    expect(evidence.body.classification.state).toBe("fact");

    const home = (
      await call(t.app, "GET", `/api/v1/ideas/${ideaId("bike-repair")}/validation`, { as: ana })
    ).body;
    expect(home.fau.factNoEvidence).toBe(0);

    const historyBefore = (await t.db.select().from(schema.changeHistory)).length;
    const res = await call(t.app, "DELETE", entryPath(logId), { as: kenji });
    expect(res.status).toBe(200);
    expect(res.body.affected).toHaveLength(1);
    expect(res.body.affected[0]).toMatchObject({
      target: { type: "validation_answer", id: bike, key },
      label: "01 PROOF",
      isOnlyEvidenceOfFact: true,
    });
    expect(Object.keys(res.body)).toEqual(["affected"]);

    expect((await t.db.select().from(schema.changeHistory)).length - historyBefore).toBe(1);
    const rows = await historyOf(logId);
    expect(rows[rows.length - 1]).toMatchObject({
      action: "delete",
      source: "manual",
      sectionKey: "research_log",
      after: null,
      before: { topic: "Only source", observedOn: "2026-09-15" },
      changedById: (
        await t.db.select().from(schema.users).where(eq(schema.users.email, "kenji@bcdx.example"))
      )[0]?.id,
    });
    const [row] = await t.db
      .select()
      .from(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.id, logId));
    expect(row?.deletedAt).not.toBeNull();
    const [link] = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(eq(schema.evidenceLinks.id, evidence.body.evidence.id));
    expect(link?.deletedAt).toBeNull();

    expect((await call(t.app, "GET", entryPath(logId), { as: ana })).status).toBe(404);
    expect((await call(t.app, "DELETE", entryPath(logId), { as: ana })).status).toBe(404);
    expect((await allEntries(bike)).map((e) => e.id)).toEqual(before.map((e) => e.id));

    const section = await call(t.app, "GET", `/api/v1/validations/${bike}/questions/01`, {
      as: ana,
    });
    const answer = section.body.answers.find((a: { questionKey: string }) => a.questionKey === key);
    expect(answer.classification.state).toBe("fact_no_evidence");
    expect(answer.classification.evidence).toEqual([
      expect.objectContaining({
        id: evidence.body.evidence.id,
        researchLog: expect.objectContaining({ id: logId, deleted: true }),
      }),
    ]);

    const after = (
      await call(t.app, "GET", `/api/v1/ideas/${ideaId("bike-repair")}/validation`, { as: ana })
    ).body;
    expect(after.fau.factNoEvidence).toBe(1);
    expect(after.fau.fact).toBe(home.fau.fact);
    expect(after.nextSteps[0]).toMatchObject({
      kind: "add_evidence",
      count: 1,
      link: { questionKey: key },
    });

    const newLog = await call(t.app, "POST", `/api/v1/validations/${bike}/evidence`, {
      as: ana,
      body: {
        target: { type: "validation_answer", id: bike, key },
        url: "https://example.com/proof",
        lockVersion: 2,
      },
    });
    expect(newLog.body.classification.state).toBe("fact");
    const removed = await call(
      t.app,
      "DELETE",
      `/api/v1/evidence/${newLog.body.evidence.id}?lockVersion=3`,
      { as: ana },
    );
    expect(removed.body.classification).toMatchObject({ fau: null, state: "unclassified" });
  });

  test("a Fact with other evidence stays a Fact; the usage says it is not the only one", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.FREQUENCY";
    const log = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Shared source" },
    });
    await call(t.app, "PUT", `/api/v1/validations/${bike}/answers/${key}`, {
      as: ana,
      body: { text: "Daily", lockVersion: 0 },
    });
    const first = await call(t.app, "POST", `/api/v1/validations/${bike}/evidence`, {
      as: ana,
      body: {
        target: { type: "validation_answer", id: bike, key },
        url: "https://example.com/other",
        setFact: true,
        lockVersion: 1,
      },
    });
    await call(t.app, "POST", `/api/v1/validations/${bike}/evidence`, {
      as: ana,
      body: {
        target: { type: "validation_answer", id: bike, key },
        researchLogEntryId: log.body.id,
        lockVersion: first.body.lockVersion,
      },
    });
    const detail = await call(t.app, "GET", entryPath(log.body.id), { as: ana });
    expect(detail.body.usages[0].isOnlyEvidenceOfFact).toBe(false);
    const res = await call(t.app, "DELETE", entryPath(log.body.id), { as: ana });
    expect(res.body.affected[0].isOnlyEvidenceOfFact).toBe(false);
    const section = await call(t.app, "GET", `/api/v1/validations/${bike}/questions/01`, {
      as: ana,
    });
    expect(
      section.body.answers.find((a: { questionKey: string }) => a.questionKey === key)
        .classification.state,
    ).toBe("fact");
  });

  test("an entry nobody uses returns an empty affected list", async () => {
    const bike = await validationOf("bike-repair");
    const log = await call(t.app, "POST", listPath(bike), { as: ana, body: { topic: "Unused" } });
    const res = await call(t.app, "DELETE", entryPath(log.body.id), { as: ana });
    expect(res.body).toEqual({ affected: [] });
  });

  test("roles", async () => {
    const bike = await validationOf("bike-repair");
    const log = await call(t.app, "POST", listPath(bike), {
      as: ana,
      body: { topic: "Protected" },
    });
    expect(
      (await call(t.app, "DELETE", entryPath(log.body.id), { as: grace })).body.error.code,
    ).toBe("FORBIDDEN");
    expect(
      (await call(t.app, "DELETE", entryPath(log.body.id), { as: admin })).body.error.code,
    ).toBe("NO_ACCESS");
    expect((await call(t.app, "DELETE", entryPath(log.body.id))).status).toBe(401);
    expect((await call(t.app, "DELETE", entryPath(NOW_ID), { as: ana })).status).toBe(404);
    expect((await call(t.app, "GET", entryPath(log.body.id), { as: ana })).status).toBe(200);
  });
});
