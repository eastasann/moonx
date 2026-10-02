import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { type IdeaKey, ideaId, planId, seedDemo, userId } from "@moonx/db/seed";
import { type HistoryEntry, historyEntrySchema } from "@moonx/schemas";
import { and, count, eq, isNull } from "drizzle-orm";
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
const admin = "/api/v1/admin";

type Kind = "self_analysis" | "validation" | "business_plan";

async function versionId(kind: Kind, versionNumber: number): Promise<string> {
  const [row] = await t.db
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(
      and(
        eq(schema.templates.kind, kind),
        eq(schema.templateVersions.versionNumber, versionNumber),
      ),
    );
  return (row as { id: string }).id;
}

interface Edit {
  /** Question IDs the new version no longer has. */
  remove?: string[];
  /** Questions the new version adds, as `[sectionKey, questionKey]`. */
  add?: [string, string][];
  /** Cost rows the new version adds (validation only). */
  costs?: { category: string; key: string; name: string }[];
  /** Replaces the minimum of the "competitors" check (validation only). */
  competitorsMin?: number;
}

/** Publishes the next version of `kind` through the operator endpoints and returns its id. */
async function publishNext(kind: Kind, edit: Edit = {}): Promise<string> {
  let id: string;
  if (kind === "validation") {
    id = await versionId("validation", 3);
  } else {
    const res = await call(
      t.app,
      "POST",
      `${admin}/template-versions/${await versionId(kind, 1)}/draft`,
      { as: as.admin },
    );
    expect(res.status).toBe(201);
    id = res.body.id;
  }
  const detail = await call(t.app, "GET", `${admin}/template-versions/${id}`, { as: as.admin });
  const sections = detail.body.sections as {
    id: string;
    key: string;
    questions: { id: string; key: string }[];
  }[];
  for (const key of edit.remove ?? []) {
    const question = sections.flatMap((s) => s.questions).find((q) => q.key === key);
    expect(question).toBeDefined();
    const res = await call(t.app, "DELETE", `${admin}/template-questions/${question?.id}`, {
      as: as.admin,
    });
    expect(res.status).toBe(204);
  }
  for (const [sectionKey, key] of edit.add ?? []) {
    const section = sections.find((s) => s.key === sectionKey);
    const res = await call(t.app, "POST", `${admin}/template-sections/${section?.id}/questions`, {
      as: as.admin,
      body: { key, title: `Added ${key}`, prompt: "Describe it", answerType: "long_text" },
    });
    expect(res.status).toBe(201);
  }
  if (edit.costs) {
    const items = [...detail.body.costDefaults, ...edit.costs].map(
      (c: { category: string; key: string; name: string }) => ({
        category: c.category,
        key: c.key,
        name: c.name,
      }),
    );
    const res = await call(t.app, "PUT", `${admin}/template-versions/${id}/cost-defaults`, {
      as: as.admin,
      body: { items },
    });
    expect(res.status).toBe(200);
  }
  if (edit.competitorsMin != null) {
    const items = detail.body.checkRules.map((r: { checkKey: string; params: object }) =>
      r.checkKey === "competitors"
        ? { checkKey: r.checkKey, params: { min: edit.competitorsMin, max: 9 } }
        : r,
    );
    const res = await call(t.app, "PUT", `${admin}/template-versions/${id}/check-rules`, {
      as: as.admin,
      body: { items },
    });
    expect(res.status).toBe(200);
  }
  const published = await call(t.app, "POST", `${admin}/template-versions/${id}/publish`, {
    as: as.admin,
  });
  expect(published.status).toBe(200);
  return id;
}

const SA_EDIT: Edit = { remove: ["SA.WHY.1", "SA.NOT.1"], add: [["WHY", "SA.WHY.EXTRA"]] };
const V_EDIT: Edit = {
  remove: ["V.01.WHY_THEM"],
  add: [["01", "V.01.EXTRA"]],
  costs: [{ category: "initial", key: "initial.signage", name: "Signage" }],
};

const preview = (kind: Kind, id: string, who = as.ana) =>
  call(t.app, "GET", `/api/v1/template-migrations/preview?targetType=${kind}&targetId=${id}`, {
    as: who,
  });
const migrate = (kind: Kind, id: string, toVersionId: string, who = as.ana) =>
  call(t.app, "POST", "/api/v1/template-migrations", {
    as: who,
    body: { targetType: kind, targetId: id, toVersionId },
  });
const revertBatch = (batchId: string, who = as.ana) =>
  call(t.app, "POST", `/api/v1/history/batches/${batchId}/revert`, { as: who });
