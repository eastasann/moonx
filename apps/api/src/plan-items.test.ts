import { afterAll, describe, expect, test } from "bun:test";
import {
  businessPlans,
  changeHistory,
  competitors,
  costItems,
  ideas,
  importTemplateFile,
  planAnswers,
  researchLogEntries,
  selfAnalysisAnswers,
  templateQuestions,
  templateVersions,
} from "@moonx/db";
import {
  errorBodySchema,
  type PlanItem,
  planAnswerSchema,
  planHomeSchema,
  planItemSchema,
  planVersionSummarySchema,
  type TemplateFile,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { buildTestApp, connectTestDatabase } from "./test-app";
import { apiRequest, teamWithProceedIdea, testFixtures } from "./test-fixtures";

const database = connectTestDatabase();
const { db } = database;
afterAll(() => database.close());

const fixtures = testFixtures(db);
let clock = Date.UTC(2026, 9, 1, 3, 0);
const { app } = buildTestApp(database, { now: () => clock });

const errorOf = async (response: Response) =>
  errorBodySchema.parse(await response.json()).error;

type Team = Awaited<ReturnType<typeof teamWithProceedIdea>>;

const call = (
  method: "GET" | "POST" | "PUT",
  path: string,
  cookie: string,
  body?: unknown,
) => app.handle(apiRequest(method, path, { cookie, body }));

/** A team with a Proceed idea and Plan A drafted by its Member. */
async function teamWithPlan() {
  const team = await teamWithProceedIdea(app, fixtures);
  const response = await call(
    "POST",
    `/api/v1/ideas/${team.idea.id}/plans`,
    team.memberCookie,
    { name: "Plan A" },
  );
  expect(response.status).toBe(201);
  const plan = planHomeSchema.parse(await response.json());
  return { ...team, planId: plan.id };
}

type PlanTeam = Awaited<ReturnType<typeof teamWithPlan>>;

async function item(
  team: PlanTeam,
  itemNo: number | string,
  cookie = team.memberCookie,
  query = "",
): Promise<PlanItem> {
  const response = await call(
    "GET",
    `/api/v1/plans/${team.planId}/items/${itemNo}${query}`,
    cookie,
  );
  expect(response.status).toBe(200);
  return planItemSchema.parse(await response.json());
}

const save = (
  team: Team & { planId: string },
  key: string,
  body: Record<string, unknown>,
  cookie = team.memberCookie,
) => call("PUT", `/api/v1/plans/${team.planId}/answers/${key}`, cookie, body);

const refOf = (view: PlanItem, kind: string) =>
  view.references.find((reference) => reference.kind === kind);

describe("P4 GET /api/v1/plans/{planId}/items/{itemNo}", () => {
  test("gives the prompts, an answer per answerable one, the numbers and the execution views", async () => {
    const team = await teamWithPlan();
    const first = await item(team, 1);
    expect(first).toMatchObject({
      itemNo: 1,
      title: "Executive Summary",
      readOnly: false,
      scenarios: [],
      execution: [],
      references: [],
    });
    expect(first.prompts.map((prompt) => prompt.key)).toEqual(
      [1, 2, 3, 4, 5, 6, 7].map((n) => `P.01.${n}`),
    );
    expect(first.answers.map((answer) => answer.questionKey)).toEqual(
      [1, 2, 3, 4, 5, 6].map((n) => `P.01.${n}`),
    );
    expect(first.answers[0]).toMatchObject({
      text: "Gift boxes for offices",
      lockVersion: 1,
      copiedFrom: { source: "IDEA.ONE_LINE_CONCEPT" },
    });
    expect(first.answers[4]).toMatchObject({
      text: null,
      lockVersion: 0,
      updatedAt: null,
      copiedFrom: null,
    });
    expect(Object.keys(first.metrics).sort()).toEqual(
      [
        "break_even_units_month",
        "expected_operating_profit",
        "expected_revenue",
        "initial_cost_total",
        "payback_months",
      ].sort(),
    );

    const model = await item(team, 8);
    expect(model.scenarios.map((column) => column.key)).toEqual([
      "expected",
      "capacity",
    ]);
    expect(model.metrics.selling_price).toEqual({
      value: null,
      bound: "exact",
      reason: "empty",
    });
    const milestones = await item(team, 23);
    expect(milestones.answers).toEqual([]);
    expect(milestones.execution.map((row) => row.title)).toEqual([
      "Business decision",
      "Legal / company setup",
      "Location / supplier readiness",
      "Product / service readiness",
      "Team readiness",
      "Launch readiness",
    ]);
    expect(milestones.execution[0]).toMatchObject({
      type: "milestone",
      status: "todo",
      fromPreset: true,
      overdue: false,
      assignee: null,
    });

    const viewer = await item(team, 1, team.viewerCookie);
    expect(viewer.readOnly).toBe(true);
    const outOfRange = await call(
      "GET",
      `/api/v1/plans/${team.planId}/items/31`,
      team.memberCookie,
    );
    expect(outOfRange.status).toBe(422);
    const notNumber = await call(
      "GET",
      `/api/v1/plans/${team.planId}/items/one`,
      team.memberCookie,
    );
    expect(notNumber.status).toBe(422);
  });

  test("references the validation as it is now, the self-analyses for Owners and Members only", async () => {
    const team = await teamWithPlan();
    const { validationId } = team;
    await db.insert(competitors).values([
      { validationId, name: "Bongbong's", sortOrder: 1, typicalPrice: 380 },
      { validationId, name: "Merci", sortOrder: 0, strength: "Brand" },
    ]);
    await db.insert(researchLogEntries).values([
      {
        validationId,
        topic: "City hall visit",
        observedOn: "2026-09-02",
        supportsChecks: ["permits"],
        createdById: team.owner.id,
      },
      {
        validationId,
        topic: "Price check",
        supportsChecks: ["local_price"],
        createdById: team.owner.id,
      },
    ]);
    await db
      .update(costItems)
      .set({ amount: 8500 })
      .where(
        and(
          eq(costItems.validationId, validationId),
          eq(costItems.templateKey, "initial.permits"),
        ),
      );
    const analysis = await fixtures.createSelfAnalysis(team.member.id, [
      team.workspace.id,
    ]);
    await db.insert(selfAnalysisAnswers).values({
      selfAnalysisId: analysis.id,
      questionKey: "SA.WHY.1",
      text: "To stay home",
    });

    const market = await item(team, 6);
    expect(market.references.map((reference) => reference.kind)).toEqual([
      "validation_answers",
      "competitors",
    ]);
    expect(refOf(market, "validation_answers")).toMatchObject({
      title: "Validation · 02 Market",
      link: { screen: 11, sectionKey: "02", ideaId: team.idea.id },
    });
    expect(refOf(market, "competitors")?.data).toMatchObject([
      { name: "Merci", strength: "Brand" },
      { name: "Bongbong's", typicalPrice: 380 },
    ]);

    const legal = await item(team, 14);
    expect(refOf(legal, "cost_rows")?.data).toMatchObject([
      {
        templateKey: "initial.permits",
        category: "initial",
        value: { value: 8500, bound: "exact", reason: null },
      },
    ]);
    // A row the validation deleted is "Not in validation", by the template's name.
    await db
      .update(costItems)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(costItems.validationId, validationId),
          eq(costItems.templateKey, "initial.lease_deposit"),
        ),
      );
    const location = await item(team, 15);
    expect(refOf(location, "cost_rows")?.data).toMatchObject([
      { templateKey: "monthly.rent", name: "Rent", inputMode: "amount" },
      {
        id: null,
        templateKey: "initial.lease_deposit",
        name: "Lease Deposit / Advance",
        category: "initial",
        inputMode: null,
        amount: null,
      },
    ]);
    // A number sub-item's cost row: named by the validation's row, Empty while it has no
    // value; once deleted, left out of the metrics and named by the template (6.0.7).
    await db
      .update(costItems)
      .set({ name: "Crew wages" })
      .where(
        and(
          eq(costItems.validationId, validationId),
          eq(costItems.templateKey, "monthly.salaries"),
        ),
      );
    const people = await item(team, 18);
    expect(people.metrics["cost_row:monthly.salaries"]).toMatchObject({
      value: null,
      reason: "empty",
    });
    expect(people.costRowNames).toEqual({ "monthly.salaries": "Crew wages" });
    await db
      .update(costItems)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(costItems.validationId, validationId),
          eq(costItems.templateKey, "monthly.salaries"),
        ),
      );
    const withoutRow = await item(team, 18);
    expect("cost_row:monthly.salaries" in withoutRow.metrics).toBe(false);
    expect(withoutRow.costRowNames).toEqual({ "monthly.salaries": "Salaries" });
    expect(refOf(legal, "research_log")).toMatchObject({
      title: "Research Log · Permits",
      data: [{ topic: "City hall visit", observedOn: "2026-09-02" }],
      link: { screen: 14 },
    });

    const vision = await item(team, 2);
    const shared = refOf(vision, "self_analysis");
    expect(shared).toMatchObject({ title: "Shared self-analyses", link: null });
    expect(shared?.data).toMatchObject([
      {
        selfAnalysisId: analysis.id,
        user: { id: team.member.id },
        sections: [
          {
            key: "WHY",
            answers: [
              { questionKey: "SA.WHY.1", text: "To stay home" },
              { questionKey: "SA.WHY.2", text: null },
            ],
          },
        ],
      },
    ]);
    expect((await item(team, 2, team.ownerCookie)).references).toHaveLength(1);
    expect((await item(team, 2, team.viewerCookie)).references).toEqual([]);

    const decisions = await item(team, 12);
    expect(refOf(decisions, "decision_log")?.data).toMatchObject([
      { kind: "validation_decision", value: "proceed" },
    ]);
    expect(refOf(await item(team, 24), "go_no_go_history")?.data).toEqual([]);
    expect(refOf(await item(team, 21), "assumptions")?.link).toMatchObject({
      screen: 16,
      tab: "assumptions",
    });
  });

  test("a shared self-analysis leaves out the questions its display conditions hide, as 12 does", async () => {
    const team = await teamWithPlan();
    const analysis = await fixtures.createSelfAnalysis(team.member.id, [
      team.workspace.id,
    ]);
    await db.insert(selfAnalysisAnswers).values([
      {
        selfAnalysisId: analysis.id,
        questionKey: "SA.WHY.1",
        text: "To stay home",
      },
      { selfAnalysisId: analysis.id, questionKey: "SA.WHY.2", text: "Family" },
    ]);
    const conditionOn = (displayCondition: Record<string, string[]> | null) =>
      db
        .update(templateQuestions)
        .set({ displayCondition })
        .where(
          and(
            eq(templateQuestions.templateVersionId, analysis.templateVersionId),
            eq(templateQuestions.questionKey, "SA.WHY.2"),
          ),
        );
    const keysShown = async () => {
      const shared = refOf(await item(team, 2), "self_analysis")?.data as
        | { sections: { answers: { questionKey: string }[] }[] }[]
        | undefined;
      return shared?.[0]?.sections[0]?.answers.map(
        ({ questionKey }) => questionKey,
      );
    };
    try {
      await conditionOn({ "SA.WHY.1": ["Something else"] });
      expect(await keysShown()).toEqual(["SA.WHY.1"]);
      await conditionOn({ "SA.WHY.1": ["To stay home"] });
      expect(await keysShown()).toEqual(["SA.WHY.1", "SA.WHY.2"]);
    } finally {
      await conditionOn(null);
    }
  });

  test("shows a saved version's answers, numbers and items, read only", async () => {
    const team = await teamWithPlan();
    await save(team, "P.01.5", { text: "Monthly invoices", lockVersion: 0 });
    const version = planVersionSummarySchema.parse(
      await (
        await call(
          "POST",
          `/api/v1/plans/${team.planId}/versions`,
          team.memberCookie,
          { name: "v1" },
        )
      ).json(),
    );
    await save(team, "P.01.5", { text: "Weekly invoices", lockVersion: 1 });
    await save(team, "P.13.1", {
      rows: [{ name: "Ana", initial_ownership: 0.6, initial_capital: 120000 }],
      lockVersion: 0,
    });
    const now = await item(team, 1);
    expect(now.answers[4]?.text).toBe("Weekly invoices");
    const then = await item(
      team,
      1,
      team.memberCookie,
      `?versionId=${version.id}`,
    );
    expect(then.readOnly).toBe(true);
    expect(then.answers[4]).toMatchObject({
      text: "Monthly invoices",
      lockVersion: 0,
      updatedBy: null,
    });
    const milestones = await item(
      team,
      23,
      team.memberCookie,
      `?versionId=${version.id}`,
    );
    expect(milestones.execution).toHaveLength(6);

    const owners = await item(team, 13);
    expect(refOf(owners, "totals")?.data).toEqual({
      ownership: 0.6,
      capital: 120000,
    });
    const before = await item(
      team,
      13,
      team.memberCookie,
      `?versionId=${version.id}`,
    );
    expect(refOf(before, "totals")?.data).toEqual({ ownership: 0, capital: 0 });
  });

  test("reads the answers in other items its display conditions name, now and of a version, as 20 counts them", async () => {
    const team = await teamWithPlan();
    const file: TemplateFile = await Bun.file(
      new URL("../../../data/templates/bcdx/plan.json", import.meta.url),
    ).json();
    // §2's first sub-item shows once §1's fifth is "Yes".
    const imported = await importTemplateFile(db, "business_plan", {
      ...file,
      sections: file.sections.map((section) => ({
        ...section,
        questions: section.questions.map((question) =>
          question.key === "P.02.1"
            ? { ...question, displayCondition: { "P.01.5": ["Yes"] } }
            : question,
        ),
      })),
    });
    const [pinned] = await db
      .select({ templateVersionId: businessPlans.templateVersionId })
      .from(businessPlans)
      .where(eq(businessPlans.id, team.planId));
    if (pinned === undefined) throw new Error("No plan");
    await db
      .update(businessPlans)
      .set({ templateVersionId: imported.versionId })
      .where(eq(businessPlans.id, team.planId));
    const hubOf = async (query = "") => {
      const response = await call(
        "GET",
        `/api/v1/plans/${team.planId}${query}`,
        team.memberCookie,
      );
      expect(response.status).toBe(200);
      return planHomeSchema
        .parse(await response.json())
        .parts.flatMap((part) => part.items)
        .find((entry) => entry.itemNo === 2);
    };
    try {
      expect((await item(team, 2)).conditionAnswers).toEqual([
        { questionKey: "P.01.5", text: null },
      ]);
      expect(await hubOf()).toMatchObject({ filled: 0, total: 3 });
      expect((await item(team, 1)).conditionAnswers).toEqual([]);

      await save(team, "P.01.5", { text: "Yes", lockVersion: 0 });
      const version = planVersionSummarySchema.parse(
        await (
          await call(
            "POST",
            `/api/v1/plans/${team.planId}/versions`,
            team.memberCookie,
            { name: "v1" },
          )
        ).json(),
      );
      await save(team, "P.01.5", { text: "No", lockVersion: 1 });

      expect((await item(team, 2)).conditionAnswers).toEqual([
        { questionKey: "P.01.5", text: "No" },
      ]);
      expect(await hubOf()).toMatchObject({ total: 3 });
      const then = await item(
        team,
        2,
        team.memberCookie,
        `?versionId=${version.id}`,
      );
      expect(then.conditionAnswers).toEqual([
        { questionKey: "P.01.5", text: "Yes" },
      ]);
      expect(await hubOf(`?versionId=${version.id}`)).toMatchObject({
        total: 4,
      });
    } finally {
      await db
        .update(businessPlans)
        .set({ templateVersionId: pinned.templateVersionId })
        .where(eq(businessPlans.id, team.planId));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, imported.versionId));
    }
  });
});

