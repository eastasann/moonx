import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { type IdeaKey, ideaId, planId, seedDemo, userId } from "@moonx/db/seed";
import { type HistoryEntry, historyEntrySchema } from "@moonx/schemas";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let as: Record<"ana" | "kenji" | "paolo" | "grace" | "admin", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  as = {
    ana: await login(t.app, "ana"),
    kenji: await login(t.app, "kenji"),
    paolo: await login(t.app, "paolo"),
    grace: await login(t.app, "grace"),
    admin: await login(t.app, "admin"),
  };
});
afterAll(async () => {
  await t.close();
});
beforeEach(async () => {
  await seedDemo(t.db);
});

const MISSING = "6f1f3f3a-1111-4111-8111-111111111111";

async function validationOf(key: IdeaKey) {
  const [row] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  return (row as { id: string }).id;
}

const selfAnalysisOf = async (person: "ana" | "kenji" | "paolo") => {
  const [row] = await t.db
    .select({ id: schema.selfAnalyses.id })
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.userId, userId(person)));
  return (row as { id: string }).id;
};

const answerPath = (validationId: string, key: string) =>
  `/api/v1/validations/${validationId}/answers/${key}`;

const putAnswer = (
  validationId: string,
  key: string,
  body: Record<string, unknown>,
  who = as.ana,
) => call(t.app, "PUT", answerPath(validationId, key), { as: who, body });

const getAnswer = async (validationId: string, key: string) => {
  const section = key.split(".")[1] as string;
  const res = await call(t.app, "GET", `/api/v1/validations/${validationId}/questions/${section}`, {
    as: as.ana,
  });
  return res.body.answers.find((a: { questionKey: string }) => a.questionKey === key);
};

/** Item history through H1. */
const itemHistory = (
  type: string,
  id: string,
  key: string | null = null,
  who = as.ana,
  extra = "",
) =>
  call(
    t.app,
    "GET",
    `/api/v1/history?targetType=${type}&targetId=${id}${key ? `&targetKey=${key}` : ""}${extra}`,
    { as: who },
  );

const screenHistory = (type: string, id: string, who = as.ana, extra = "") =>
  call(t.app, "GET", `/api/v1/history?containerType=${type}&containerId=${id}${extra}`, {
    as: who,
  });

const revert = (entryId: string, who = as.ana) =>
  call(t.app, "POST", `/api/v1/history/${entryId}/revert`, { as: who });
const revertBatch = (batchId: string, who = as.ana) =>
  call(t.app, "POST", `/api/v1/history/batches/${batchId}/revert`, { as: who });

const rowsOf = (type: string, id: string, key: string | null = null) =>
  t.db
    .select()
    .from(schema.changeHistory)
    .where(
      and(
        eq(schema.changeHistory.targetType, type as "validation_answer"),
        eq(schema.changeHistory.targetId, id),
        key ? eq(schema.changeHistory.targetKey, key) : undefined,
      ),
    )
    .orderBy(asc(schema.changeHistory.changedAt), asc(schema.changeHistory.id));

const archiveIdea = (key: IdeaKey) =>
  t.db
    .update(schema.ideas)
    .set({ archivedAt: new Date() })
    .where(eq(schema.ideas.id, ideaId(key)));

/** Writes three versions of one answer and returns the history entries, oldest first. */
async function threeVersions(validationId: string, key = "V.01.WHY_THEM") {
  expect((await putAnswer(validationId, key, { text: "one", lockVersion: 0 })).status).toBe(200);
  expect(
    (await putAnswer(validationId, key, { text: "two", lockVersion: 1 }, as.kenji)).status,
  ).toBe(200);
  expect((await putAnswer(validationId, key, { text: "three", lockVersion: 2 })).status).toBe(200);
  const res = await itemHistory("validation_answer", validationId, key);
  return (res.body.items as HistoryEntry[]).toReversed();
}