const screenHistory = (type: string, id: string, who = as.ana) =>
  call(t.app, "GET", `/api/v1/history?containerType=${type}&containerId=${id}&limit=100`, {
    as: who,
  });

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

const pinnedOf = async (kind: Kind, id: string) => {
  const table =
    kind === "self_analysis"
      ? schema.selfAnalyses
      : kind === "validation"
        ? schema.validations
        : schema.businessPlans;
  const [row] = await t.db
    .select({ v: table.templateVersionId })
    .from(table)
    .where(eq(table.id, id));
  return row?.v as string;
};

const saHome = async (who = as.ana) =>
  (await call(t.app, "GET", "/api/v1/me/self-analysis", { as: who })).body;
const saSection = async (key: string, who = as.ana) =>
  (await call(t.app, "GET", `/api/v1/me/self-analysis/sections/${key}`, { as: who })).body;
const vHome = async (key: IdeaKey) =>
  (await call(t.app, "GET", `/api/v1/ideas/${ideaId(key)}/validation`, { as: as.ana })).body;
const vSection = async (id: string, section: string) =>
  (await call(t.app, "GET", `/api/v1/validations/${id}/questions/${section}`, { as: as.ana })).body;
const historyRowCount = async () =>
  (await t.db.select({ n: count() }).from(schema.changeHistory))[0]?.n as number;

describe("T1 GET /template-migrations/preview", () => {
  test("without a newer published version it is 409 ALREADY_LATEST", async () => {
    const id = await selfAnalysisOf("ana");
    const res = await preview("self_analysis", id);
    expect([res.status, res.body.error.code]).toEqual([409, "ALREADY_LATEST"]);
    // A draft is not a version to move to.
    const bike = await validationOf("bike-repair");
    const draftOnly = await preview("validation", bike);
    expect([draftOnly.status, draftOnly.body.error.code]).toEqual([409, "ALREADY_LATEST"]);
  });

  test("self analysis: carried, hidden (with and without an answer) and added questions", async () => {
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const ana = await preview("self_analysis", await selfAnalysisOf("ana"));
    expect(ana.status).toBe(200);
    const [whyTitle] = (await t.db
      .select({ title: schema.templateQuestions.title })
      .from(schema.templateQuestions)
      .where(
        and(
          eq(schema.templateQuestions.templateVersionId, await versionId("self_analysis", 1)),
          eq(schema.templateQuestions.questionKey, "SA.WHY.1"),
        ),
      )) as { title: string }[];
    expect(ana.body).toEqual({
      from: { versionNumber: 1 },
      to: { versionId: v2, versionNumber: 2 },
      carried: 34,
      hiddenQuestions: [
        { questionKey: "SA.WHY.1", title: whyTitle?.title, hasAnswer: true },
        { questionKey: "SA.NOT.1", title: expect.any(String), hasAnswer: true },
      ],
      addedQuestions: 1,
      addedCostRows: [],
    });

    const kenji = await preview("self_analysis", await selfAnalysisOf("kenji"), as.kenji);
    expect(kenji.body.carried).toBe(20);
    expect(kenji.body.hiddenQuestions).toEqual([
      { questionKey: "SA.WHY.1", title: expect.any(String), hasAnswer: true },
      { questionKey: "SA.NOT.1", title: expect.any(String), hasAnswer: false },
    ]);
  });

  test("a blank answer is not carried and not counted as an answer", async () => {
    await publishNext("self_analysis", { remove: ["SA.WHY.2"] });
    const sa = await selfAnalysisOf("kenji");
    await t.db
      .update(schema.selfAnalysisAnswers)
      .set({ text: "   " })
      .where(
        and(
          eq(schema.selfAnalysisAnswers.selfAnalysisId, sa),
          eq(schema.selfAnalysisAnswers.questionKey, "SA.WHY.2"),
        ),
      );
    const res = await preview("self_analysis", sa, as.kenji);
    expect(res.body.hiddenQuestions).toEqual([
      { questionKey: "SA.WHY.2", title: expect.any(String), hasAnswer: false },
    ]);
    expect(res.body.carried).toBe(20);
  });

  test("validation: added cost rows are the template's rows the validation lacks", async () => {
    await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const res = await preview("validation", piaya);
    expect(res.status).toBe(200);
    expect(res.body.from).toEqual({ versionNumber: 1 });
    expect(res.body.to.versionNumber).toBe(3);
    expect(res.body.addedCostRows).toEqual(["Signage"]);
    // v2 added one question, v3 adds the V.10 one and V.01.EXTRA.
    expect(res.body.addedQuestions).toBe(3);
    expect(res.body.hiddenQuestions).toEqual([
      { questionKey: "V.01.WHY_THEM", title: expect.any(String), hasAnswer: true },
    ]);
    const answered = await t.db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, piaya));
    expect(res.body.carried).toBe(
      answered.filter((a) => a.text?.trim() && a.questionKey !== "V.01.WHY_THEM").length,
    );
  });

  test("a validation that already has the template rows adds none", async () => {
    await publishNext("validation", { remove: ["V.01.WHY_THEM"] });
    const res = await preview("validation", await validationOf("piaya"));
    expect(res.body.addedCostRows).toEqual([]);
  });

  test("business plan: hidden answers and added questions", async () => {
    const v2 = await publishNext("business_plan", {
      remove: ["P.04.4"],
      add: [["04", "P.04.EXTRA"]],
    });
    const plan = planId("piaya-a");
    const res = await preview("business_plan", plan);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      from: { versionNumber: 1 },
      to: { versionId: v2, versionNumber: 2 },
      hiddenQuestions: [{ questionKey: "P.04.4", hasAnswer: true }],
      addedQuestions: 1,
      addedCostRows: [],
    });
    const stored = await t.db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, plan));
    expect(res.body.carried).toBe(
      stored.filter(
        (a) =>
          a.questionKey !== "P.04.4" && (a.text?.trim() || (a.rows as unknown[] | null)?.length),
      ).length,
    );
    const empty = await preview("business_plan", planId("piaya-b"));
    expect(empty.body.hiddenQuestions[0]).toMatchObject({ questionKey: "P.04.4" });
  });

  test("writes nothing", async () => {
    await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const pinned = await pinnedOf("validation", piaya);
    const rows = await historyRowCount();
    const costs = await t.db.select().from(schema.costItems);
    await preview("validation", piaya);
    expect(await pinnedOf("validation", piaya)).toBe(pinned);
    expect(await historyRowCount()).toBe(rows);
    expect(await t.db.select().from(schema.costItems)).toEqual(costs);
  });
});

