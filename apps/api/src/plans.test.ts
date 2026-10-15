import { afterAll, describe, expect, test } from "bun:test";
import {
  assumptions,
  businessPlans,
  changeHistory,
  comments,
  competitors,
  decisionLogEntries,
  evidenceLinks,
  executionItems,
  ideas,
  notifications,
  planAnswers,
  planVersions,
  researchLogEntries,
  risks,
  templateVersions,
  validationAnswers,
} from "@moonx/db";
import {
  errorBodySchema,
  goNoGoContextSchema,
  goNoGoResultSchema,
  ideaDetailSchema,
  type PlanHome,
  planHomeSchema,
  planItemSchema,
  planListSchema,
  planSummarySchema,
  planVersionListSchema,
  planVersionSnapshotSchema,
  planVersionSummarySchema,
} from "@moonx/schemas";
import { and, asc, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithProceedIdea, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
// 2026-10-01 11:00 in Manila, the users' time zone.
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

type Team = Awaited<ReturnType<typeof teamWithProceedIdea>>;
const newTeam = () => teamWithProceedIdea(app, fixtures);

const call = (
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

async function draft(team: Team, name = "Plan A", cookie = team.memberCookie) {
  const response = await call(
    "POST",
    `/api/v1/ideas/${team.idea.id}/plans`,
    cookie,
    { name },
  );
  expect(response.status).toBe(201);
  return planHomeSchema.parse(await response.json());
}

const home = async (team: Team, planId: string, query = "") => {
  const response = await call(
    "GET",
    `/api/v1/plans/${planId}${query}`,
    team.viewerCookie,
  );
  expect(response.status).toBe(200);
  return planHomeSchema.parse(await response.json());
};

const answer = (validationId: string, questionKey: string, text: string) =>
  db
    .insert(validationAnswers)
    .values({ validationId, questionKey, text, lockVersion: 1 });

const planAnswer = async (planId: string, questionKey: string) =>
  (
    await db
      .select()
      .from(planAnswers)
      .where(
        and(
          eq(planAnswers.businessPlanId, planId),
          eq(planAnswers.questionKey, questionKey),
        ),
      )
  )[0];

const itemOf = (view: PlanHome, n: number) =>
  view.parts.flatMap((part) => part.items).find((item) => item.itemNo === n);

describe("P1 POST /api/v1/ideas/{ideaId}/plans (M5)", () => {
  test("drafts the plan from the validation as one plan_draft operation", async () => {
    const team = await newTeam();
    const { validationId } = team;
    await db
      .update(ideas)
      .set({ proposedSolution: "Boxes of 12, delivered before 10 a.m." })
      .where(eq(ideas.id, team.idea.id));
    await answer(validationId, "V.01.WHO", "HR officers of Bacolod offices");
    await answer(validationId, "V.01.WHY_THEM", "They buy gifts every month");
    await answer(validationId, "V.01.BEHAVIOR", "   ");
    await answer(validationId, "V.02.OCEAN", "Red");
    const [log] = await db
      .insert(researchLogEntries)
      .values({
        validationId,
        observedOn: "2026-09-01",
        topic: "Price check",
        createdById: team.owner.id,
      })
      .returning();
    const [gone] = await db
      .insert(researchLogEntries)
      .values({
        validationId,
        topic: "Old visit",
        createdById: team.owner.id,
        deletedAt: new Date(clock),
      })
      .returning();
    const [first, second] = await db
      .insert(assumptions)
      .values([
        {
          validationId,
          statement: "Offices reorder monthly",
          whyBelieve: "Two said so",
          evidenceNote: "Ask the pilot offices",
          disproveCondition: "No reorder in 6 weeks",
          sortOrder: 0,
        },
        { validationId, statement: "Piaya keeps 3 days", sortOrder: 1 },
      ])
      .returning();
    if (!log || !gone || !first || !second) throw new Error("rows not made");
    const at = (ms: number) => new Date(clock + ms);
    await db.insert(evidenceLinks).values([
      {
        workspaceId: team.workspace.id,
        validationId,
        targetType: "assumption",
        targetId: first.id,
        researchLogEntryId: log.id,
        createdById: team.owner.id,
        createdAt: at(0),
      },
      {
        workspaceId: team.workspace.id,
        validationId,
        targetType: "assumption",
        targetId: first.id,
        url: "https://example.com/survey",
        note: "20 HR officers",
        createdById: team.owner.id,
        createdAt: at(1),
      },
      {
        workspaceId: team.workspace.id,
        validationId,
        targetType: "assumption",
        targetId: second.id,
        researchLogEntryId: gone.id,
        createdById: team.owner.id,
        createdAt: at(2),
      },
    ]);
    await db.insert(risks).values([
      {
        validationId,
        statement: "Low risk",
        impact: "low",
        probability: "low",
      },
      {
        validationId,
        statement: "High risk",
        impact: "high",
        probability: "medium",
        mitigation: "Bake the same morning",
      },
      { validationId, statement: "Deleted", deletedAt: new Date(clock) },
    ]);

    const view = await draft(team);
    expect(view).toMatchObject({
      name: "Plan A",
      archived: false,
      businessName: "Piaya boxes",
      preparedBy: "Member",
      ideaId: team.idea.id,
      workspaceId: team.workspace.id,
      latestDecision: "proceed",
      draftOnly: true,
      latestVersion: null,
      hasChangesSinceVersion: false,
      viewingVersion: null,
      versions: [],
      lockVersion: 0,
      execution: { dueSoon: 0, overdue: 0 },
    });
    expect(view.parts.map((part) => [part.part, part.totalItems])).toEqual([
      ["a", 10],
      ["b", 20],
    ]);
    // The concept, WHO and the solution; 01 PROBLEM is not answered.
    expect(itemOf(view, 1)).toMatchObject({
      marks: ["V"],
      filled: 3,
      total: 6,
    });
    expect(itemOf(view, 2)).toMatchObject({ marks: ["S"], filled: 0 });
    expect(itemOf(view, 23)).toMatchObject({ marks: [], filled: 1, total: 1 });
    expect(itemOf(view, 28)).toMatchObject({ filled: 0, total: 1 });

    const planId = view.id;
    expect(await planAnswer(planId, "P.01.1")).toMatchObject({
      text: "Gift boxes for offices",
      rows: null,
      lockVersion: 1,
      copiedFrom: {
        source: "IDEA.ONE_LINE_CONCEPT",
        copiedAt: new Date(clock).toISOString(),
      },
    });
    expect((await planAnswer(planId, "P.03.1"))?.text).toBe(
      "HR officers of Bacolod offices\n\nThey buy gifts every month",
    );
    expect((await planAnswer(planId, "P.05.1"))?.text).toBe(
      "Boxes of 12, delivered before 10 a.m.",
    );
    expect((await planAnswer(planId, "P.06.1"))?.text).toBe("Red");
    // A blank answer copies nothing, and an unanswered one leaves no row.
    expect(await planAnswer(planId, "P.03.3")).toBeUndefined();
    expect(await planAnswer(planId, "P.04.2")).toBeUndefined();
    expect((await planAnswer(planId, "P.21.1"))?.rows).toEqual([
      {
        assumption: "Offices reorder monthly",
        why_we_believe_it: "Two said so",
        evidence:
          "2026-09-01 Price check; https://example.com/survey (20 HR officers); Ask the pilot offices",
        what_would_disprove_it: "No reorder in 6 weeks",
      },
      {
        assumption: "Piaya keeps 3 days",
        why_we_believe_it: null,
        evidence: null,
        what_would_disprove_it: null,
      },
    ]);
    expect((await planAnswer(planId, "P.22.1"))?.rows).toEqual([
      {
        risk: "High risk",
        probability: "Medium",
        impact: "High",
        mitigation: "Bake the same morning",
        trigger_indicator: null,
      },
      {
        risk: "Low risk",
        probability: "Low",
        impact: "Low",
        mitigation: null,
        trigger_indicator: null,
      },
    ]);

    const items = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.businessPlanId, planId))
      .orderBy(asc(executionItems.type), asc(executionItems.sortOrder));
    expect(items.map((item) => `${item.type} ${item.sortOrder}`)).toEqual([
      ...[0, 1, 2, 3, 4, 5].map((n) => `milestone ${n}`),
      ...[0, 1, 2, 3, 4].map((n) => `launch ${n}`),
      ...[...Array(12).keys()].map((n) => `kpi ${n}`),
    ]);
    expect(items[0]).toMatchObject({
      title: "Business decision",
      status: "todo",
      fromPreset: true,
      lockVersion: 0,
    });
    expect(items[6]).toMatchObject({
      title: "30 days before launch",
      launchTiming: "t_minus_30",
      status: "todo",
    });
    expect(items[11]).toMatchObject({
      title: "Revenue",
      kpiArea: "Financial",
      status: null,
    });

    const [plan] = await db
      .select()
      .from(businessPlans)
      .where(eq(businessPlans.id, planId));
    expect(plan).toMatchObject({
      createdFromDecisionId: team.decision.id,
      createdById: team.member.id,
    });
    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerId, planId));
    const answerCount = (
      await db
        .select()
        .from(planAnswers)
        .where(eq(planAnswers.businessPlanId, planId))
    ).length;
    expect(history).toHaveLength(1 + answerCount + items.length);
    expect(new Set(history.map((row) => row.batchId)).size).toBe(1);
    expect(history[0]?.batchId).not.toBeNull();
    expect(
      history.every(
        (row) =>
          row.source === "plan_draft" &&
          row.action === "create" &&
          row.containerType === "business_plan" &&
          row.workspaceId === team.workspace.id,
      ),
    ).toBe(true);
    expect(
      history.find((row) => row.targetType === "business_plan")?.after,
    ).toEqual({
      name: "Plan A",
      businessName: "Piaya boxes",
      preparedBy: "Member",
    });

    const idea = await call(
      "GET",
      `/api/v1/ideas/${team.idea.id}`,
      team.viewerCookie,
    );
    expect(ideaDetailSchema.parse(await idea.json()).stage).toBe("planning");
  });

  test("refuses without a Proceed decision, a taken name, an archived idea and a Viewer", async () => {
    const team = await newTeam();
    const path = `/api/v1/ideas/${team.idea.id}/plans`;
    await fixtures.createDecision(
      { id: team.idea.id, workspaceId: team.workspace.id },
      team.owner.id,
      "hold",
    );
    const held = await call("POST", path, team.memberCookie, { name: "A" });
    expect(held.status).toBe(409);
    expect((await errorOf(held)).code).toBe("DECISION_NOT_PROCEED");
    await fixtures.createDecision(
      { id: team.idea.id, workspaceId: team.workspace.id },
      team.owner.id,
    );

    const planA = await draft(team);
    const taken = await call("POST", path, team.memberCookie, {
      name: "Plan A",
    });
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).code).toBe("NAME_TAKEN");
    // An archived plan's name still counts; one whose creation was undone does not.
    await db
      .update(businessPlans)
      .set({ archivedAt: new Date(clock) })
      .where(eq(businessPlans.id, planA.id));
    expect(
      (await call("POST", path, team.memberCookie, { name: "Plan A" })).status,
    ).toBe(409);
    await db
      .update(businessPlans)
      .set({ deletedAt: new Date(clock) })
      .where(eq(businessPlans.id, planA.id));
    await draft(team, "Plan A");

    const blank = await call("POST", path, team.memberCookie, { name: " " });
    expect(blank.status).toBe(422);
    const viewer = await call("POST", path, team.viewerCookie, { name: "B" });
    expect(viewer.status).toBe(403);
    await db
      .update(ideas)
      .set({ archivedAt: new Date(clock) })
      .where(eq(ideas.id, team.idea.id));
    const archived = await call("POST", path, team.memberCookie, {
      name: "B",
    });
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });

  test("answers 409 TEMPLATE_NOT_PUBLISHED before a plan template is published", async () => {
    const team = await newTeam();
    const version = await fixtures.templateVersion("business_plan");
    await db
      .update(templateVersions)
      .set({ status: "draft", publishedAt: null })
      .where(eq(templateVersions.id, version.id));
    try {
      const response = await call(
        "POST",
        `/api/v1/ideas/${team.idea.id}/plans`,
        team.memberCookie,
        { name: "Plan A" },
      );
      expect(response.status).toBe(409);
      expect((await errorOf(response)).code).toBe("TEMPLATE_NOT_PUBLISHED");
    } finally {
      await db
        .update(templateVersions)
        .set({ status: "published", publishedAt: version.publishedAt })
        .where(eq(templateVersions.id, version.id));
    }
  });
});