describe("H1 GET /history, one item", () => {
  test("lists the entries of an item newest first in the HistoryEntry form", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.WHY_THEM";
    await threeVersions(bike, key);
    const res = await itemHistory("validation_answer", bike, key);
    expect(res.status).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    const items = res.body.items as HistoryEntry[];
    for (const item of items) historyEntrySchema.parse(item);
    expect(items.map((e) => [e.action, e.after])).toEqual([
      ["update", expect.objectContaining({ text: "three" })],
      ["update", expect.objectContaining({ text: "two" })],
      ["create", expect.objectContaining({ text: "one" })],
    ]);
    expect(items[0]).toMatchObject({
      target: { type: "validation_answer", id: bike, key },
      label: "01 WHY THEM",
      source: "manual",
      batchId: null,
      before: expect.objectContaining({ text: "two" }),
      changedBy: { id: userId("ana"), displayName: "Ana Villanueva" },
      revertible: true,
    });
    expect(items[1]?.changedBy.id).toBe(userId("kenji"));
    expect(items[2]?.before).toBeNull();
  });

  test("an item without a key only matches rows without a key", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Bike shop visit" },
    });
    expect(created.status).toBe(201);
    const res = await itemHistory("research_log_entry", created.body.id);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      action: "create",
      label: "Research log · Bike shop visit",
      target: { type: "research_log_entry", id: created.body.id, key: null },
    });
    const withKey = await itemHistory("research_log_entry", created.body.id, "SOME.KEY");
    expect(withKey.body.items).toEqual([]);
  });

  test("keys of the same validation do not mix", async () => {
    const bike = await validationOf("bike-repair");
    await threeVersions(bike, "V.01.WHY_THEM");
    await putAnswer(bike, "V.01.FREQUENCY", { text: "daily", lockVersion: 0 });
    const res = await itemHistory("validation_answer", bike, "V.01.FREQUENCY");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].after.text).toBe("daily");
  });

  test("an item with no change is an empty page, a Viewer reads but cannot revert", async () => {
    const bike = await validationOf("bike-repair");
    const empty = await itemHistory("validation_answer", bike, "V.01.WHO", as.grace);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null });
    await threeVersions(bike);
    const viewer = await itemHistory("validation_answer", bike, "V.01.WHY_THEM", as.grace);
    expect(viewer.status).toBe(200);
    expect(viewer.body.items.every((e: HistoryEntry) => e.revertible === false)).toBe(true);
    const member = await itemHistory("validation_answer", bike, "V.01.WHY_THEM", as.kenji);
    expect(member.body.items.every((e: HistoryEntry) => e.revertible === true)).toBe(true);
  });

  test("an archived idea is readable and nothing is revertible", async () => {
    const bike = await validationOf("bike-repair");
    await threeVersions(bike);
    await archiveIdea("bike-repair");
    const res = await itemHistory("validation_answer", bike, "V.01.WHY_THEM");
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(3);
    expect(res.body.items.every((e: HistoryEntry) => e.revertible === false)).toBe(true);
  });

  test("the history of a deleted row stays readable and its deletion is revertible", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Gone soon" },
    });
    const del = await call(t.app, "DELETE", `/api/v1/research-log/${created.body.id}`, {
      as: as.ana,
    });
    expect(del.status).toBe(200);
    const res = await itemHistory("research_log_entry", created.body.id);
    expect(res.status).toBe(200);
    expect(res.body.items.map((e: HistoryEntry) => e.action)).toEqual(["delete", "create"]);
    expect(res.body.items[0]).toMatchObject({ after: null, revertible: true });
    expect(res.body.items[0].before).toMatchObject({ topic: "Gone soon" });
  });

  test("a plan item resolves to its plan: execution items and plan answers", async () => {
    const plan = planId("piaya-a");
    const created = await call(t.app, "POST", `/api/v1/plans/${plan}/execution-items`, {
      as: as.ana,
      body: { type: "milestone", title: "Open the pop-up" },
    });
    expect(created.status).toBe(201);
    const res = await itemHistory("execution_item", created.body.id);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      label: "Execution · Open the pop-up",
      action: "create",
    });
    const screen = await screenHistory("business_plan", plan);
    expect(screen.body.items[0].target.id).toBe(created.body.id);
  });
});