describe("T2 POST /template-migrations, self analysis", () => {
  test("pins the new version, keeps every answer and records one batch", async () => {
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const id = await selfAnalysisOf("ana");
    const answersBefore = await t.db
      .select()
      .from(schema.selfAnalysisAnswers)
      .where(eq(schema.selfAnalysisAnswers.selfAnalysisId, id));
    const why = await saSection("WHY");
    expect(why.answers.map((a: { questionKey: string }) => a.questionKey)).toContain("SA.WHY.1");

    const res = await migrate("self_analysis", id, v2);
    expect(res.status).toBe(200);
    expect(res.body.batchId).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.template).toEqual({ versionId: v2, versionNumber: 2, newerVersion: null });
    expect(await pinnedOf("self_analysis", id)).toBe(v2);

    // Nothing is deleted or rewritten: the hidden answers stay stored.
    expect(
      await t.db
        .select()
        .from(schema.selfAnalysisAnswers)
        .where(eq(schema.selfAnalysisAnswers.selfAnalysisId, id)),
    ).toEqual(answersBefore);

    const home = await saHome();
    expect(home.template).toEqual({ versionNumber: 2, versionId: v2, newerVersion: null });
    // 36 questions, minus two hidden, plus one added and still empty.
    expect(home).toMatchObject({ total: 35, answered: 34 });
    expect(home.firstUnanswered).toEqual({ sectionKey: "WHY", questionKey: "SA.WHY.EXTRA" });
    const after = await saSection("WHY");
    const keys = after.answers.map((a: { questionKey: string }) => a.questionKey);
    expect(keys).not.toContain("SA.WHY.1");
    expect(keys).toContain("SA.WHY.EXTRA");
    const kept = after.answers.find((a: { questionKey: string }) => a.questionKey === "SA.WHY.2");
    expect(kept.text).toBe(
      why.answers.find((a: { questionKey: string }) => a.questionKey === "SA.WHY.2").text,
    );
    const extra = after.answers.find(
      (a: { questionKey: string }) => a.questionKey === "SA.WHY.EXTRA",
    );
    expect(extra).toMatchObject({ text: null, lockVersion: 0 });

    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, res.body.batchId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      source: "template_migration",
      containerType: "self_analysis",
      containerId: id,
      workspaceId: null,
      ownerUserId: userId("ana"),
      targetType: "template_version",
      targetId: id,
      targetKey: "self_analysis",
      action: "update",
      changedById: userId("ana"),
      before: { versionNumber: 1 },
      after: { versionId: v2, versionNumber: 2 },
    });
  });

  test("the migration shows in the history as 'Template updated to v2', whole batches only", async () => {
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const id = await selfAnalysisOf("ana");
    const res = await migrate("self_analysis", id, v2);
    const list = await screenHistory("self_analysis", id);
    const entry = list.body.items[0] as HistoryEntry;
    historyEntrySchema.parse(entry);
    expect(entry).toMatchObject({
      label: "Template updated to v2",
      source: "template_migration",
      batchId: res.body.batchId,
      target: { type: "template_version", id, key: "self_analysis" },
      revertible: true,
    });
    const single = await call(t.app, "POST", `/api/v1/history/${entry.id}/revert`, { as: as.ana });
    expect([single.status, single.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    expect(await pinnedOf("self_analysis", id)).toBe(v2);
  });

  test("H3 takes the migration back: the version and the hidden answers return, and it can be redone", async () => {
    const v1 = await versionId("self_analysis", 1);
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const id = await selfAnalysisOf("ana");
    const res = await migrate("self_analysis", id, v2);

    const back = await revertBatch(res.body.batchId);
    expect(back.status).toBe(200);
    expect(back.body.reverted).toBe(1);
    expect(back.body.batchId).not.toBe(res.body.batchId);
    expect(await pinnedOf("self_analysis", id)).toBe(v1);
    const home = await saHome();
    expect(home).toMatchObject({ total: 36, answered: 36, template: { versionNumber: 1 } });
    expect(home.template.newerVersion).toMatchObject({ versionNumber: 2 });
    const keys = (await saSection("WHY")).answers.map(
      (a: { questionKey: string }) => a.questionKey,
    );
    expect(keys).toContain("SA.WHY.1");
    expect(keys).not.toContain("SA.WHY.EXTRA");

    const recorded = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, back.body.batchId));
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({
      source: "revert",
      action: "restore",
      targetType: "template_version",
      targetKey: "self_analysis",
      before: { versionNumber: 2 },
      after: { versionId: v1, versionNumber: 1 },
      revertedFromId: expect.any(String),
    });
    const list = (await screenHistory("self_analysis", id)).body.items as HistoryEntry[];
    expect(list.slice(0, 2).map((e) => [e.source, e.batchId])).toEqual([
      ["revert", back.body.batchId],
      ["template_migration", res.body.batchId],
    ]);

    // Taking the revert back is the migration again.
    const again = await revertBatch(back.body.batchId);
    expect(again.body.reverted).toBe(1);
    expect(await pinnedOf("self_analysis", id)).toBe(v2);
  });

  test("a second migration to the same version is 409 ALREADY_LATEST", async () => {
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const id = await selfAnalysisOf("ana");
    expect((await migrate("self_analysis", id, v2)).status).toBe(200);
    const again = await migrate("self_analysis", id, v2);
    expect([again.status, again.body.error.code]).toEqual([409, "ALREADY_LATEST"]);
    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.source, "template_migration"));
    expect(rows).toHaveLength(1);
  });

  test("only the owner migrates a self analysis: members, Viewers and operators get 403", async () => {
    const v2 = await publishNext("self_analysis", SA_EDIT);
    const id = await selfAnalysisOf("ana");
    for (const who of [as.kenji, as.paolo, as.grace, as.admin]) {
      const res = await migrate("self_analysis", id, v2, who);
      expect([res.status, res.body.error.code]).toEqual([403, "FORBIDDEN"]);
      const view = await preview("self_analysis", id, who);
      expect([view.status, view.body.error.code]).toEqual([403, "FORBIDDEN"]);
    }
    expect(await pinnedOf("self_analysis", id)).not.toBe(v2);
    expect(
      (await migrate("self_analysis", await selfAnalysisOf("kenji"), v2, as.kenji)).status,
    ).toBe(200);
  });
});