describe("P1 GET, P2 and P3", () => {
  test("lists the plans in the order made, archived ones on request", async () => {
    const team = await newTeam();
    const a = await draft(team, "Plan A");
    clock += 1000;
    const b = await draft(team, "Plan B");
    const archive = await call(
      "POST",
      `/api/v1/plans/${a.id}/archive`,
      team.memberCookie,
    );
    expect(archive.status).toBe(200);
    expect(planSummarySchema.parse(await archive.json()).archived).toBe(true);
    const list = async (query: string) => {
      const response = await call(
        "GET",
        `/api/v1/ideas/${team.idea.id}/plans${query}`,
        team.viewerCookie,
      );
      expect(response.status).toBe(200);
      return planListSchema.parse(await response.json()).items;
    };
    expect((await list("")).map((plan) => plan.id)).toEqual([b.id]);
    expect(
      (await list("?includeArchived=true")).map((plan) => [
        plan.name,
        plan.archived,
      ]),
    ).toEqual([
      ["Plan A", true],
      ["Plan B", false],
    ]);
  });

  test("P2 PATCH edits the header under the lock, with its history", async () => {
    const team = await newTeam();
    const view = await draft(team);
    await draft(team, "Plan B");
    const path = `/api/v1/plans/${view.id}`;
    clock += 60_000;
    const saved = await call("PATCH", path, team.ownerCookie, {
      name: "Plan A2",
      businessName: "Piaya Gift Box Co.",
      preparedBy: "  ",
      lockVersion: 0,
    });
    expect(saved.status).toBe(200);
    const after = planHomeSchema.parse(await saved.json());
    expect(after).toMatchObject({
      name: "Plan A2",
      businessName: "Piaya Gift Box Co.",
      preparedBy: "",
      lockVersion: 1,
      updatedAt: new Date(clock).toISOString(),
      date: new Date(clock).toISOString(),
      draftOnly: true,
    });
    expect(after.updatedBy?.id).toBe(team.owner.id);

    const same = await call("PATCH", path, team.ownerCookie, {
      name: "Plan A2",
      lockVersion: 0,
    });
    expect(planHomeSchema.parse(await same.json()).lockVersion).toBe(1);
    const stale = await call("PATCH", path, team.memberCookie, {
      businessName: "Other",
      lockVersion: 0,
    });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: {
        lockVersion: 1,
        value: {
          name: "Plan A2",
          businessName: "Piaya Gift Box Co.",
          preparedBy: "",
        },
      },
    });
    const taken = await call("PATCH", path, team.ownerCookie, {
      name: "Plan B",
      lockVersion: 1,
    });
    expect(taken.status).toBe(409);
    expect((await errorOf(taken)).code).toBe("NAME_TAKEN");

    const history = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetType, "business_plan"),
          eq(changeHistory.targetId, view.id),
          eq(changeHistory.source, "manual"),
        ),
      );
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      action: "update",
      before: { name: "Plan A", businessName: "Piaya boxes" },
      after: { name: "Plan A2", businessName: "Piaya Gift Box Co." },
    });
  });

  test("P3 archives without history, keeping updatedAt; an archived plan refuses edits", async () => {
    const team = await newTeam();
    const view = await draft(team);
    clock += 60_000;
    await call("POST", `/api/v1/plans/${view.id}/archive`, team.memberCookie);
    const archived = await home(team, view.id);
    expect(archived).toMatchObject({
      archived: true,
      updatedAt: view.updatedAt,
    });
    const edit = await call(
      "PATCH",
      `/api/v1/plans/${view.id}`,
      team.memberCookie,
      {
        name: "X",
        lockVersion: 0,
      },
    );
    expect(edit.status).toBe(409);
    expect((await errorOf(edit)).code).toBe("ARCHIVED");
    const restored = await call(
      "POST",
      `/api/v1/plans/${view.id}/restore`,
      team.memberCookie,
    );
    expect(planSummarySchema.parse(await restored.json()).archived).toBe(false);
    const history = await db
      .select()
      .from(changeHistory)
      .where(eq(changeHistory.containerId, view.id));
    expect(history.every((row) => row.source === "plan_draft")).toBe(true);

    await db
      .update(ideas)
      .set({ archivedAt: new Date(clock) })
      .where(eq(ideas.id, team.idea.id));
    const refused = await call(
      "POST",
      `/api/v1/plans/${view.id}/archive`,
      team.memberCookie,
    );
    expect(refused.status).toBe(409);
    expect((await errorOf(refused)).code).toBe("ARCHIVED");
  });

  test("P2 GET counts what is due and overdue, and leaves draftOnly once an item changes", async () => {
    const team = await newTeam();
    const view = await draft(team);
    const due = (days: number) =>
      new Date(clock + days * 86_400_000).toISOString().slice(0, 10);
    for (const [dueDate, status] of [
      [due(-1), "todo"],
      [due(-3), "done"],
      [due(0), "doing"],
      [due(7), "todo"],
      [due(8), "todo"],
      [null, "todo"],
    ] as const) {
      await fixtures.createExecutionItem(view.id, { dueDate, status });
    }
    const after = await home(team, view.id);
    expect(after.execution).toEqual({ dueSoon: 2, overdue: 1 });
    expect(after.draftOnly).toBe(false);
    expect(itemOf(after, 29)).toMatchObject({ filled: 1, total: 1 });
  });
});