describe("P5 PUT /api/v1/plans/{planId}/answers/{questionKey}", () => {
  test("saves a text under the lock with its history", async () => {
    const team = await teamWithPlan();
    clock += 60_000;
    const created = await save(team, "P.01.5", {
      text: "Boxes invoiced monthly",
      lockVersion: 0,
    });
    expect(created.status).toBe(200);
    expect(planAnswerSchema.parse(await created.json())).toMatchObject({
      questionKey: "P.01.5",
      text: "Boxes invoiced monthly",
      lockVersion: 1,
      updatedAt: new Date(clock).toISOString(),
      copiedFrom: null,
    });
    const copied = await save(team, "P.01.1", {
      text: "Gift boxes for Bacolod offices",
      lockVersion: 1,
    });
    expect(planAnswerSchema.parse(await copied.json())).toMatchObject({
      lockVersion: 2,
      copiedFrom: { source: "IDEA.ONE_LINE_CONCEPT" },
    });
    const same = await save(team, "P.01.5", {
      text: "Boxes invoiced monthly",
      lockVersion: 0,
    });
    expect(planAnswerSchema.parse(await same.json()).lockVersion).toBe(1);
    const stale = await save(team, "P.01.5", { text: "Other", lockVersion: 0 });
    expect(stale.status).toBe(409);
    expect(await errorOf(stale)).toMatchObject({
      code: "CONFLICT",
      current: { value: { text: "Boxes invoiced monthly", rows: null } },
    });
    // A version-0 save meets the row another made first: 409 even with force.
    const lost = await save(team, "P.01.5", {
      text: "Other",
      lockVersion: 0,
      force: true,
    });
    expect(lost.status).toBe(409);
    // Rows of one moment have no order between them: the saves below are a second apart.
    clock += 1000;
    const forced = await save(team, "P.01.5", {
      text: "Mine",
      lockVersion: 7,
      force: true,
    });
    expect(planAnswerSchema.parse(await forced.json())).toMatchObject({
      text: "Mine",
      lockVersion: 2,
    });
    clock += 1000;
    const cleared = await save(team, "P.01.5", { text: "  ", lockVersion: 2 });
    expect(planAnswerSchema.parse(await cleared.json()).text).toBeNull();

    const history = await db
      .select()
      .from(changeHistory)
      .where(
        and(
          eq(changeHistory.targetId, team.planId),
          eq(changeHistory.targetKey, "P.01.5"),
        ),
      );
    // Overwriting, then clearing it a moment later: one row from before the overwrite
    // to the cleared text (ADR-020).
    expect(
      history.map((row) => [row.action, row.sectionKey, row.before, row.after]),
    ).toEqual([
      ["create", "01", null, { text: "Boxes invoiced monthly", rows: null }],
      [
        "update",
        "01",
        { text: "Boxes invoiced monthly", rows: null },
        { text: null, rows: null },
      ],
    ]);
  });

  test("refuses what a sub-item does not take, and a Viewer or an archived plan", async () => {
    const team = await teamWithPlan();
    for (const [key, body, code] of [
      ["P.01.7", { text: "1", lockVersion: 0 }, "NOT_EDITABLE"],
      ["P.23.1", { text: "1", lockVersion: 0 }, "NOT_EDITABLE"],
      ["P.31.1", { text: "1", lockVersion: 0 }, "QUESTION_NOT_FOUND"],
      ["P.11.1", { text: "1", lockVersion: 0 }, "VALIDATION_FAILED"],
      ["P.01.5", { rows: [], lockVersion: 0 }, "VALIDATION_FAILED"],
      [
        "P.01.5",
        { text: "x".repeat(20_001), lockVersion: 0 },
        "VALIDATION_FAILED",
      ],
    ] as const) {
      const response = await save(team, key, body);
      expect({
        key,
        status: response.status,
        code: (await errorOf(response)).code,
      }).toEqual({
        key,
        status: 422,
        code,
      });
    }
    const viewer = await save(
      team,
      "P.01.5",
      { text: "x", lockVersion: 0 },
      team.viewerCookie,
    );
    expect(viewer.status).toBe(403);
    await db
      .update(businessPlans)
      .set({ archivedAt: new Date(clock) })
      .where(eq(businessPlans.id, team.planId));
    const archived = await save(team, "P.01.5", { text: "x", lockVersion: 0 });
    expect(archived.status).toBe(409);
    expect((await errorOf(archived)).code).toBe("ARCHIVED");
    await db
      .update(businessPlans)
      .set({ archivedAt: null })
      .where(eq(businessPlans.id, team.planId));
    await db
      .update(ideas)
      .set({ archivedAt: new Date(clock) })
      .where(eq(ideas.id, team.idea.id));
    const ideaArchived = await save(team, "P.01.5", {
      text: "x",
      lockVersion: 0,
    });
    expect((await errorOf(ideaArchived)).code).toBe("ARCHIVED");
  });

  test("takes a choice sub-item's value only among its choices", async () => {
    const team = await teamWithPlan();
    const file: TemplateFile = await Bun.file(
      new URL("../../../data/templates/bcdx/plan.json", import.meta.url),
    ).json();
    const imported = await importTemplateFile(db, "business_plan", {
      ...file,
      sections: file.sections.map((section) => ({
        ...section,
        questions: section.questions.map((question) =>
          question.key === "P.01.5"
            ? {
                ...question,
                answerType: "choice",
                options: { kind: "choice", choices: ["Yes", "No"] },
              }
            : question,
        ),
      })),
    });
    const [pinned] = await db
      .select({ templateVersionId: businessPlans.templateVersionId })
      .from(businessPlans)
      .where(eq(businessPlans.id, team.planId));
    if (pinned === undefined) throw new Error("No plan");
    await db
      .update(businessPlans)
      .set({ templateVersionId: imported.versionId })
      .where(eq(businessPlans.id, team.planId));
    const stored = async () =>
      (
        await db
          .select()
          .from(planAnswers)
          .where(
            and(
              eq(planAnswers.businessPlanId, team.planId),
              eq(planAnswers.questionKey, "P.01.5"),
            ),
          )
      )[0];
    const historyRows = () =>
      db
        .select()
        .from(changeHistory)
        .where(
          and(
            eq(changeHistory.targetId, team.planId),
            eq(changeHistory.targetKey, "P.01.5"),
          ),
        );
    try {
      const unknown = await save(team, "P.01.5", {
        text: "Maybe",
        lockVersion: 0,
      });
      expect(unknown.status).toBe(422);
      expect((await errorOf(unknown)).code).toBe("INVALID_CHOICE");
      expect(await stored()).toBeUndefined();
      expect(await historyRows()).toEqual([]);

      const chosen = await save(team, "P.01.5", {
        text: "Yes",
        lockVersion: 0,
      });
      expect(chosen.status).toBe(200);
      expect(planAnswerSchema.parse(await chosen.json())).toMatchObject({
        text: "Yes",
        lockVersion: 1,
      });
      const other = await save(team, "P.01.5", {
        text: "Maybe",
        lockVersion: 1,
      });
      expect(other.status).toBe(422);
      expect((await errorOf(other)).code).toBe("INVALID_CHOICE");
      expect(await stored()).toMatchObject({ text: "Yes", lockVersion: 1 });
      expect(await historyRows()).toHaveLength(1);
    } finally {
      await db
        .update(businessPlans)
        .set({ templateVersionId: pinned.templateVersionId })
        .where(eq(businessPlans.id, team.planId));
      await db
        .delete(templateVersions)
        .where(eq(templateVersions.id, imported.versionId));
    }
  });

  test("saves table rows in the template's columns and checks each cell", async () => {
    const team = await teamWithPlan();
    const saved = await save(team, "P.13.1", {
      rows: [
        { name: "Ana", initial_ownership: 0.6, initial_capital: 120000 },
        { initial_ownership: 0.4, name: "  " },
      ],
      lockVersion: 0,
    });
    expect(saved.status).toBe(200);
    expect(planAnswerSchema.parse(await saved.json()).rows).toEqual([
      { name: "Ana", initial_ownership: 0.6, initial_capital: 120000 },
      { name: null, initial_ownership: 0.4, initial_capital: null },
    ]);
    for (const [row, path] of [
      [{ nickname: "A" }, "rows.0.nickname"],
      [{ name: 5 }, "rows.0.name"],
      [{ initial_ownership: "60%" }, "rows.0.initial_ownership"],
      [{ initial_ownership: 1.5 }, "rows.0.initial_ownership"],
      [{ initial_capital: 1.005 }, "rows.0.initial_capital"],
      [{ name: "x".repeat(2001) }, "rows.0.name"],
    ] as const) {
      const response = await save(team, "P.13.1", {
        rows: [row],
        lockVersion: 1,
      });
      const error = await errorOf(response);
      expect({
        status: response.status,
        code: error.code,
        path: error.details?.[0]?.path,
      }).toEqual({
        status: 422,
        code: "VALIDATION_FAILED",
        path,
      });
    }
    const emptied = await save(team, "P.13.1", { rows: [], lockVersion: 1 });
    expect(planAnswerSchema.parse(await emptied.json())).toMatchObject({
      rows: null,
      lockVersion: 2,
    });
  });

  test("keeps a copied cell or text over its limit only until it is changed", async () => {
    const team = await teamWithPlan();
    const long = "x".repeat(2001);
    const longText = "y".repeat(20_001);
    await db.insert(planAnswers).values([
      {
        businessPlanId: team.planId,
        questionKey: "P.21.1",
        rows: [
          {
            assumption: long,
            why_we_believe_it: null,
            evidence: null,
            what_would_disprove_it: null,
            legacy: "kept",
          },
        ],
        lockVersion: 1,
      },
      {
        businessPlanId: team.planId,
        questionKey: "P.03.1",
        text: longText,
        lockVersion: 1,
      },
    ]);
    const kept = await save(team, "P.21.1", {
      rows: [
        { why_we_believe_it: "New" },
        { assumption: long, legacy: "kept" },
      ],
      lockVersion: 1,
    });
    expect(kept.status).toBe(200);
    expect(planAnswerSchema.parse(await kept.json()).rows).toEqual([
      {
        assumption: null,
        why_we_believe_it: "New",
        evidence: null,
        what_would_disprove_it: null,
      },
      {
        assumption: long,
        why_we_believe_it: null,
        evidence: null,
        what_would_disprove_it: null,
        legacy: "kept",
      },
    ]);
    // Changed, or copied into a second row: kept cells can stay, not multiply.
    for (const rows of [
      [{ assumption: `${long}z` }],
      [{ assumption: "A", legacy: "changed" }],
      [{ assumption: long }, { assumption: long }],
      [{ legacy: "kept" }, { legacy: "kept" }],
    ]) {
      const refused = await save(team, "P.21.1", { rows, lockVersion: 2 });
      expect(refused.status).toBe(422);
    }
    const cleared = await save(team, "P.21.1", {
      rows: [{ assumption: "A", legacy: null }],
      lockVersion: 2,
    });
    expect(cleared.status).toBe(200);
    // The stale save meets 409 before the check against the stored rows.
    const stale = await save(team, "P.21.1", {
      rows: [{ assumption: "B", legacy: "kept" }],
      lockVersion: 2,
    });
    expect(stale.status).toBe(409);

    const tooLong = await save(team, "P.03.1", {
      text: longText,
      lockVersion: 1,
    });
    expect(tooLong.status).toBe(422);
    const shortened = await save(team, "P.03.1", {
      text: "Short",
      lockVersion: 1,
    });
    expect(shortened.status).toBe(200);
  });
});