describe("H1 GET /history, a whole screen", () => {
  test("lists every item of the container newest first and filters by section", async () => {
    const bike = await validationOf("bike-repair");
    await putAnswer(bike, "V.01.WHY_THEM", { text: "a", lockVersion: 0 });
    await putAnswer(bike, "V.02.MARKET_SIZE", { text: "b", lockVersion: 0 }, as.kenji);
    await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Visit" },
    });
    const all = await screenHistory("validation", bike);
    expect(all.status).toBe(200);
    for (const item of all.body.items) historyEntrySchema.parse(item);
    const [row] = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, bike))
      .orderBy(desc(schema.changeHistory.changedAt))
      .limit(1);
    expect(all.body.items[0].id).toBe(row?.id);
    const times = all.body.items.map((e: HistoryEntry) => e.changedAt);
    expect([...times].sort().reverse()).toEqual(times);
    expect(all.body.items.map((e: HistoryEntry) => e.target.type)).toEqual(
      expect.arrayContaining(["validation_answer", "research_log_entry"]),
    );

    const section = await screenHistory("validation", bike, as.ana, "&sectionKey=02");
    expect(section.body.items).toHaveLength(1);
    expect(section.body.items[0]).toMatchObject({
      target: { key: "V.02.MARKET_SIZE" },
      changedBy: { id: userId("kenji") },
    });
    const none = await screenHistory("validation", bike, as.ana, "&sectionKey=99");
    expect(none.body.items).toEqual([]);
  });

  test("pages with a cursor without repeating or skipping entries", async () => {
    const bike = await validationOf("bike-repair");
    for (const [i, key] of [
      "V.01.WHO",
      "V.01.PROBLEM",
      "V.01.FREQUENCY",
      "V.01.SEVERITY",
    ].entries()) {
      await putAnswer(bike, key, { text: `t${i}`, lockVersion: 0 });
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res = await screenHistory(
        "validation",
        bike,
        as.ana,
        `&limit=3${cursor ? `&cursor=${cursor}` : ""}`,
      );
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(3);
      seen.push(...res.body.items.map((e: HistoryEntry) => e.id));
      cursor = res.body.nextCursor;
      pages += 1;
    } while (cursor);
    const stored = await t.db
      .select({ id: schema.changeHistory.id })
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, bike));
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toHaveLength(stored.length);
    expect(pages).toBe(Math.ceil(stored.length / 3));
    const bad = await screenHistory("validation", bike, as.ana, "&cursor=garbage");
    expect(bad.status).toBe(422);
    expect((await screenHistory("validation", bike, as.ana, "&limit=0")).status).toBe(422);
  });

  test("a screen only lists its own container", async () => {
    const bike = await validationOf("bike-repair");
    const piaya = await validationOf("piaya");
    await putAnswer(bike, "V.01.WHY_THEM", { text: "a", lockVersion: 0 });
    const res = await screenHistory("validation", piaya);
    expect(res.body.items.every((e: HistoryEntry) => e.target.id !== bike)).toBe(true);
    const idea = await screenHistory("idea", ideaId("bike-repair"));
    expect(idea.status).toBe(200);
    expect(idea.body.items).toEqual([]);
  });

  test("the history of the idea summary is the idea screen's", async () => {
    const idea = ideaId("bike-repair");
    const detail = await call(t.app, "GET", `/api/v1/ideas/${idea}`, { as: as.ana });
    const patched = await call(t.app, "PATCH", `/api/v1/ideas/${idea}`, {
      as: as.ana,
      body: { name: "Bike Repair on Wheels", lockVersion: detail.body.lockVersion },
    });
    expect(patched.status).toBe(200);
    const res = await screenHistory("idea", idea);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      target: { type: "idea", id: idea },
      action: "update",
      label: "Bike Repair on Wheels",
    });
    const item = await itemHistory("idea", idea);
    expect(item.body.items).toHaveLength(1);
  });

  test("a self analysis history is the owner's, with the answers labelled by question", async () => {
    const sa = await selfAnalysisOf("kenji");
    const put = await call(t.app, "PUT", "/api/v1/me/self-analysis/answers/SA.NOT.1", {
      as: as.kenji,
      body: { text: "Not a night job", lockVersion: 0 },
    });
    expect(put.status).toBe(200);
    const res = await screenHistory("self_analysis", sa, as.kenji);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({
      target: { type: "self_analysis_answer", id: sa, key: "SA.NOT.1" },
      label: "NOT 1",
      revertible: true,
      after: expect.objectContaining({ text: "Not a night job" }),
    });
    const item = await itemHistory("self_analysis_answer", sa, "SA.NOT.1", as.kenji);
    expect(item.body.items).toHaveLength(1);
  });
});

