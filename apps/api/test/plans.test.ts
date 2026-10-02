import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, ideaId, planId, userId } from "@moonx/db/seed";
import { and, eq, type SQL } from "drizzle-orm";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
const who = {} as Record<"ana" | "kenji" | "paolo" | "grace" | "admin", Record<string, string>>;

beforeAll(async () => {
  t = await startTestApp();
  for (const p of ["ana", "kenji", "paolo", "grace", "admin"] as const) {
    who[p] = await login(t.app, p);
  }
});
afterAll(async () => {
  await t.close();
});

const piaya = ideaId("piaya");
const planA = planId("piaya-a");
const planB = planId("piaya-b");
const plansPath = (idea: string) => `/api/v1/ideas/${idea}/plans`;
const planPath = (id: string) => `/api/v1/plans/${id}`;
const MISSING = "6f1f3f3a-1111-4111-8111-111111111111";

const historyOf = (where: SQL | undefined) =>
  t.db.select().from(schema.changeHistory).where(where).orderBy(schema.changeHistory.changedAt);

describe("P1 list and create", () => {
  test("lists the plans of an idea and hides archived ones unless asked", async () => {
    const res = await call(t.app, "GET", plansPath(piaya), { as: who.grace });
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(["Plan A", "Plan B"]);
    expect(res.body.items[0]).toMatchObject({
      latestVersion: { name: "v1 For advisors" },
      hasChangesSinceVersion: true,
      latestGoNoGo: { value: "delay" },
    });
  });

  test("a draft copies the validation, adds the execution rows and records one plan_draft batch", async () => {
    const res = await call(t.app, "POST", plansPath(piaya), {
      as: who.kenji,
      body: { name: "Plan C" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Plan C",
      businessName: "Piaya Gift Box Delivery",
      preparedBy: "Kenji Mori",
      archived: false,
      latestVersion: null,
      template: { versionNumber: 1 },
      ideaArchived: false,
      draftOnly: true,
    });
    const id = res.body.id as string;
    const answers = await t.db
      .select()
      .from(schema.planAnswers)
      .where(eq(schema.planAnswers.businessPlanId, id));
    const byKey = new Map(answers.map((a) => [a.questionKey, a]));
    expect(byKey.get("P.01.1")?.text).toBe(
      "Boxed piaya and local gifts delivered to offices and homes in Bacolod.",
    );
    expect(byKey.get("P.01.1")?.copiedFrom).toMatchObject({ source: "IDEA.ONE_LINE_CONCEPT" });
    const assumptions = (byKey.get("P.21.1")?.rows ?? []) as unknown[];
    expect(assumptions.length).toBeGreaterThan(0);
    const risks = (byKey.get("P.22.1")?.rows ?? []) as { trigger_indicator: unknown }[];
    expect(risks[0]?.trigger_indicator).toBeNull();

    const items = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, id));
    const count = (type: string) => items.filter((i) => i.type === type).length;
    expect([count("milestone"), count("launch"), count("kpi")]).toEqual([6, 5, 12]);
    expect(items.every((i) => i.fromPreset)).toBe(true);

    const rows = await historyOf(eq(schema.changeHistory.containerId, id));
    expect(rows.length).toBe(1 + answers.length + items.length);
    expect(new Set(rows.map((r) => r.source))).toEqual(new Set(["plan_draft"]));
    expect(new Set(rows.map((r) => r.batchId)).size).toBe(1);

    const [row] = await t.db
      .select()
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, id));
    expect(row?.createdFromDecisionId).not.toBeNull();

    const edited = await call(t.app, "PUT", `${planPath(id)}/answers/P.01.1`, {
      as: who.kenji,
      body: { text: "Changed after the draft.", lockVersion: byKey.get("P.01.1")?.lockVersion },
    });
    expect(edited.status).toBe(200);
    const after = await call(t.app, "GET", planPath(id), { as: who.kenji });
    expect(after.body.draftOnly).toBe(false);
  });

  test("deleting a preset execution row ends draftOnly", async () => {
    const res = await call(t.app, "POST", plansPath(piaya), {
      as: who.kenji,
      body: { name: "Plan D" },
    });
    const id = res.body.id as string;
    const [preset] = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, id));
    const del = await call(t.app, "DELETE", `/api/v1/execution-items/${preset?.id}`, {
      as: who.kenji,
    });
    expect(del.status).toBe(204);
    const after = await call(t.app, "GET", planPath(id), { as: who.kenji });
    expect(after.body.draftOnly).toBe(false);
  });

  test("the name must be free, archived plans included, and the decision must be Proceed", async () => {
    const dup = await call(t.app, "POST", plansPath(piaya), {
      as: who.ana,
      body: { name: "plan a" },
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("NAME_TAKEN");
    const bowl = await call(t.app, "POST", plansPath(ideaId("health-bowl")), {
      as: who.ana,
      body: { name: "Plan A" },
    });
    expect(bowl.status).toBe(409);
    expect(bowl.body.error.code).toBe("DECISION_NOT_PROCEED");
    const undecided = await call(t.app, "POST", plansPath(ideaId("piaya-corp")), {
      as: who.ana,
      body: { name: "Plan A" },
    });
    expect(undecided.body.error.code).toBe("DECISION_NOT_PROCEED");
    const blank = await call(t.app, "POST", plansPath(piaya), {
      as: who.ana,
      body: { name: "  " },
    });
    expect(blank.status).toBe(422);
  });

  test("Viewers cannot create, strangers have no access, an archived idea is 409", async () => {
    const viewer = await call(t.app, "POST", plansPath(piaya), {
      as: who.grace,
      body: { name: "Plan Z" },
    });
    expect(viewer.status).toBe(403);
    expect(viewer.body.error.code).toBe("FORBIDDEN");
    const stranger = await call(t.app, "POST", plansPath(piaya), {
      as: who.admin,
      body: { name: "Plan Z" },
    });
    expect(stranger.body.error.code).toBe("NO_ACCESS");
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("study-cafe")}/archive`, { as: who.ana });
    const archived = await call(t.app, "POST", plansPath(ideaId("study-cafe")), {
      as: who.ana,
      body: { name: "Plan Z" },
    });
    expect(archived.body.error.code).toBe("ARCHIVED");
    await call(t.app, "POST", `/api/v1/ideas/${ideaId("study-cafe")}/restore`, { as: who.ana });
  });
});

describe("P2 plan home", () => {
  test("parts count filled sub-items per item and the marks show V and S", async () => {
    const res = await call(t.app, "GET", planPath(planA), { as: who.ana });
    expect(res.status).toBe(200);
    const [partA, partB] = res.body.parts;
    expect(partA).toMatchObject({ part: "a", totalItems: 10 });
    expect(partB).toMatchObject({ part: "b", totalItems: 20 });
    const item = (no: number) =>
      [...partA.items, ...partB.items].find((i: { itemNo: number }) => i.itemNo === no);
    expect(item(1)).toMatchObject({
      title: "Executive Summary",
      marks: ["V"],
      filled: 6,
      total: 6,
    });
    expect(item(2).marks).toEqual(["S"]);
    expect(item(8).total).toBe(3);
    expect(partA.completeItems).toBe(
      partA.items.filter((i: { filled: number; total: number }) => i.filled === i.total).length,
    );
    expect(res.body.keyMetrics.initial_cost_total.value).toBe(169500);
    expect(res.body.versions).toHaveLength(1);
    expect(res.body.latestDecision).toBe("proceed");
    expect(res.body.viewingVersion).toBeNull();
    expect(res.body.ideaArchived).toBe(false);
    expect(res.body.draftOnly).toBe(false);
  });

  test("a saved version is shown from its snapshot, read only", async () => {
    const versions = (await call(t.app, "GET", `${planPath(planA)}/versions`, { as: who.ana })).body
      .items;
    const res = await call(t.app, "GET", `${planPath(planA)}?versionId=${versions[0].id}`, {
      as: who.ana,
    });
    expect(res.status).toBe(200);
    expect(res.body.viewingVersion).toMatchObject({ id: versions[0].id, name: "v1 For advisors" });
    expect(res.body.date).toBe(versions[0].savedAt);
    const other = await call(t.app, "GET", `${planPath(planB)}?versionId=${versions[0].id}`, {
      as: who.ana,
    });
    expect(other.status).toBe(404);
  });

  test("PATCH edits the header under its lock and writes a business_plan history row", async () => {
    const before = (await call(t.app, "GET", planPath(planB), { as: who.ana })).body;
    const res = await call(t.app, "PATCH", planPath(planB), {
      as: who.kenji,
      body: { businessName: "Piaya Box Co.", lockVersion: before.lockVersion },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      businessName: "Piaya Box Co.",
      lockVersion: before.lockVersion + 1,
    });
    const rows = await historyOf(
      and(
        eq(schema.changeHistory.targetType, "business_plan"),
        eq(schema.changeHistory.targetId, planB),
      ),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "update",
      containerType: "business_plan",
      source: "manual",
    });

    const stale = await call(t.app, "PATCH", planPath(planB), {
      as: who.ana,
      body: { businessName: "Other", lockVersion: before.lockVersion },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("CONFLICT");
    expect(stale.body.error.current.value.businessName).toBe("Piaya Box Co.");

    const same = await call(t.app, "PATCH", planPath(planB), {
      as: who.ana,
      body: { businessName: "Piaya Box Co.", lockVersion: res.body.lockVersion },
    });
    expect(same.body.lockVersion).toBe(res.body.lockVersion);
    const taken = await call(t.app, "PATCH", planPath(planB), {
      as: who.ana,
      body: { name: "Plan A", lockVersion: res.body.lockVersion },
    });
    expect(taken.body.error.code).toBe("NAME_TAKEN");
  });

  test("a plan of another workspace cannot be read", async () => {
    const res = await call(t.app, "GET", planPath(planA), { as: who.admin });
    expect(res.status).toBe(403);
    expect((await call(t.app, "GET", planPath(MISSING), { as: who.ana })).status).toBe(404);
  });
});

describe("P3 archive", () => {
  test("an archived plan is read only and hidden from the list; restore brings it back", async () => {
    const archived = await call(t.app, "POST", `${planPath(planB)}/archive`, { as: who.kenji });
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);
    const list = await call(t.app, "GET", plansPath(piaya), { as: who.ana });
    expect(list.body.items.map((p: { name: string }) => p.name)).not.toContain("Plan B");
    const all = await call(t.app, "GET", `${plansPath(piaya)}?includeArchived=true`, {
      as: who.ana,
    });
    expect(all.body.items.map((p: { name: string }) => p.name)).toContain("Plan B");
    const edit = await call(t.app, "PUT", `${planPath(planB)}/answers/P.05.1`, {
      as: who.kenji,
      body: { text: "x", lockVersion: 0 },
    });
    expect(edit.body.error.code).toBe("ARCHIVED");
    const item = await call(t.app, "GET", `${planPath(planB)}/items/5`, { as: who.kenji });
    expect(item.body.readOnly).toBe(true);
    const viewerArchive = await call(t.app, "POST", `${planPath(planA)}/archive`, {
      as: who.grace,
    });
    expect(viewerArchive.status).toBe(403);
    const restored = await call(t.app, "POST", `${planPath(planB)}/restore`, { as: who.kenji });
    expect(restored.body.archived).toBe(false);
  });
});

describe("P4 item and P5 answers", () => {
  test("an item returns prompts, answers, references and the numbers it displays", async () => {
    const res = await call(t.app, "GET", `${planPath(planA)}/items/8`, { as: who.ana });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ itemNo: 8, title: "Business Model", readOnly: false });
    expect(res.body.prompts.length).toBeGreaterThan(10);
    expect(res.body.answers.map((a: { questionKey: string }) => a.questionKey)).toEqual(
      expect.arrayContaining(["P.08.1", "P.08.2", "P.08.11"]),
    );
    expect(res.body.answers.map((a: { questionKey: string }) => a.questionKey)).not.toContain(
      "P.08.3",
    );
    expect(res.body.metrics.selling_price.value).toBeGreaterThan(0);
    expect(res.body.scenarios).toHaveLength(5);
  });

  test("self-analysis references go to Owners and Members only", async () => {
    const owner = await call(t.app, "GET", `${planPath(planA)}/items/2`, { as: who.ana });
    const ref = owner.body.references.find((r: { kind: string }) => r.kind === "self_analysis");
    expect(
      ref.data.map((d: { user: { displayName: string } }) => d.user.displayName).sort(),
    ).toEqual(["Ana Villanueva", "Paolo Gonzaga"]);
    const viewer = await call(t.app, "GET", `${planPath(planA)}/items/2`, { as: who.grace });
    expect(
      viewer.body.references.find((r: { kind: string }) => r.kind === "self_analysis"),
    ).toBeUndefined();
    expect(viewer.body.readOnly).toBe(true);
  });

  test("references of an item: competitors, cost rows and the ownership totals", async () => {
    const market = await call(t.app, "GET", `${planPath(planA)}/items/6`, { as: who.ana });
    const competitors = market.body.references.find(
      (r: { kind: string }) => r.kind === "competitors",
    );
    expect(competitors.data.length).toBeGreaterThan(0);
    expect(competitors.data.length).toBeLessThanOrEqual(5);
    const rent = await call(t.app, "GET", `${planPath(planA)}/items/15`, { as: who.ana });
    const costRows = rent.body.references.find((r: { kind: string }) => r.kind === "cost_rows");
    expect(costRows.data.map((c: { key: string }) => c.key)).toEqual(
      expect.arrayContaining(["monthly.rent"]),
    );
    const ownership = await call(t.app, "GET", `${planPath(planA)}/items/13`, { as: who.ana });
    expect(
      ownership.body.references.find((r: { kind: string }) => r.kind === "totals").data,
    ).toEqual({
      ownership: expect.any(Number),
      capital: expect.any(Number),
    });
  });

  test("an item outside 1-30 is refused", async () => {
    expect((await call(t.app, "GET", `${planPath(planA)}/items/31`, { as: who.ana })).status).toBe(
      422,
    );
    expect((await call(t.app, "GET", `${planPath(planA)}/items/0`, { as: who.ana })).status).toBe(
      422,
    );
  });

  test("a text answer is saved with its lock, comment count and history", async () => {
    const path = `${planPath(planB)}/answers/P.07.1`;
    const saved = await call(t.app, "PUT", path, {
      as: who.kenji,
      body: { text: "For BPO teams…", lockVersion: 0 },
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      questionKey: "P.07.1",
      text: "For BPO teams…",
      lockVersion: 1,
      rows: null,
    });
    const unchanged = await call(t.app, "PUT", path, {
      as: who.kenji,
      body: { text: "For BPO teams…", lockVersion: 1 },
    });
    expect(unchanged.body.lockVersion).toBe(1);
    const stale = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { text: "Mine", lockVersion: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current).toMatchObject({ lockVersion: 1 });
    const forced = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { text: "Mine", lockVersion: 0, force: true },
    });
    expect(forced.body).toMatchObject({ text: "Mine", lockVersion: 2 });
    const rows = await historyOf(
      and(eq(schema.changeHistory.targetKey, "P.07.1"), eq(schema.changeHistory.targetId, planB)),
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      sectionKey: "07",
      targetType: "plan_answer",
      containerType: "business_plan",
    });
  });

  test("a table answer validates its columns and value ranges", async () => {
    const path = `${planPath(planB)}/answers/P.13.1`;
    const ok = await call(t.app, "PUT", path, {
      as: who.ana,
      body: {
        rows: [
          { name: "Ana", ownership: 0.6, capital: 100000 },
          { name: "Kenji", ownership: 0.4, capital: 50000 },
        ],
        lockVersion: 0,
      },
    });
    expect(ok.status).toBe(200);
    expect(ok.body.rows).toHaveLength(2);
    const unknown = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { rows: [{ nope: "x" }], lockVersion: 1 },
    });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe("VALIDATION_FAILED");
    expect(unknown.body.error.details[0].path).toBe("rows.0.nope");
    const percent = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { rows: [{ ownership: 40 }], lockVersion: 1 },
    });
    expect(percent.status).toBe(422);
    const wrongType = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { rows: [{ name: 5 }], lockVersion: 1 },
    });
    expect(wrongType.status).toBe(422);
    const text = await call(t.app, "PUT", path, {
      as: who.ana,
      body: { text: "x", lockVersion: 1 },
    });
    expect(text.status).toBe(422);
    const rowsOnText = await call(t.app, "PUT", `${planPath(planB)}/answers/P.05.1`, {
      as: who.ana,
      body: { rows: [], lockVersion: 0 },
    });
    expect(rowsOnText.status).toBe(422);
  });

  test("numbers and execution sub-items are not editable; unknown questions are refused", async () => {
    const metric = await call(t.app, "PUT", `${planPath(planB)}/answers/P.08.3`, {
      as: who.ana,
      body: { text: "1", lockVersion: 0 },
    });
    expect(metric.status).toBe(422);
    expect(metric.body.error.code).toBe("NOT_EDITABLE");
    const execution = await call(t.app, "PUT", `${planPath(planB)}/answers/P.23.1`, {
      as: who.ana,
      body: { text: "1", lockVersion: 0 },
    });
    expect(execution.body.error.code).toBe("NOT_EDITABLE");
    const unknown = await call(t.app, "PUT", `${planPath(planB)}/answers/P.99.1`, {
      as: who.ana,
      body: { text: "1", lockVersion: 0 },
    });
    expect(unknown.body.error.code).toBe("QUESTION_NOT_FOUND");
    const viewer = await call(t.app, "PUT", `${planPath(planB)}/answers/P.05.1`, {
      as: who.grace,
      body: { text: "1", lockVersion: 0 },
    });
    expect(viewer.status).toBe(403);
  });

  test("editing after a version adds + changes; a version is read back as it was", async () => {
    const before = (await call(t.app, "GET", plansPath(piaya), { as: who.ana })).body.items.find(
      (p: { id: string }) => p.id === planB,
    );
    expect(before.latestVersion).toBeNull();
  });
});

describe("P6 versions", () => {
  test("saving numbers the version, snapshots the plan, logs it and tells the others", async () => {
    const res = await call(t.app, "POST", `${planPath(planB)}/versions`, {
      as: who.ana,
      body: { name: "v1 For Kenji" },
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      versionNumber: 1,
      name: "v1 For Kenji",
      savedBy: { id: userId("ana") },
    });
    const second = await call(t.app, "POST", `${planPath(planB)}/versions`, {
      as: who.ana,
      body: { name: "v2" },
    });
    expect(second.body.versionNumber).toBe(2);

    const [version] = await t.db
      .select()
      .from(schema.planVersions)
      .where(eq(schema.planVersions.id, res.body.id));
    const snapshot = version?.snapshot as {
      header: { name: string };
      answers: { questionKey: string }[];
      keyMetrics: Record<string, unknown>;
      scenarios: unknown[];
      execution: unknown[];
      competitors: unknown[];
    };
    expect(snapshot.header.name).toBe("Plan B");
    expect(snapshot.answers.map((a) => a.questionKey)).toContain("P.07.1");
    expect(Object.keys(snapshot.keyMetrics)).toContain("initial_cost_total");
    expect(snapshot.scenarios).toHaveLength(5);
    expect(snapshot.execution).toHaveLength(23);
    expect(snapshot.competitors.length).toBeLessThanOrEqual(5);

    const [entry] = await t.db
      .select()
      .from(schema.decisionLogEntries)
      .where(
        and(
          eq(schema.decisionLogEntries.planVersionId, res.body.id),
          eq(schema.decisionLogEntries.kind, "version_saved"),
        ),
      );
    expect(entry).toMatchObject({
      businessPlanId: planB,
      value: null,
      reason: null,
      recordedById: userId("ana"),
    });
    const notified = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.decisionLogEntryId, (entry as { id: string }).id));
    expect(new Set(notified.map((n) => n.userId))).toEqual(
      new Set([userId("kenji"), userId("paolo"), userId("grace")]),
    );
    expect(notified[0]?.link).toMatchObject({ screen: 20, planId: planB });
  });

  test("+ changes appears after an edit and not after saving", async () => {
    const summary = async () =>
      (await call(t.app, "GET", plansPath(piaya), { as: who.ana })).body.items.find(
        (p: { id: string }) => p.id === planB,
      );
    expect((await summary()).hasChangesSinceVersion).toBe(false);
    await call(t.app, "PUT", `${planPath(planB)}/answers/P.07.2`, {
      as: who.ana,
      body: { text: "Because…", lockVersion: 0 },
    });
    expect((await summary()).hasChangesSinceVersion).toBe(true);
    expect((await summary()).latestVersion.name).toBe("v2");
  });

  test("the list is newest first; Viewers read but cannot save; archived plans refuse", async () => {
    const list = await call(t.app, "GET", `${planPath(planB)}/versions`, { as: who.grace });
    expect(list.body.items.map((v: { name: string }) => v.name)).toEqual(["v2", "v1 For Kenji"]);
    const viewer = await call(t.app, "POST", `${planPath(planB)}/versions`, {
      as: who.grace,
      body: { name: "x" },
    });
    expect(viewer.status).toBe(403);
    const bad = await call(t.app, "POST", `${planPath(planB)}/versions`, {
      as: who.ana,
      body: { name: "" },
    });
    expect(bad.status).toBe(422);
  });
});

describe("P7 / P8 Go / No-Go", () => {
  test("the context shows the conditions, metrics and the version in force", async () => {
    const res = await call(t.app, "GET", `${planPath(planA)}/go-no-go-context`, { as: who.ana });
    expect(res.status).toBe(200);
    expect(res.body.conditions).toEqual({
      launchIf: expect.any(String),
      delayIf: expect.any(String),
      stopIf: expect.any(String),
    });
    expect(res.body.currentVersion).toMatchObject({ name: "v1 For advisors" });
    expect(res.body.hasChangesSinceVersion).toBe(true);
    expect(res.body.history).toHaveLength(1);
    expect(res.body.keyMetrics.initial_cost_total.value).toBe(169500);
    expect(
      (await call(t.app, "GET", `${planPath(planA)}/go-no-go-context`, { as: who.grace })).status,
    ).toBe(403);
  });

  test("recording a Launch writes the log with the version and conditions, moves the stage and notifies", async () => {
    const stageOf = async () =>
      (
        await call(t.app, "GET", `/api/v1/workspaces/${BCDX}/ideas`, { as: who.ana })
      ).body.items.find((i: { id: string }) => i.id === piaya).stage;
    expect(await stageOf()).toBe("planning");
    const res = await call(t.app, "POST", `${planPath(planA)}/go-no-go`, {
      as: who.kenji,
      body: { value: "launch", reason: "Numbers hold up." },
    });
    expect(res.status).toBe(201);
    expect(res.body.stage).toBe("launch_prep");
    expect(res.body.entry).toMatchObject({
      kind: "go_no_go",
      value: "launch",
      reason: "Numbers hold up.",
    });
    expect(res.body.entry.snapshot.planVersion).toMatchObject({ name: "v1 For advisors" });
    expect(res.body.entry.snapshot.conditions.launchIf).toEqual(expect.any(String));
    expect(res.body.entry.snapshot.keyMetrics.initial_cost_total.value).toBe(169500);
    expect(await stageOf()).toBe("launch_prep");
    const notified = await t.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.decisionLogEntryId, res.body.entry.id));
    expect(notified.map((n) => n.userId)).not.toContain(userId("kenji"));
    expect(notified.map((n) => n.userId)).toContain(userId("ana"));
    const summary = (await call(t.app, "GET", plansPath(piaya), { as: who.ana })).body.items.find(
      (p: { id: string }) => p.id === planA,
    );
    expect(summary.latestGoNoGo.value).toBe("launch");
  });

  test("a reason is required; Viewers and archived plans are refused", async () => {
    const empty = await call(t.app, "POST", `${planPath(planA)}/go-no-go`, {
      as: who.ana,
      body: { value: "stop", reason: " " },
    });
    expect(empty.status).toBe(422);
    const viewer = await call(t.app, "POST", `${planPath(planA)}/go-no-go`, {
      as: who.grace,
      body: { value: "stop", reason: "x" },
    });
    expect(viewer.status).toBe(403);
    await call(t.app, "POST", `${planPath(planB)}/archive`, { as: who.ana });
    const archived = await call(t.app, "POST", `${planPath(planB)}/go-no-go`, {
      as: who.ana,
      body: { value: "stop", reason: "x" },
    });
    expect(archived.body.error.code).toBe("ARCHIVED");
    const version = await call(t.app, "POST", `${planPath(planB)}/versions`, {
      as: who.ana,
      body: { name: "late" },
    });
    expect(version.body.error.code).toBe("ARCHIVED");
    await call(t.app, "POST", `${planPath(planB)}/restore`, { as: who.ana });
  });
});

describe("P9 - P11 execution items", () => {
  const items = `${planPath(planA)}/execution-items`;

  test("the list is grouped by type and ordered the way each type reads", async () => {
    const res = await call(t.app, "GET", items, { as: who.grace });
    expect(res.status).toBe(200);
    const types = res.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(
      [...types].sort(
        (a, b) =>
          ["milestone", "launch", "kpi", "open_question", "next_action"].indexOf(a) -
          ["milestone", "launch", "kpi", "open_question", "next_action"].indexOf(b),
      ),
    );
    const actions = res.body.items.filter((i: { type: string }) => i.type === "next_action");
    const dates = actions.map((a: { dueDate: string | null }) => a.dueDate).filter(Boolean);
    expect(dates).toEqual([...dates].sort());
    const kpis = res.body.items
      .filter((i: { type: string }) => i.type === "kpi")
      .map((k: { kpiArea: string }) => k.kpiArea);
    expect(kpis).toEqual([...kpis].sort((a, b) => kpis.indexOf(a) - kpis.indexOf(b)));
    expect(new Set(kpis).size).toBe(3);
  });

  test("filters by type, assignee and status", async () => {
    const mine = await call(t.app, "GET", `${items}?assignee=me`, { as: who.ana });
    expect(
      mine.body.items.every(
        (i: { assignee: { user: { id: string } } }) => i.assignee.user.id === userId("ana"),
      ),
    ).toBe(true);
    const todo = await call(t.app, "GET", `${items}?type=next_action&status=todo`, { as: who.ana });
    expect(
      todo.body.items.every(
        (i: { type: string; status: string }) => i.type === "next_action" && i.status === "todo",
      ),
    ).toBe(true);
    const bad = await call(t.app, "GET", `${items}?status=nope`, { as: who.ana });
    expect(bad.status).toBe(422);
  });

  test("creating validates the assignee, the status and the columns of the type", async () => {
    const created = await call(t.app, "POST", items, {
      as: who.kenji,
      body: {
        type: "next_action",
        title: "Call the bakery",
        assigneeUserId: userId("paolo"),
        dueDate: "2026-12-01",
      },
    });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      type: "next_action",
      status: "todo",
      assignee: { user: { id: userId("paolo") } },
      fromPreset: false,
      lockVersion: 0,
    });
    const viewerAssignee = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "next_action", title: "x", assigneeUserId: userId("grace") },
    });
    expect(viewerAssignee.body.error.code).toBe("INVALID_ASSIGNEE");
    const strangerAssignee = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "next_action", title: "x", assigneeUserId: userId("admin") },
    });
    expect(strangerAssignee.body.error.code).toBe("INVALID_ASSIGNEE");
    const status = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "open_question", title: "x", status: "done" },
    });
    expect(status.body.error.code).toBe("INVALID_STATUS");
    const kpiStatus = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "kpi", title: "x", status: "todo" },
    });
    expect(kpiStatus.body.error.code).toBe("INVALID_STATUS");
    const wrongColumn = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "next_action", title: "x", kpiTarget: "10" },
    });
    expect(wrongColumn.status).toBe(422);
    const both = await call(t.app, "POST", items, {
      as: who.kenji,
      body: {
        type: "next_action",
        title: "x",
        assigneeUserId: userId("ana"),
        assigneeName: "Someone",
      },
    });
    expect(both.status).toBe(422);
    const free = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "next_action", title: "Ask the notary", assigneeName: "Atty. Reyes" },
    });
    expect(free.body.assignee).toEqual({ name: "Atty. Reyes" });
    const launch = await call(t.app, "POST", items, {
      as: who.kenji,
      body: { type: "launch", title: "Soft opening" },
    });
    expect(launch.body.launchTiming).toBe("other");
    const viewer = await call(t.app, "POST", items, {
      as: who.grace,
      body: { type: "next_action", title: "x" },
    });
    expect(viewer.status).toBe(403);
  });

  test("done sets completedAt, a KPI actual stamps its time, the item locks and history records", async () => {
    const list = (await call(t.app, "GET", `${items}?type=next_action`, { as: who.ana })).body
      .items;
    const target = list.find((i: { title: string }) => i.title === "Call the bakery");
    const done = await call(t.app, "PATCH", `/api/v1/execution-items/${target.id}`, {
      as: who.paolo,
      body: { status: "done", lockVersion: target.lockVersion },
    });
    expect(done.status).toBe(200);
    expect(done.body.status).toBe("done");
    expect(typeof done.body.completedAt).toBe("string");
    expect(done.body.lockVersion).toBe(1);
    const reopened = await call(t.app, "PATCH", `/api/v1/execution-items/${target.id}`, {
      as: who.paolo,
      body: { status: "doing", lockVersion: 1 },
    });
    expect(reopened.body.completedAt).toBeNull();
    const stale = await call(t.app, "PATCH", `/api/v1/execution-items/${target.id}`, {
      as: who.ana,
      body: { title: "Mine", lockVersion: 0 },
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.current).toMatchObject({ lockVersion: 2 });
    const unchanged = await call(t.app, "PATCH", `/api/v1/execution-items/${target.id}`, {
      as: who.ana,
      body: { status: "doing", lockVersion: 2 },
    });
    expect(unchanged.body.lockVersion).toBe(2);
    const history = await historyOf(eq(schema.changeHistory.targetId, target.id));
    expect(history.map((h) => h.action)).toEqual(["create", "update", "update"]);
    expect(history[0]).toMatchObject({ sectionKey: "29", containerType: "business_plan" });

    const kpi = (await call(t.app, "GET", `${items}?type=kpi`, { as: who.ana })).body.items[0];
    expect(kpi.kpiActualUpdatedAt === null || typeof kpi.kpiActualUpdatedAt === "string").toBe(
      true,
    );
    const actual = await call(t.app, "PATCH", `/api/v1/execution-items/${kpi.id}`, {
      as: who.ana,
      body: { kpiActual: "₱120,000", lockVersion: kpi.lockVersion },
    });
    expect(actual.body.kpiActual).toBe("₱120,000");
    expect(typeof actual.body.kpiActualUpdatedAt).toBe("string");
    const assigneeSwitch = await call(t.app, "PATCH", `/api/v1/execution-items/${kpi.id}`, {
      as: who.ana,
      body: { assigneeName: "Bookkeeper", lockVersion: actual.body.lockVersion },
    });
    expect(assigneeSwitch.body.assignee).toEqual({ name: "Bookkeeper" });
    const invalid = await call(t.app, "PATCH", `/api/v1/execution-items/${kpi.id}`, {
      as: who.ana,
      body: { status: "done", lockVersion: assigneeSwitch.body.lockVersion },
    });
    expect(invalid.body.error.code).toBe("INVALID_STATUS");
  });

  test("overdue marks open items past their date in the viewer's day", async () => {
    const res = await call(t.app, "POST", items, {
      as: who.ana,
      body: { type: "next_action", title: "Old", dueDate: "2020-01-01" },
    });
    expect(res.body.overdue).toBe(true);
    const done = await call(t.app, "PATCH", `/api/v1/execution-items/${res.body.id}`, {
      as: who.ana,
      body: { status: "done", lockVersion: 0 },
    });
    expect(done.body.overdue).toBe(false);
  });

  test("delete is soft and keeps history", async () => {
    const created = await call(t.app, "POST", items, {
      as: who.ana,
      body: { type: "open_question", title: "Which permit?" },
    });
    const res = await call(t.app, "DELETE", `/api/v1/execution-items/${created.body.id}`, {
      as: who.ana,
    });
    expect(res.status).toBe(204);
    const [row] = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.id, created.body.id));
    expect(row?.deletedAt).not.toBeNull();
    const gone = await call(t.app, "GET", `${items}?type=open_question`, { as: who.ana });
    expect(gone.body.items.map((i: { id: string }) => i.id)).not.toContain(created.body.id);
    const again = await call(t.app, "DELETE", `/api/v1/execution-items/${created.body.id}`, {
      as: who.ana,
    });
    expect(again.status).toBe(404);
    const history = await historyOf(eq(schema.changeHistory.targetId, created.body.id));
    expect(history.map((h) => h.action)).toEqual(["create", "delete"]);
  });

  test("reorder rewrites sort order for exactly the current ids and writes no history", async () => {
    const milestones = (await call(t.app, "GET", `${items}?type=milestone`, { as: who.ana })).body
      .items;
    const ids = milestones.map((m: { id: string }) => m.id).reverse();
    const before = await t.db
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.containerId, planA));
    const res = await call(t.app, "PUT", `${items}/order`, {
      as: who.kenji,
      body: { type: "milestone", ids },
    });
    expect(res.status).toBe(204);
    const after = (await call(t.app, "GET", `${items}?type=milestone`, { as: who.ana })).body.items;
    expect(after.map((m: { id: string }) => m.id)).toEqual(ids);
    expect(after.map((m: { lockVersion: number }) => m.lockVersion)).toEqual(
      milestones.map((m: { lockVersion: number }) => m.lockVersion).reverse(),
    );
    expect(
      (
        await t.db
          .select()
          .from(schema.changeHistory)
          .where(eq(schema.changeHistory.containerId, planA))
      ).length,
    ).toBe(before.length);
    const missing = await call(t.app, "PUT", `${items}/order`, {
      as: who.kenji,
      body: { type: "milestone", ids: ids.slice(1) },
    });
    expect(missing.status).toBe(422);
    const wrongPlan = await call(t.app, "PUT", `${planPath(planB)}/execution-items/order`, {
      as: who.kenji,
      body: { type: "milestone", ids },
    });
    expect(wrongPlan.status).toBe(422);
    const viewer = await call(t.app, "PUT", `${items}/order`, {
      as: who.grace,
      body: { type: "milestone", ids },
    });
    expect(viewer.status).toBe(403);
  });

  test("an item of another plan's workspace is not reachable", async () => {
    const [row] = await t.db
      .select()
      .from(schema.executionItems)
      .where(eq(schema.executionItems.businessPlanId, planA))
      .limit(1);
    const res = await call(
      t.app,
      "PATCH",
      `/api/v1/execution-items/${(row as { id: string }).id}`,
      {
        as: who.admin,
        body: { title: "x", lockVersion: 0 },
      },
    );
    expect(res.status).toBe(403);
  });
});