describe("P6 versions, P7 and P8 Go / No-Go", () => {
  test("P6 saves a snapshot, logs version_saved and notifies; + changes follows later edits", async () => {
    const team = await newTeam();
    const view = await draft(team);
    await db.insert(competitors).values(
      ["A", "B", "C", "D", "E", "F"].map((name, index) => ({
        validationId: team.validationId,
        name,
        sortOrder: 5 - index,
      })),
    );
    clock += 60_000;
    const saved = await call(
      "POST",
      `/api/v1/plans/${view.id}/versions`,
      team.memberCookie,
      { name: "v1 For advisors" },
    );
    expect(saved.status).toBe(201);
    const version = planVersionSummarySchema.parse(await saved.json());
    expect(version).toMatchObject({
      versionNumber: 1,
      name: "v1 For advisors",
      savedAt: new Date(clock).toISOString(),
    });
    expect(version.savedBy.id).toBe(team.member.id);

    const [row] = await db
      .select()
      .from(planVersions)
      .where(eq(planVersions.id, version.id));
    const snapshot = planVersionSnapshotSchema.parse(row?.snapshot);
    expect(snapshot.header).toEqual({
      name: "Plan A",
      businessName: "Piaya boxes",
      preparedBy: "Member",
    });
    expect(snapshot.answers.map((a) => a.questionKey)).toContain("P.01.1");
    expect(snapshot.execution).toHaveLength(23);
    expect(snapshot.scenarios).toHaveLength(5);
    expect(snapshot.competitors.map((c) => c.name)).toEqual([
      "F",
      "E",
      "D",
      "C",
      "B",
    ]);
    expect(snapshot.keyMetrics.initial_cost_total).toBeDefined();

    const [entry] = await db
      .select()
      .from(decisionLogEntries)
      .where(eq(decisionLogEntries.planVersionId, version.id));
    expect(entry).toMatchObject({
      kind: "version_saved",
      value: null,
      reason: null,
      businessPlanId: view.id,
    });
    expect(entry?.snapshot).toMatchObject({
      planVersion: { id: version.id, name: "v1 For advisors" },
    });
    const notified = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.decisionLogEntryId, entry?.id ?? ""));
    expect(notified.map((n) => n.userId).sort()).toEqual(
      [team.owner.id, team.viewer.id].sort(),
    );

    const fresh = await home(team, view.id);
    expect(fresh).toMatchObject({
      latestVersion: { id: version.id, name: "v1 For advisors" },
      hasChangesSinceVersion: false,
    });
    clock += 60_000;
    const edit = await call(
      "PUT",
      `/api/v1/plans/${view.id}/answers/P.01.5`,
      team.memberCookie,
      { text: "Monthly invoices", lockVersion: 0 },
    );
    expect(edit.status).toBe(200);
    const changed = await home(team, view.id);
    expect(changed.hasChangesSinceVersion).toBe(true);
    expect(itemOf(changed, 1)?.filled).toBe(2);

    // The version shows the plan as it was saved.
    const old = await home(team, view.id, `?versionId=${version.id}`);
    expect(old).toMatchObject({
      viewingVersion: { id: version.id, name: "v1 For advisors" },
      date: version.savedAt,
    });
    expect(itemOf(old, 1)?.filled).toBe(1);

    clock += 60_000;
    const second = await call(
      "POST",
      `/api/v1/plans/${view.id}/versions`,
      team.ownerCookie,
      { name: "v2" },
    );
    expect(
      planVersionSummarySchema.parse(await second.json()).versionNumber,
    ).toBe(2);
    const list = await call(
      "GET",
      `/api/v1/plans/${view.id}/versions`,
      team.viewerCookie,
    );
    expect(
      planVersionListSchema.parse(await list.json()).items.map((v) => v.name),
    ).toEqual(["v2", "v1 For advisors"]);

    const other = await draft(team, "Plan B");
    const elsewhere = await call(
      "GET",
      `/api/v1/plans/${other.id}?versionId=${version.id}`,
      team.viewerCookie,
    );
    expect(elsewhere.status).toBe(404);
    const unreadable = await call(
      "GET",
      `/api/v1/plans/${other.id}?versionId=v1`,
      team.viewerCookie,
    );
    expect(unreadable.status).toBe(422);
  });

  test("keeps changes after versions and versions after changes when clocks disagree", async () => {
    const team = await newTeam();
    const view = await draft(team);
    const save = async (name: string) =>
      planVersionSummarySchema.parse(
        await (
          await call(
            "POST",
            `/api/v1/plans/${view.id}/versions`,
            team.memberCookie,
            { name },
          )
        ).json(),
      );
    const first = await save("v1");
    // An instance whose clock runs ten minutes ahead saved it.
    const ahead = new Date(clock + 600_000);
    await db
      .update(planVersions)
      .set({ savedAt: ahead })
      .where(eq(planVersions.id, first.id));
    const edit = await call(
      "PUT",
      `/api/v1/plans/${view.id}/answers/P.01.5`,
      team.memberCookie,
      { text: "Monthly invoices", lockVersion: 0 },
    );
    expect(edit.status).toBe(200);
    const [answer] = await db
      .select()
      .from(planAnswers)
      .where(
        and(
          eq(planAnswers.businessPlanId, view.id),
          eq(planAnswers.questionKey, "P.01.5"),
        ),
      );
    expect(answer?.updatedAt.getTime()).toBe(ahead.getTime() + 1);
    expect((await home(team, view.id)).hasChangesSinceVersion).toBe(true);

    // A change stamped ahead of this clock goes into the next version.
    await db
      .update(planAnswers)
      .set({ updatedAt: new Date(clock + 1_200_000) })
      .where(eq(planAnswers.id, answer?.id ?? ""));
    const second = await save("v2");
    expect(Date.parse(second.savedAt)).toBe(clock + 1_200_001);
    expect((await home(team, view.id)).hasChangesSinceVersion).toBe(false);
  });

  test("counts comments on the items shown that still exist, and gives Viewers no [S]", async () => {
    const team = await newTeam();
    const view = await draft(team);
    const [milestone] = await db
      .select()
      .from(executionItems)
      .where(
        and(
          eq(executionItems.businessPlanId, view.id),
          eq(executionItems.type, "milestone"),
        ),
      );
    if (milestone === undefined) throw new Error("No milestone");
    await db.insert(comments).values({
      workspaceId: team.workspace.id,
      containerType: "business_plan",
      containerId: view.id,
      sectionKey: "execution",
      targetType: "execution_item",
      targetId: milestone.id,
      authorId: team.owner.id,
      body: "Who signs?",
    });
    const version = planVersionSummarySchema.parse(
      await (
        await call(
          "POST",
          `/api/v1/plans/${view.id}/versions`,
          team.memberCookie,
          {
            name: "v1",
          },
        )
      ).json(),
    );
    const saved = `?versionId=${version.id}`;
    expect(itemOf(await home(team, view.id, saved), 23)?.commentCount).toBe(1);
    const deleted = await call(
      "DELETE",
      `/api/v1/execution-items/${milestone.id}`,
      team.memberCookie,
    );
    expect(deleted.status).toBe(204);
    const old = await home(team, view.id, saved);
    expect(itemOf(old, 23)).toMatchObject({ commentCount: 0, filled: 1 });
    const item = await call(
      "GET",
      `/api/v1/plans/${view.id}/items/23${saved}`,
      team.memberCookie,
    );
    const shown = planItemSchema.parse(await item.json()).execution;
    expect(shown.find((row) => row.id === milestone.id)?.commentCount).toBe(0);

    expect(itemOf(old, 2)?.marks).toEqual([]);
    expect(itemOf(await draft(team, "Plan B"), 2)?.marks).toEqual(["S"]);
  });

  test("P7 and P8 record the Go / No-Go on the latest version with §24", async () => {
    const team = await newTeam();
    const view = await draft(team);
    for (const [key, text] of [
      ["P.24.1", "Three offices reorder"],
      ["P.24.2", "  "],
      ["P.24.3", "Nobody reorders"],
    ]) {
      await call(
        "PUT",
        `/api/v1/plans/${view.id}/answers/${key}`,
        team.memberCookie,
        { text, lockVersion: 0 },
      );
    }
    const context = async () => {
      const response = await call(
        "GET",
        `/api/v1/plans/${view.id}/go-no-go-context`,
        team.memberCookie,
      );
      expect(response.status).toBe(200);
      return goNoGoContextSchema.parse(await response.json());
    };
    expect(await context()).toMatchObject({
      conditions: {
        launchIf: "Three offices reorder",
        delayIf: null,
        stopIf: "Nobody reorders",
      },
      currentVersion: null,
      hasChangesSinceVersion: false,
      history: [],
    });
    const viewer = await call(
      "GET",
      `/api/v1/plans/${view.id}/go-no-go-context`,
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);

    const path = `/api/v1/plans/${view.id}/go-no-go`;
    const noVersion = await call("POST", path, team.memberCookie, {
      value: "delay",
      reason: "Waiting for the pilot",
    });
    expect(noVersion.status).toBe(201);
    const delayed = goNoGoResultSchema.parse(await noVersion.json());
    expect(delayed).toMatchObject({
      stage: "planning",
      entry: {
        kind: "go_no_go",
        value: "delay",
        versionName: null,
        plan: { id: view.id, name: "Plan A" },
        reason: "Waiting for the pilot",
        snapshot: {
          conditions: {
            launchIf: "Three offices reorder",
            delayIf: null,
            stopIf: "Nobody reorders",
          },
          planVersion: null,
        },
      },
    });

    const version = planVersionSummarySchema.parse(
      await (
        await call(
          "POST",
          `/api/v1/plans/${view.id}/versions`,
          team.ownerCookie,
          {
            name: "v1",
          },
        )
      ).json(),
    );
    clock += 60_000;
    const launch = await call("POST", path, team.ownerCookie, {
      value: "launch",
      reason: "Pilot went well",
    });
    const launched = goNoGoResultSchema.parse(await launch.json());
    expect(launched).toMatchObject({
      stage: "launch_prep",
      entry: {
        value: "launch",
        versionName: "v1",
        snapshot: { planVersion: { id: version.id, name: "v1" } },
      },
    });
    const notified = await db
      .select({ userId: notifications.userId })
      .from(notifications)
      .where(eq(notifications.decisionLogEntryId, launched.entry.id));
    expect(notified.map((n) => n.userId).sort()).toEqual(
      [team.member.id, team.viewer.id].sort(),
    );
    const after = await context();
    expect(after.currentVersion?.id).toBe(version.id);
    expect(after.history.map((entry) => entry.value)).toEqual([
      "launch",
      "delay",
    ]);
    expect((await home(team, view.id)).latestGoNoGo?.value).toBe("launch");

    const blank = await call("POST", path, team.memberCookie, {
      value: "stop",
      reason: " ",
    });
    expect(blank.status).toBe(422);
    await call("POST", `/api/v1/plans/${view.id}/archive`, team.memberCookie);
    const archived = await call("POST", path, team.memberCookie, {
      value: "stop",
      reason: "Archived",
    });
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
  });
});