describe("H1 errors and permissions (SDD 7.1)", () => {
  test("needs a signed-in user", async () => {
    const bike = await validationOf("bike-repair");
    const res = await call(
      t.app,
      "GET",
      `/api/v1/history?containerType=validation&containerId=${bike}`,
    );
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  test("exactly one of the item form and the screen form is accepted", async () => {
    const bike = await validationOf("bike-repair");
    const bad = [
      "",
      `?targetType=validation_answer&targetId=${bike}&containerType=validation&containerId=${bike}`,
      `?targetType=validation_answer`,
      `?targetId=${bike}`,
      `?containerType=validation`,
      `?containerId=${bike}`,
      `?containerType=nope&containerId=${bike}`,
      `?targetType=nope&targetId=${bike}`,
      `?containerType=validation&containerId=not-a-uuid`,
    ];
    for (const query of bad) {
      const res = await call(t.app, "GET", `/api/v1/history${query}`, { as: as.ana });
      expect([query, res.status, res.body.error.code]).toEqual([query, 422, "VALIDATION_FAILED"]);
    }
  });

  test("unknown containers and targets are 404", async () => {
    for (const type of ["validation", "business_plan", "idea", "self_analysis"]) {
      const res = await screenHistory(type, MISSING);
      expect([type, res.status, res.body.error.code]).toEqual([type, 404, "NOT_FOUND"]);
    }
    for (const type of [
      "validation_answer",
      "research_log_entry",
      "competitor",
      "assumption",
      "risk",
      "cost_item",
      "execution_item",
      "plan_answer",
      "idea",
    ]) {
      const res = await itemHistory(type, MISSING, type.endsWith("answer") ? "X" : null);
      expect([type, res.status, res.body.error.code]).toEqual([type, 404, "NOT_FOUND"]);
    }
  });

  test("someone outside the workspace gets 403 NO_ACCESS, an operator included", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Visit" },
    });
    for (const who of [as.admin]) {
      const screen = await screenHistory("validation", bike, who);
      expect([screen.status, screen.body.error.code]).toEqual([403, "NO_ACCESS"]);
      const item = await itemHistory("research_log_entry", created.body.id, null, who);
      expect([item.status, item.body.error.code]).toEqual([403, "NO_ACCESS"]);
      const plan = await screenHistory("business_plan", planId("piaya-a"), who);
      expect(plan.status).toBe(403);
    }
  });

  test("a self analysis history is only for its owner, shared members included", async () => {
    const ana = await selfAnalysisOf("ana");
    const owner = await screenHistory("self_analysis", ana, as.ana);
    expect(owner.status).toBe(200);
    for (const who of [as.kenji, as.grace, as.admin]) {
      const res = await screenHistory("self_analysis", ana, who);
      expect([res.status, res.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const item = await itemHistory("self_analysis_answer", ana, "SA.WHY.1", who);
      expect([item.status, item.body.error.code]).toEqual([403, "FORBIDDEN"]);
    }
  });

  test("every member role may read the history of a validation and a plan", async () => {
    const bike = await validationOf("bike-repair");
    for (const who of [as.ana, as.kenji, as.paolo, as.grace]) {
      expect((await screenHistory("validation", bike, who)).status).toBe(200);
      expect((await screenHistory("business_plan", planId("piaya-a"), who)).status).toBe(200);
    }
  });
});

describe("H2 POST /history/{entryId}/revert", () => {
  test("restores the state right after the entry and records the revert", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.WHY_THEM";
    const [one, two, three] = await threeVersions(bike, key);
    const before = await getAnswer(bike, key);
    expect(before.lockVersion).toBe(3);

    const res = await revert((two as HistoryEntry).id, as.paolo);
    expect(res.status).toBe(200);
    historyEntrySchema.parse(res.body.entry);
    expect(res.body.entry).toMatchObject({
      action: "restore",
      source: "revert",
      batchId: null,
      target: { type: "validation_answer", id: bike, key },
      before: expect.objectContaining({ text: "three" }),
      after: expect.objectContaining({ text: "two" }),
      changedBy: { id: userId("paolo") },
      revertible: true,
    });
    expect(res.body.target).toMatchObject({ questionKey: key, text: "two", lockVersion: 4 });
    expect((await getAnswer(bike, key)).text).toBe("two");

    const [stored] = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.id, res.body.entry.id));
    expect(stored?.revertedFromId).toBe((two as HistoryEntry).id);
    expect(stored).toMatchObject({
      containerType: "validation",
      containerId: bike,
      sectionKey: "01",
    });
    const list = await itemHistory("validation_answer", bike, key);
    expect(list.body.items).toHaveLength(4);
    expect(list.body.items[0].id).toBe(res.body.entry.id);

    // The revert is a change like any other: the earlier states stay reachable.
    const again = await revert((one as HistoryEntry).id);
    expect(again.body.target.text).toBe("one");
    const third = await revert((three as HistoryEntry).id);
    expect(third.body.target).toMatchObject({ text: "three", lockVersion: 6 });
    expect(await rowsOf("validation_answer", bike, key)).toHaveLength(6);
  });

  test("no conflict is checked: another person's newer save is overwritten", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.WHY_THEM";
    const [, two] = await threeVersions(bike, key);
    await putAnswer(bike, key, { text: "four", lockVersion: 3 }, as.kenji);
    const res = await revert((two as HistoryEntry).id);
    expect(res.status).toBe(200);
    expect((await getAnswer(bike, key)).text).toBe("two");
    const stale = await putAnswer(bike, key, { text: "late", lockVersion: 4 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current.value.text).toBe("two");
  });

  test("the classification and the evidence links go back with the text", async () => {
    const bike = await validationOf("bike-repair");
    const key = "V.01.BEHAVIOR";
    await putAnswer(bike, key, { text: "They walk the bike", lockVersion: 0 });
    await putAnswer(bike, key, {
      classification: { fau: "assumption", confidence: "medium" },
      lockVersion: 1,
    });
    await putAnswer(bike, key, { classification: { fau: "unknown" }, lockVersion: 2 });
    const entries = (await itemHistory("validation_answer", bike, key)).body.items;
    expect(entries[0].after).toMatchObject({ fau: "unknown", confidence: null });
    const res = await revert(entries[1].id);
    expect(res.body.target.classification).toMatchObject({
      fau: "assumption",
      confidence: "medium",
      state: "assumption",
    });
    expect(res.body.target.text).toBe("They walk the bike");
  });

  test("undoes a deletion: the row comes back with its content", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Competitor walk", observation: "Two shops on Lacson" },
    });
    await call(t.app, "DELETE", `/api/v1/research-log/${created.body.id}`, { as: as.ana });
    const list = () =>
      call(t.app, "GET", `/api/v1/validations/${bike}/research-log`, { as: as.ana });
    expect((await list()).body.items.map((e: { id: string }) => e.id)).not.toContain(
      created.body.id,
    );
    const deletion = (await itemHistory("research_log_entry", created.body.id)).body.items[0];
    expect(deletion.action).toBe("delete");

    const res = await revert(deletion.id, as.kenji);
    expect(res.status).toBe(200);
    expect(res.body.entry).toMatchObject({
      action: "restore",
      source: "revert",
      before: null,
      after: expect.objectContaining({ topic: "Competitor walk" }),
    });
    const back = (await list()).body.items.find((e: { id: string }) => e.id === created.body.id);
    expect(back).toMatchObject({ topic: "Competitor walk", observation: "Two shops on Lacson" });
    const [row] = await t.db
      .select()
      .from(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.id, created.body.id));
    expect(row).toMatchObject({ deletedAt: null, updatedById: userId("kenji") });
    expect(row?.lockVersion).toBe(2);
  });

  test("reverting the creation of a row deletes it again", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Typo" },
    });
    await call(t.app, "PATCH", `/api/v1/research-log/${created.body.id}`, {
      as: as.ana,
      body: { topic: "Typo fixed", lockVersion: 0 },
    });
    const [update, create] = (await itemHistory("research_log_entry", created.body.id)).body.items;
    const res = await revert(create.id);
    expect(res.status).toBe(200);
    expect(res.body.entry.after).toMatchObject({ topic: "Typo" });
    const own = await revert(update.id);
    expect(own.body.entry.after).toMatchObject({ topic: "Typo fixed" });
  });

  test("a plan answer and an execution item go back too, and a deleted item can be undone", async () => {
    const plan = planId("piaya-a");
    const key = "P.01.1";
    const current = await call(t.app, "GET", `/api/v1/plans/${plan}/items/1`, { as: as.ana });
    expect(current.status).toBe(200);
    const [stored] = await t.db
      .select()
      .from(schema.planAnswers)
      .where(
        and(eq(schema.planAnswers.businessPlanId, plan), eq(schema.planAnswers.questionKey, key)),
      );
    const original = stored?.text;
    const put = await call(t.app, "PUT", `/api/v1/plans/${plan}/answers/${key}`, {
      as: as.ana,
      body: { text: "Rewritten", lockVersion: stored?.lockVersion ?? 0 },
    });
    expect(put.status).toBe(200);
    const entry = (await itemHistory("plan_answer", plan, key)).body.items[0];
    expect(entry).toMatchObject({
      label: "Plan 01.1",
      before: expect.objectContaining({ text: original }),
    });
    const prior = await revert(entry.id);
    expect(prior.status).toBe(200);
    expect(prior.body.entry.after).toMatchObject({ text: "Rewritten" });

    const item = await call(t.app, "POST", `/api/v1/plans/${plan}/execution-items`, {
      as: as.ana,
      body: { type: "kpi", title: "Weekly boxes" },
    });
    const del = await call(t.app, "DELETE", `/api/v1/execution-items/${item.body.id}`, {
      as: as.ana,
    });
    expect(del.status).toBe(204);
    const deletion = (await itemHistory("execution_item", item.body.id)).body.items[0];
    expect(deletion.action).toBe("delete");
    const undone = await revert(deletion.id);
    expect(undone.status).toBe(200);
    const [row] = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.id, item.body.id));
    expect(row).toMatchObject({ title: "Weekly boxes", deletedAt: null });
  });

  test("the idea summary goes back to an earlier name", async () => {
    const idea = ideaId("bike-repair");
    const detail = await call(t.app, "GET", `/api/v1/ideas/${idea}`, { as: as.ana });
    const original = detail.body.name;
    const first = await call(t.app, "PATCH", `/api/v1/ideas/${idea}`, {
      as: as.ana,
      body: { name: "Renamed", lockVersion: detail.body.lockVersion },
    });
    await call(t.app, "PATCH", `/api/v1/ideas/${idea}`, {
      as: as.ana,
      body: { name: "Renamed twice", lockVersion: first.body.lockVersion },
    });
    const entries = (await itemHistory("idea", idea)).body.items as HistoryEntry[];
    expect(entries).toHaveLength(2);
    const res = await revert((entries[1] as HistoryEntry).id);
    expect(res.status).toBe(200);
    expect(res.body.target).toMatchObject({ id: idea, name: "Renamed" });
    expect((await call(t.app, "GET", `/api/v1/ideas/${idea}`, { as: as.ana })).body.name).not.toBe(
      original,
    );
  });

  test("a self analysis answer goes back for its owner only", async () => {
    const sa = await selfAnalysisOf("kenji");
    const path = "/api/v1/me/self-analysis/answers/SA.NOT.1";
    await call(t.app, "PUT", path, { as: as.kenji, body: { text: "first", lockVersion: 0 } });
    await call(t.app, "PUT", path, { as: as.kenji, body: { text: "second", lockVersion: 1 } });
    const [second, first] = (await itemHistory("self_analysis_answer", sa, "SA.NOT.1", as.kenji))
      .body.items;
    for (const who of [as.ana, as.grace, as.admin]) {
      const res = await revert(second.id, who);
      expect([res.status, res.body.error.code]).toEqual([403, "FORBIDDEN"]);
    }
    const res = await revert(first.id, as.kenji);
    expect(res.status).toBe(200);
    expect(res.body.target).toMatchObject({ questionKey: "SA.NOT.1", text: "first" });
    expect(res.body.entry).toMatchObject({ action: "restore", source: "revert" });
  });

  test("Viewers get 403, outsiders 403 NO_ACCESS, an archived idea 409, unknown ids 404", async () => {
    const bike = await validationOf("bike-repair");
    const [entry] = await threeVersions(bike);
    const id = (entry as HistoryEntry).id;
    const viewer = await revert(id, as.grace);
    expect([viewer.status, viewer.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsider = await revert(id, as.admin);
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect((await call(t.app, "POST", `/api/v1/history/${id}/revert`)).status).toBe(401);
    expect((await revert(MISSING)).status).toBe(404);
    expect((await revert("not-a-uuid")).status).toBe(422);
    expect((await getAnswer(bike, "V.01.WHY_THEM")).text).toBe("three");

    await archiveIdea("bike-repair");
    const archived = await revert(id);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    const archivedViewer = await revert(id, as.grace);
    expect(archivedViewer.status).toBe(403);
    expect((await getAnswer(bike, "V.01.WHY_THEM")).text).toBe("three");
  });

  test("a revert that fails writes no history row and changes nothing", async () => {
    const bike = await validationOf("bike-repair");
    const created = await call(t.app, "POST", `/api/v1/validations/${bike}/research-log`, {
      as: as.ana,
      body: { topic: "Visit" },
    });
    const entry = (await itemHistory("research_log_entry", created.body.id)).body.items[0];
    await t.db
      .delete(schema.researchLogEntries)
      .where(eq(schema.researchLogEntries.id, created.body.id));
    const before = (await rowsOf("research_log_entry", created.body.id)).length;
    const res = await revert(entry.id);
    expect(res.status).toBe(404);
    expect((await rowsOf("research_log_entry", created.body.id)).length).toBe(before);
  });
});