describe("T2 POST /template-migrations, validation", () => {
  test("carries answers (with F/A/U and evidence), hides removed ones and adds only the missing cost rows", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const section = await vSection(piaya, "01");
    const homeBefore = await vHome("piaya");
    const costsBefore = await t.db
      .select()
      .from(schema.costItems)
      .where(eq(schema.costItems.validationId, piaya));
    const answersBefore = await t.db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, piaya));
    const linksBefore = await t.db
      .select()
      .from(schema.evidenceLinks)
      .where(eq(schema.evidenceLinks.validationId, piaya));
    expect(
      section.answers.find((a: { questionKey: string }) => a.questionKey === "V.01.WHY_THEM")
        .classification.state,
    ).toBe("fact");

    const res = await migrate("validation", piaya, v3, as.kenji);
    expect(res.status).toBe(200);
    expect(res.body.template).toEqual({ versionId: v3, versionNumber: 3, newerVersion: null });
    expect(await pinnedOf("validation", piaya)).toBe(v3);

    expect(
      await t.db
        .select()
        .from(schema.validationAnswers)
        .where(eq(schema.validationAnswers.validationId, piaya)),
    ).toEqual(answersBefore);
    expect(
      await t.db
        .select()
        .from(schema.evidenceLinks)
        .where(eq(schema.evidenceLinks.validationId, piaya)),
    ).toEqual(linksBefore);

    const after = await vSection(piaya, "01");
    const keys = after.answers.map((a: { questionKey: string }) => a.questionKey);
    expect(keys).not.toContain("V.01.WHY_THEM");
    expect(keys).toContain("V.01.EXTRA");
    for (const answer of after.answers) {
      const was = section.answers.find(
        (a: { questionKey: string }) => a.questionKey === answer.questionKey,
      );
      if (was) expect(answer).toEqual(was);
    }
    expect(
      after.answers.find((a: { questionKey: string }) => a.questionKey === "V.01.EXTRA"),
    ).toMatchObject({ text: null, lockVersion: 0 });

    const homeAfter = await vHome("piaya");
    expect(homeAfter.template).toMatchObject({ versionNumber: 3, newerVersion: null });
    const sectionOf = (home: typeof homeBefore) =>
      home.sections.find((s: { key: string }) => s.key === "01");
    // The hidden fact leaves the progress and the F/A/U breakdown.
    expect(sectionOf(homeAfter).answered).toBe(sectionOf(homeBefore).answered - 1);
    expect(homeAfter.fau.fact).toBe(homeBefore.fau.fact - 1);

    const costs = await t.db
      .select()
      .from(schema.costItems)
      .where(eq(schema.costItems.validationId, piaya));
    expect(costs).toHaveLength(costsBefore.length + 1);
    for (const row of costsBefore) expect(costs).toContainEqual(row);
    const added = costs.find((c) => c.templateKey === "initial.signage");
    expect(added).toMatchObject({
      name: "Signage",
      category: "initial",
      amount: null,
      percent: null,
      deletedAt: null,
      lockVersion: 0,
      updatedById: userId("kenji"),
    });
    expect(added?.sortOrder).toBe(
      Math.max(...costsBefore.filter((c) => c.category === "initial").map((c) => c.sortOrder)) + 1,
    );
  });

  test("one batch holds the added cost rows and the version change, and H3 undoes all of it", async () => {
    const v1 = await versionId("validation", 1);
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const res = await migrate("validation", piaya, v3);

    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, res.body.batchId));
    expect(rows.map((r) => [r.targetType, r.action, r.sectionKey, r.source]).sort()).toEqual([
      ["cost_item", "create", "costs", "template_migration"],
      ["template_version", "update", null, "template_migration"],
    ]);
    expect(rows.every((r) => r.workspaceId != null && r.containerId === piaya)).toBe(true);
    const costRow = rows.find((r) => r.targetType === "cost_item");
    expect(costRow?.after).toMatchObject({ name: "Signage", category: "initial" });

    const list = (await screenHistory("validation", piaya)).body.items as HistoryEntry[];
    const batch = list.filter((e) => e.batchId === res.body.batchId);
    expect(batch).toHaveLength(2);
    expect(batch.find((e) => e.target.type === "template_version")?.label).toBe(
      "Template updated to v3",
    );
    expect(batch.find((e) => e.target.type === "cost_item")).toMatchObject({
      label: "Costs · Signage",
      revertible: true,
    });

    const back = await revertBatch(res.body.batchId, as.paolo);
    expect(back.status).toBe(200);
    expect(back.body.reverted).toBe(2);
    expect(await pinnedOf("validation", piaya)).toBe(v1);
    const [signage] = await t.db
      .select()
      .from(schema.costItems)
      .where(
        and(
          eq(schema.costItems.validationId, piaya),
          eq(schema.costItems.templateKey, "initial.signage"),
        ),
      );
    expect(signage?.deletedAt).not.toBeNull();
    const costs = await call(t.app, "GET", `/api/v1/validations/${piaya}/costs`, { as: as.ana });
    expect(JSON.stringify(costs.body)).not.toContain("Signage");
    const home = await vHome("piaya");
    expect(home.template).toMatchObject({ versionNumber: 1 });
    expect(
      (await vSection(piaya, "01")).answers.map((a: { questionKey: string }) => a.questionKey),
    ).toContain("V.01.WHY_THEM");

    const recorded = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, back.body.batchId));
    expect(recorded.map((r) => [r.targetType, r.action, r.source]).sort()).toEqual([
      ["cost_item", "delete", "revert"],
      ["template_version", "restore", "revert"],
    ]);
    expect(recorded.every((r) => r.changedById === userId("paolo"))).toBe(true);
  });

  test("the idea's screen history (13) shows the validation's migration and nothing else of it", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const res = await migrate("validation", piaya, v3);
    const list = await screenHistory("idea", ideaId("piaya"));
    const migrated = list.body.items.filter((e: HistoryEntry) => e.source === "template_migration");
    expect(migrated.map((e: HistoryEntry) => [e.label, e.target.type, e.batchId])).toEqual([
      ["Template updated to v3", "template_version", res.body.batchId],
    ]);
    expect(migrated[0].revertible).toBe(true);
  });

  test("a cost row that was taken away does not come back with a later migration", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const first = await migrate("validation", piaya, v3);
    await revertBatch(first.body.batchId);
    const view = await preview("validation", piaya);
    expect(view.body.addedCostRows).toEqual([]);
    const again = await migrate("validation", piaya, v3);
    expect(again.status).toBe(200);
    const signage = await t.db
      .select()
      .from(schema.costItems)
      .where(
        and(
          eq(schema.costItems.validationId, piaya),
          eq(schema.costItems.templateKey, "initial.signage"),
        ),
      );
    expect(signage).toHaveLength(1);
    expect(signage[0]?.deletedAt).not.toBeNull();
  });

  test("after a migration the checks use the new version's thresholds", async () => {
    const v3 = await publishNext("validation", { competitorsMin: 9 });
    const piaya = await validationOf("piaya");
    const find = (home: { checks: { key?: string; checkKey?: string }[] }) =>
      home.checks.find((c) => (c.key ?? c.checkKey) === "competitors");
    const before = find(await vHome("piaya"));
    expect(before).toBeDefined();
    await migrate("validation", piaya, v3);
    const after = find(await vHome("piaya"));
    expect(after).not.toEqual(before);
    expect(JSON.stringify(after)).toContain("9");
  });

  test("the row-level work of a migration is skipped when a row was deleted since (H3)", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const res = await migrate("validation", piaya, v3);
    const [signage] = await t.db
      .select()
      .from(schema.costItems)
      .where(
        and(
          eq(schema.costItems.validationId, piaya),
          eq(schema.costItems.templateKey, "initial.signage"),
        ),
      );
    const del = await call(t.app, "DELETE", `/api/v1/cost-items/${signage?.id}`, { as: as.ana });
    expect([200, 204]).toContain(del.status);
    const back = await revertBatch(res.body.batchId);
    expect(back.status).toBe(200);
    expect(back.body.reverted).toBe(1);
    expect(await pinnedOf("validation", piaya)).toBe(await versionId("validation", 1));
  });

  test("roles: Owner and Member migrate, Viewer 403, outsider 403 NO_ACCESS, archived 409", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    const bowl = await validationOf("health-bowl");
    const laundry = await validationOf("laundry");
    for (const who of [as.ana, as.kenji, as.paolo]) {
      expect((await preview("validation", piaya, who)).status).toBe(200);
    }
    const viewerView = await preview("validation", piaya, as.grace);
    expect([viewerView.status, viewerView.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsiderView = await preview("validation", piaya, as.admin);
    expect([outsiderView.status, outsiderView.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect(
      (
        await call(
          t.app,
          "GET",
          `/api/v1/template-migrations/preview?targetType=validation&targetId=${piaya}`,
        )
      ).status,
    ).toBe(401);

    const viewer = await migrate("validation", piaya, v3, as.grace);
    expect([viewer.status, viewer.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsider = await migrate("validation", piaya, v3, as.admin);
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect(
      (
        await call(t.app, "POST", "/api/v1/template-migrations", {
          body: { targetType: "validation", targetId: piaya, toVersionId: v3 },
        })
      ).status,
    ).toBe(401);
    expect(await pinnedOf("validation", piaya)).not.toBe(v3);

    expect((await migrate("validation", bowl, v3, as.kenji)).status).toBe(200);
    expect((await migrate("validation", piaya, v3, as.ana)).status).toBe(200);

    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("laundry")));
    const archived = await migrate("validation", laundry, v3);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect((await migrate("validation", laundry, v3, as.grace)).status).toBe(409);
    expect(await pinnedOf("validation", laundry)).not.toBe(v3);
  });

  test("an archive that commits while the migration waits is not overwritten (409 ARCHIVED)", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const laundry = await validationOf("laundry");
    let pending: ReturnType<typeof migrate> | undefined;
    await t.db.transaction(async (tx) => {
      await tx
        .update(schema.ideas)
        .set({ archivedAt: new Date() })
        .where(eq(schema.ideas.id, ideaId("laundry")));
      pending = migrate("validation", laundry, v3);
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    const res = await (pending as ReturnType<typeof migrate>);
    expect([res.status, res.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect(await pinnedOf("validation", laundry)).not.toBe(v3);
  });

  test("a validation on the newest version is 409 ALREADY_LATEST", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const bike = await validationOf("bike-repair");
    const bikeAtV2 = await migrate("validation", bike, v3);
    expect(bikeAtV2.status).toBe(200);
    const again = await migrate("validation", bike, v3);
    expect([again.status, again.body.error.code]).toEqual([409, "ALREADY_LATEST"]);
    const view = await preview("validation", bike);
    expect([view.status, view.body.error.code]).toEqual([409, "ALREADY_LATEST"]);
  });
});

describe("T2 POST /template-migrations, business plan", () => {
  test("keeps answers and execution items, hides removed answers, adds no preset rows", async () => {
    const v1 = await versionId("business_plan", 1);
    const v2 = await publishNext("business_plan", {
      remove: ["P.04.4"],
      add: [["04", "P.04.EXTRA"]],
    });
    const plan = planId("piaya-a");
    const answersBefore = await t.db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, plan));
    const itemsBefore = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, plan));
    const itemBefore = (await call(t.app, "GET", `/api/v1/plans/${plan}/items/4`, { as: as.ana }))
      .body;

    const res = await migrate("business_plan", plan, v2, as.paolo);
    expect(res.status).toBe(200);
    expect(res.body.template).toEqual({ versionId: v2, versionNumber: 2, newerVersion: null });
    expect(await pinnedOf("business_plan", plan)).toBe(v2);
    expect(
      await t.db
        .select()
        .from(schema.planAnswers)
        .where(eq(schema.planAnswers.businessPlanId, plan)),
    ).toEqual(answersBefore);
    expect(
      await t.db
        .select()
        .from(schema.executionItems)
        .where(eq(schema.executionItems.businessPlanId, plan)),
    ).toEqual(itemsBefore);

    const itemAfter = (await call(t.app, "GET", `/api/v1/plans/${plan}/items/4`, { as: as.ana }))
      .body;
    expect(JSON.stringify(itemBefore)).toContain("P.04.4");
    expect(JSON.stringify(itemAfter)).not.toContain("P.04.4");
    expect(JSON.stringify(itemAfter)).toContain("P.04.EXTRA");
    const home = (await call(t.app, "GET", `/api/v1/plans/${plan}`, { as: as.ana })).body;
    expect(home.template).toMatchObject({ versionNumber: 2, newerVersion: null });

    const rows = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, res.body.batchId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      containerType: "business_plan",
      containerId: plan,
      targetType: "template_version",
      targetKey: "business_plan",
      source: "template_migration",
      changedById: userId("paolo"),
    });
    const list = (await screenHistory("business_plan", plan)).body.items as HistoryEntry[];
    expect(list[0]?.label).toBe("Template updated to v2");

    const back = await revertBatch(res.body.batchId);
    expect(back.body.reverted).toBe(1);
    expect(await pinnedOf("business_plan", plan)).toBe(v1);
    expect(
      JSON.stringify(
        (await call(t.app, "GET", `/api/v1/plans/${plan}/items/4`, { as: as.ana })).body,
      ),
    ).toContain("P.04.4");
  });

  test("roles: Viewer 403, outsider 403 NO_ACCESS, archived plan 409, unknown plan 404", async () => {
    const v2 = await publishNext("business_plan", { remove: ["P.04.4"] });
    const plan = planId("piaya-b");
    const viewer = await migrate("business_plan", plan, v2, as.grace);
    expect([viewer.status, viewer.body.error.code]).toEqual([403, "FORBIDDEN"]);
    const outsider = await migrate("business_plan", plan, v2, as.admin);
    expect([outsider.status, outsider.body.error.code]).toEqual([403, "NO_ACCESS"]);
    expect((await migrate("business_plan", MISSING, v2)).status).toBe(404);
    expect((await preview("business_plan", MISSING)).status).toBe(404);

    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.businessPlans.id, plan));
    const archived = await migrate("business_plan", plan, v2);
    expect([archived.status, archived.body.error.code]).toEqual([409, "ARCHIVED"]);
    expect((await migrate("business_plan", plan, v2, as.grace)).status).toBe(409);
    expect(
      (
        await t.db
          .select()
          .from(schema.changeHistory)
          .where(
            and(
              eq(schema.changeHistory.containerId, plan),
              eq(schema.changeHistory.source, "template_migration"),
            ),
          )
      ).length,
    ).toBe(0);
  });
});