describe("H3 POST /history/batches/{batchId}/revert", () => {
  async function seededBatch(source: string, containerType: string) {
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(
        and(
          eq(schema.changeHistory.source, source as "ai_import"),
          eq(schema.changeHistory.containerType, containerType as "validation"),
        ),
      );
    const batchId = rows.find((r) => r.batchId)?.batchId as string;
    return rows.filter((r) => r.batchId === batchId);
  }

  test("takes back an AI import: each answer returns to its state before, as one new batch", async () => {
    const batch = await seededBatch("ai_import", "validation");
    expect(batch.length).toBeGreaterThan(1);
    const validationId = (batch[0] as (typeof batch)[0]).containerId;
    const batchId = (batch[0] as (typeof batch)[0]).batchId as string;
    const keys = batch.map((r) => r.targetKey as string);

    const res = await revertBatch(batchId, as.ana);
    expect(res.status).toBe(200);
    expect(res.body.reverted).toBe(batch.length);
    expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.batchId).not.toBe(batchId);

    for (const key of keys) {
      const answer = await getAnswer(validationId, key);
      expect([key, answer.text]).toEqual([key, null]);
    }
    const written = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, res.body.batchId));
    expect(written).toHaveLength(batch.length);
    expect(new Set(written.map((r) => r.source))).toEqual(new Set(["revert"]));
    expect(new Set(written.map((r) => r.revertedFromId))).toEqual(new Set(batch.map((r) => r.id)));
    expect(written.every((r) => r.changedById === userId("ana"))).toBe(true);
    // The original rows stay as they were.
    const original = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, batchId));
    expect(original).toHaveLength(batch.length);

    // Taking the revert back restores the imported answers.
    const again = await revertBatch(res.body.batchId, as.kenji);
    expect(again.status).toBe(200);
    expect(again.body.reverted).toBe(batch.length);
    for (const row of batch) {
      const answer = await getAnswer(validationId, row.targetKey as string);
      expect(answer.text).toBe((row.after as { text: string }).text);
    }
  });

  test("takes back an AI import of a self analysis for its owner only", async () => {
    const batch = await seededBatch("ai_import", "self_analysis");
    const batchId = (batch[0] as (typeof batch)[0]).batchId as string;
    for (const who of [as.kenji, as.grace, as.admin]) {
      const res = await revertBatch(batchId, who);
      expect([res.status, res.body.error.code]).toEqual([403, "FORBIDDEN"]);
    }
    const [owner] = await t.db
      .select({ userId: schema.selfAnalyses.userId })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.id, (batch[0] as (typeof batch)[0]).containerId));
    const who = Object.entries(as).find(([name]) => userId(name as "ana") === owner?.userId);
    const res = await revertBatch(batchId, who?.[1] as Record<string, string>);
    expect(res.status).toBe(200);
    expect(res.body.reverted).toBe(batch.length);
  });

  test("the history lists a batch's rows with its batchId", async () => {
    const batch = await seededBatch("ai_import", "validation");
    const containerId = (batch[0] as (typeof batch)[0]).containerId;
    const res = await screenHistory("validation", containerId, as.ana, "&limit=100");
    const rows = res.body.items.filter(
      (e: HistoryEntry) => e.batchId === (batch[0] as (typeof batch)[0]).batchId,
    );
    expect(rows).toHaveLength(batch.length);
    expect(rows.every((e: HistoryEntry) => e.source === "ai_import")).toBe(true);
  });

  test("Viewers get 403, outsiders 403 NO_ACCESS, an archived idea 409, unknown batches 404", async () => {
    const batch = await seededBatch("ai_import", "validation");
    const batchId = (batch[0] as (typeof batch)[0]).batchId as string;
    const viewer = await revertBatch(batchId, as.grace);
    expect([viewer.status, viewer.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsider = await revertBatch(batchId, as.admin);
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect((await call(t.app, "POST", `/api/v1/history/batches/${batchId}/revert`)).status).toBe(
      401,
    );
    expect((await revertBatch(MISSING)).status).toBe(404);
    expect((await revertBatch("nope")).status).toBe(422);

    const [validation] = await t.db
      .select({ ideaId: schema.validations.ideaId })
      .from(schema.validations)
      .where(eq(schema.validations.id, (batch[0] as (typeof batch)[0]).containerId));
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, validation?.ideaId as string));
    const archived = await revertBatch(batchId);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect((await revertBatch(batchId, as.grace)).status).toBe(403);
  });
});

describe("revert races and guards", () => {
  async function aiBatch() {
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.source, "ai_import"));
    const batchId = rows.find((r) => r.containerType === "validation" && r.batchId)
      ?.batchId as string;
    return rows.filter((r) => r.batchId === batchId);
  }
  const revertRows = (batchId: string) =>
    t.db.select().from(schema.changeHistory).where(eq(schema.changeHistory.batchId, batchId));

  test("a batch cannot be taken back twice, and a later edit survives the second request", async () => {
    const batch = await aiBatch();
    const first = batch[0] as (typeof batch)[0];
    const batchId = first.batchId as string;
    const validationId = first.containerId;
    const key = first.targetKey as string;

    const done = await revertBatch(batchId);
    expect(done.status).toBe(200);
    const edit = await putAnswer(validationId, key, {
      text: "Edited after the revert",
      lockVersion: (await getAnswer(validationId, key)).lockVersion,
    });
    expect(edit.status).toBe(200);
    const [{ n: before }] = (await t.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.changeHistory)) as [{ n: number }];

    const again = await revertBatch(batchId);
    expect([again.status, again.body.error.code]).toEqual([409, "CONFLICT"]);
    expect((await getAnswer(validationId, key)).text).toBe("Edited after the revert");
    const [{ n: after }] = (await t.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.changeHistory)) as [{ n: number }];
    expect(after).toBe(before);

    // Once the revert itself is taken back, the original can be taken back again.
    const undone = await revertBatch(done.body.batchId, as.kenji);
    expect(undone.status).toBe(200);
    const redo = await revertBatch(batchId);
    expect(redo.status).toBe(200);
    expect(redo.body.reverted).toBeGreaterThan(0);
    // The revert of a revert stays revertible only until it has been reverted too.
    const twice = await revertBatch(done.body.batchId, as.kenji);
    expect([twice.status, twice.body.error.code]).toEqual([409, "CONFLICT"]);
    expect(await revertRows(done.body.batchId)).toHaveLength(batch.length);
  });

  test("concurrent requests for one batch apply it once", async () => {
    const batch = await aiBatch();
    const batchId = (batch[0] as (typeof batch)[0]).batchId as string;
    const results = await Promise.all([revertBatch(batchId), revertBatch(batchId, as.kenji)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    const written = await t.db
      .select()
      .from(schema.changeHistory)
      .where(
        and(
          eq(schema.changeHistory.source, "revert"),
          inArray(
            schema.changeHistory.revertedFromId,
            batch.map((r) => r.id),
          ),
        ),
      );
    expect(written).toHaveLength(batch.length);
  });

  test("restoring an assignee who is no longer a member is 422 INVALID_ASSIGNEE", async () => {
    const plan = planId("piaya-a");
    const created = await call(t.app, "POST", `/api/v1/plans/${plan}/execution-items`, {
      as: as.ana,
      body: { type: "next_action", title: "Call the supplier", assigneeUserId: userId("kenji") },
    });
    expect(created.status).toBe(201);
    const patched = await call(t.app, "PATCH", `/api/v1/execution-items/${created.body.id}`, {
      as: as.ana,
      body: { assigneeUserId: null, lockVersion: created.body.lockVersion },
    });
    expect(patched.status).toBe(200);
    const entries = (await itemHistory("execution_item", created.body.id)).body.items as {
      id: string;
      after: { assigneeUserId?: string | null } | null;
    }[];
    const withAssignee = entries.find((e) => e.after?.assigneeUserId === userId("kenji"));
    expect(withAssignee).toBeDefined();
    const [planRow] = await t.db
      .select({ workspaceId: schema.ideas.workspaceId })
      .from(schema.businessPlans)
      .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
      .where(eq(schema.businessPlans.id, plan));
    await t.db
      .delete(schema.memberships)
      .where(
        and(
          eq(schema.memberships.userId, userId("kenji")),
          eq(schema.memberships.workspaceId, planRow?.workspaceId as string),
        ),
      );
    const res = await revert((withAssignee as { id: string }).id);
    expect([res.status, res.body.error.code]).toEqual([422, "INVALID_ASSIGNEE"]);
    const [row] = await t.db
      .select({ assigneeUserId: schema.executionItems.assigneeUserId })
      .from(schema.executionItems)
      .where(eq(schema.executionItems.id, created.body.id));
    expect(row?.assigneeUserId).toBeNull();
  });

  test("an archive that commits while a revert waits wins (409 ARCHIVED)", async () => {
    const validationId = await validationOf("piaya");
    const [, second] = await threeVersions(validationId);
    const batch = await aiBatch();
    const batchId = (batch[0] as (typeof batch)[0]).batchId as string;
    const archiveWhile = async <T>(start: () => Promise<T>, id: string) => {
      let pending: Promise<T> | undefined;
      await t.db.transaction(async (tx) => {
        await tx
          .update(schema.ideas)
          .set({ archivedAt: new Date() })
          .where(eq(schema.ideas.id, id));
        pending = start();
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      return pending as Promise<T>;
    };
    const entry = await archiveWhile(() => revert((second as HistoryEntry).id), ideaId("piaya"));
    expect([entry.status, entry.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect((await getAnswer(validationId, "V.01.WHY_THEM")).text).toBe("three");

    const [owner] = await t.db
      .select({ ideaId: schema.validations.ideaId })
      .from(schema.validations)
      .where(eq(schema.validations.id, (batch[0] as (typeof batch)[0]).containerId));
    await t.db.update(schema.ideas).set({ archivedAt: null });
    const whole = await archiveWhile(() => revertBatch(batchId), owner?.ideaId as string);
    expect([whole.status, whole.body.error.code]).toEqual([409, "ARCHIVED"]);
  });

  test("reverting an unanswered question while it is answered at once never ends as a 500", async () => {
    const validationId = await validationOf("piaya");
    const key = "V.01.WHY_THEM";
    const [, second] = await threeVersions(validationId, key);
    await t.db
      .delete(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, validationId),
          eq(schema.validationAnswers.questionKey, key),
        ),
      );
    const results = await Promise.all([
      revert((second as HistoryEntry).id),
      revert((second as HistoryEntry).id, as.kenji),
      putAnswer(validationId, key, { text: "typed meanwhile", lockVersion: 0 }, as.paolo),
    ]);
    for (const r of results) expect([200, 409]).toContain(r.status);
    expect(results.some((r) => r.status === 200)).toBe(true);
    const rows = await t.db
      .select({ id: schema.validationAnswers.id })
      .from(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, validationId),
          eq(schema.validationAnswers.questionKey, key),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