describe("T2 wrong targets and bad input", () => {
  test("a version that is not a newer published version of the template is 422", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const v2 = await versionId("validation", 2);
    const draft = await call(t.app, "POST", `${admin}/template-versions/${v3}/draft`, {
      as: as.admin,
    });
    expect(draft.status).toBe(201);
    const piaya = await validationOf("piaya");
    const bike = await validationOf("bike-repair");
    const cases: [string, string, string][] = [
      ["an unknown version", piaya, MISSING],
      ["a draft", piaya, draft.body.id],
      ["another template's version", piaya, await versionId("self_analysis", 1)],
      ["the version it is on", piaya, await versionId("validation", 1)],
      ["an older version", bike, await versionId("validation", 1)],
      ["its own version", bike, v2],
    ];
    for (const [name, target, to] of cases) {
      const res = await migrate("validation", target, to);
      expect([name, res.status, res.body.error.code]).toEqual([name, 422, "VALIDATION_FAILED"]);
      expect(res.body.error.details[0].path).toBe("toVersionId");
    }
    expect(await pinnedOf("validation", piaya)).toBe(await versionId("validation", 1));
    expect(await pinnedOf("validation", bike)).toBe(v2);
    expect(
      await t.db
        .select()
        .from(schema.changeHistory)
        .where(eq(schema.changeHistory.source, "template_migration")),
    ).toEqual([]);
  });

  test("a target of another kind or an unknown target is 404", async () => {
    const v3 = await publishNext("validation", V_EDIT);
    const piaya = await validationOf("piaya");
    for (const kind of ["business_plan", "self_analysis"] as const) {
      const res = await migrate(kind, piaya, v3);
      expect([kind, res.status]).toEqual([kind, 404]);
      expect((await preview(kind, piaya)).status).toBe(404);
    }
    expect((await migrate("validation", MISSING, v3)).status).toBe(404);
    expect((await preview("validation", MISSING)).status).toBe(404);
    expect(await pinnedOf("validation", piaya)).not.toBe(v3);
  });

  test("a malformed query or body is 422", async () => {
    const piaya = await validationOf("piaya");
    const v2 = await versionId("validation", 2);
    for (const query of [
      "",
      `?targetType=idea&targetId=${piaya}`,
      "?targetType=validation&targetId=not-a-uuid",
      `?targetType=validation`,
    ]) {
      const res = await call(t.app, "GET", `/api/v1/template-migrations/preview${query}`, {
        as: as.ana,
      });
      expect([query, res.status]).toEqual([query, 422]);
    }
    for (const body of [
      {},
      { targetType: "validation", targetId: piaya },
      { targetType: "idea", targetId: piaya, toVersionId: v2 },
      { targetType: "validation", targetId: piaya, toVersionId: "nope" },
      { targetType: "validation", targetId: "nope", toVersionId: v2 },
    ]) {
      const res = await call(t.app, "POST", "/api/v1/template-migrations", { as: as.ana, body });
      expect([JSON.stringify(body), res.status]).toEqual([JSON.stringify(body), 422]);
    }
  });

  test("the unpublished draft of the seed is not a target", async () => {
    const piaya = await validationOf("piaya");
    const v3 = await versionId("validation", 3);
    const res = await migrate("validation", piaya, v3);
    expect([res.status, res.body.error.code]).toEqual([422, "VALIDATION_FAILED"]);
    expect(await pinnedOf("validation", piaya)).toBe(await versionId("validation", 1));
    const open = await t.db
      .select()
      .from(schema.costItems)
      .where(and(eq(schema.costItems.validationId, piaya), isNull(schema.costItems.deletedAt)));
    expect(open.length).toBeGreaterThan(0);
  });
});
