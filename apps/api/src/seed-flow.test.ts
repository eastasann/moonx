import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { connectDatabase, notifications } from "@moonx/db";
import {
  BCDX_WORKSPACE_ID,
  SEED_PASSWORD,
  seedDatabase,
  seedId,
  userId,
} from "@moonx/db/seed";
import { prepareTestDatabase, testDatabaseName } from "@moonx/db/test-database";
import {
  assumptionListSchema,
  competitorListSchema,
  costsSchema,
  decisionContextSchema,
  decisionResultSchema,
  economicsSchema,
  errorBodySchema,
  memberSelfAnalysesSchema,
  researchLogPageSchema,
  riskListSchema,
  selfAnalysisHomeSchema,
  selfAnalysisSectionSchema,
  sharedSelfAnalysisSchema,
  validationHomeSchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { buildTestApp, uniqueIp } from "./test-app";
import { apiRequest, cookiesOf } from "./test-fixtures";

// The steps' goals on the demo data of design-spec 8: V1 of Piaya Gift Box Delivery
// shows what 6.1 and the worked numbers of 8.3 say, its worksheets (V6–V15) list the
// rows of 8.4 and calculate 8.3, V19 records a decision there, and the self-analyses
// (S1, S6, S7) are as 8.1 has them. A database of its own, since the seed empties every
// table.

const base = process.env.DATABASE_URL_TEST;
if (base === undefined || base === "") {
  throw new Error("DATABASE_URL_TEST is required for make test-api");
}
const scratch = new URL(base);
scratch.pathname = `/${testDatabaseName(base)}_seed_api_test`;
const url = scratch.toString();
const database = connectDatabase(url);
const { app } = buildTestApp(database);

beforeAll(async () => {
  await prepareTestDatabase(url);
  await seedDatabase(database.db);
}, 60_000);
afterAll(() => database.close());

const PIAYA = seedId("idea", "piaya");

async function cookieOf(email: string) {
  const response = await app.handle(
    new Request("http://localhost/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": uniqueIp(),
      },
      body: JSON.stringify({ email, password: SEED_PASSWORD }),
    }),
  );
  expect(response.status).toBe(200);
  return cookiesOf(response);
}

describe("the demo data", () => {
  test("V1 of Piaya Gift Box Delivery: the numbers of 8.3, all six checks done, its decisions and plans", async () => {
    const response = await app.handle(
      apiRequest("GET", `/api/v1/ideas/${PIAYA}/validation`, {
        cookie: await cookieOf("grace@advisor.example"),
      }),
    );
    expect(response.status).toBe(200);
    const view = validationHomeSchema.parse(await response.json());
    expect(view.idea).toMatchObject({
      name: "Piaya Gift Box Delivery",
      stage: "planning",
      latestDecision: "proceed",
      proposer: { displayName: "Ana Villanueva" },
    });
    expect(view.keyMetrics.initial_cost_total).toEqual({
      value: 169_500,
      bound: "exact",
      reason: null,
    });
    expect(view.keyMetrics.break_even_units_day.value).toBeCloseTo(6.93, 2);
    expect(view.keyMetrics.expected_operating_profit.value).toBe(18_490);
    expect(view.keyMetrics.payback_months.value).toBeCloseTo(9.17, 2);
    expect(view.checks.map((check) => [check.key, check.state])).toEqual([
      ["competitors", "done"],
      ["local_price", "done"],
      ["costs", "done"],
      ["break_even", "done"],
      ["permits", "done"],
      ["demand_signal", "done"],
    ]);
    expect(view.checks[0]?.count).toBe(4);
    // A Viewer cannot open a new research log entry: the link is text.
    expect(
      view.checks.find((check) => check.key === "demand_signal")?.link,
    ).toBeNull();
    expect(view.summary.marketType).toBe("Mixed");
    expect(view.sections.find((s) => s.key === "03")).toMatchObject({
      title: "03 Research Log",
      count: 7,
    });
    expect(view.decisions.map((d) => d.value)).toEqual(["proceed"]);
    expect(view.plans).toMatchObject([
      {
        name: "Plan A",
        latestVersion: { name: "v1 For advisors" },
        hasChangesSinceVersion: true,
        latestGoNoGo: { value: "delay" },
      },
      { name: "Plan B", latestVersion: null, latestGoNoGo: null },
    ]);
    expect(view.template.newerVersion?.versionNumber).toBe(2);
    expect(view.canAddPlan).toBe(true);
  });

  test("the worksheets: Piaya's rows of 8.4 and numbers of 8.3, Health Bowl's deleted log left out", async () => {
    const cookie = await cookieOf("grace@advisor.example");
    const validationId = seedId("validation", "piaya");
    const get = async (path: string) => {
      const response = await app.handle(
        apiRequest("GET", `/api/v1/validations/${validationId}/${path}`, {
          cookie,
        }),
      );
      expect(response.status).toBe(200);
      return response.json();
    };
    const logs = researchLogPageSchema.parse(await get("research-log"));
    expect(logs.items).toHaveLength(7);
    const tags = new Set(logs.items.flatMap((log) => log.supportsChecks));
    expect([...tags].sort()).toEqual([
      "demand_signal",
      "local_price",
      "permits",
    ]);
    const competitors = competitorListSchema.parse(await get("competitors"));
    expect(competitors.items).toHaveLength(4);
    expect(
      competitors.items.filter((item) => item.typicalPrice !== null),
    ).toHaveLength(3);
    expect(competitors.guidance).toEqual({ min: 3, max: 5 });
    expect(
      assumptionListSchema.parse(await get("assumptions")).items,
    ).toHaveLength(3);
    // 16's automatic order: Impact, then Probability, highest first.
    expect(
      riskListSchema
        .parse(await get("risks"))
        .items.map((risk) => [risk.impact, risk.probability, risk.sortOrder]),
    ).toEqual([
      ["high", "medium", null],
      ["medium", "high", null],
      ["medium", "medium", null],
      ["medium", "low", null],
    ]);
    const costs = costsSchema.parse(await get("costs"));
    expect(costs.items).toHaveLength(24);
    const economics = economicsSchema.parse(await get("economics"));
    const { result } = economics;
    expect(result.variableCostPerUnit.value).toBeCloseTo(218.5, 6);
    expect(result.contributionMarginRate.value).toBeCloseTo(0.5144, 4);
    expect(result.totals.monthlyFixed.amount).toBe(41_700);
    expect(result.breakEvenUnitsMonth.value).toBeCloseTo(180.13, 2);
    expect(Math.round(result.breakEvenRevenue.value ?? 0)).toBe(81_058);
    expect(result.targetMarginUnitsDay.value).toBeCloseTo(9.8, 1);
    expect(
      result.scenarios.find((column) => column.key === "expected"),
    ).toMatchObject({
      unitsPerMonth: { value: 260 },
      revenue: { value: 117_000 },
      variableCostTotal: { value: 56_810 },
      operatingProfit: { value: 18_490 },
    });
    expect(
      result.scenarios.find((column) => column.key === "conservative")
        ?.operatingProfit.value,
    ).toBe(-5_586);
    expect(result.totals.initial.amount).toBe(169_500);
    expect(result.paybackMonths.value).toBeCloseTo(9.17, 2);
    expect(result.simpleRoi.value).toBeCloseTo(1.309, 3);
    expect(result.defaultsUsed).toEqual({
      operatingDays: false,
      targetMargin: true,
    });
    expect(economics.costItems).toEqual(costs.items);
    expect(costs.result).toEqual(result);
    // Health Bowl lists 5 entries: its deleted one is left out (8.4).
    const bowl = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/validations/${seedId("validation", "health-bowl")}/research-log`,
        { cookie },
      ),
    );
    expect(researchLogPageSchema.parse(await bowl.json()).items).toHaveLength(
      5,
    );
  });

  test("V19 by Kenji records the decision and notifies Ana, Paolo and Grace", async () => {
    const cookie = await cookieOf("kenji@bcdx.example");
    const context = decisionContextSchema.parse(
      await (
        await app.handle(
          apiRequest("GET", `/api/v1/ideas/${PIAYA}/decision-context`, {
            cookie,
          }),
        )
      ).json(),
    );
    expect(context.missingChecks).toEqual([]);
    const response = await app.handle(
      apiRequest("POST", `/api/v1/ideas/${PIAYA}/decisions`, {
        cookie,
        body: {
          value: "hold",
          reason: "The supplier raised the box price",
          basedOnDecisionId: context.lastDecision?.id ?? null,
        },
      }),
    );
    expect(response.status).toBe(201);
    const { entry } = decisionResultSchema.parse(await response.json());
    expect(entry).toMatchObject({
      value: "hold",
      recordedBy: { displayName: "Kenji Mori" },
      snapshot: { missingChecks: [] },
    });
    const sent = await database.db
      .select()
      .from(notifications)
      .where(eq(notifications.decisionLogEntryId, entry.id));
    expect(sent.map((row) => row.userId).sort()).toEqual(
      [userId("ana"), userId("paolo"), userId("grace")].sort(),
    );
    expect(sent[0]?.link).toEqual({
      screen: 13,
      workspaceId: BCDX_WORKSPACE_ID,
      ideaId: PIAYA,
    });
  });
  test("the self-analyses of 8.1, and Kenji's unshared one out of Ana's reach", async () => {
    const home = async (email: string) => {
      const response = await app.handle(
        apiRequest("GET", "/api/v1/me/self-analysis", {
          cookie: await cookieOf(email),
        }),
      );
      expect(response.status).toBe(200);
      return selfAnalysisHomeSchema.parse(await response.json());
    };
    const bcdx = { id: BCDX_WORKSPACE_ID, name: "BCDX" };
    const ana = await home("ana@bcdx.example");
    expect(ana).toMatchObject({
      id: seedId("self_analysis", "ana"),
      status: "done",
      answered: 36,
      total: 36,
      firstUnanswered: null,
      shares: [{ workspace: bcdx }],
      shareableWorkspaces: [bcdx],
    });
    expect(ana.sections.map((section) => section.title)).toEqual([
      "WHY",
      "BE",
      "DO",
      "GIVE",
      "HAVE",
      "PERSONAL INCOME",
      "ENOUGH",
      "NOT",
      "NOW",
      "FINAL REFLECTION",
      "ONE-SENTENCE SUMMARY",
    ]);
    expect(await home("kenji@bcdx.example")).toMatchObject({
      status: "in_progress",
      answered: 21,
      total: 36,
      shares: [],
    });
    expect(await home("grace@advisor.example")).toMatchObject({
      status: "not_started",
      answered: 0,
      total: 36,
      shareableWorkspaces: [],
    });
    expect(await home("admin@moonx.example")).toMatchObject({
      status: "not_started",
      answered: 0,
      total: 36,
    });

    const anaCookie = await cookieOf("ana@bcdx.example");
    const team = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${BCDX_WORKSPACE_ID}/self-analyses`,
        {
          cookie: anaCookie,
        },
      ),
    );
    expect(
      memberSelfAnalysesSchema
        .parse(await team.json())
        .items.map(({ user, shared, status }) => [
          user.displayName,
          shared,
          status,
        ]),
    ).toEqual([
      ["Ana Villanueva", true, "done"],
      ["Kenji Mori", false, null],
      ["Paolo Gonzaga", true, "done"],
    ]);

    const read = (who: "kenji" | "paolo") =>
      app.handle(
        apiRequest(
          "GET",
          `/api/v1/workspaces/${BCDX_WORKSPACE_ID}/self-analyses/${userId(who)}`,
          { cookie: anaCookie },
        ),
      );
    // Paolo's comment on Ana's first answer (8.2), as Ana and the team read it.
    const anaWhy = await app.handle(
      apiRequest("GET", "/api/v1/me/self-analysis/sections/WHY", {
        cookie: anaCookie,
      }),
    );
    expect(
      selfAnalysisSectionSchema
        .parse(await anaWhy.json())
        .answers.map((answer) => [answer.questionKey, answer.commentCounts]),
    ).toEqual([
      [
        "SA.WHY.1",
        [{ workspaceId: BCDX_WORKSPACE_ID, workspaceName: "BCDX", count: 1 }],
      ],
      [
        "SA.WHY.2",
        [{ workspaceId: BCDX_WORKSPACE_ID, workspaceName: "BCDX", count: 0 }],
      ],
    ]);
    const anaShared = await app.handle(
      apiRequest(
        "GET",
        `/api/v1/workspaces/${BCDX_WORKSPACE_ID}/self-analyses/${userId("ana")}`,
        { cookie: await cookieOf("paolo@bcdx.example") },
      ),
    );
    expect(anaShared.status).toBe(200);
    const why = sharedSelfAnalysisSchema
      .parse(await anaShared.json())
      .sections.find((section) => section.key === "WHY");
    expect(why?.answers[0]).toMatchObject({
      questionKey: "SA.WHY.1",
      commentCount: 1,
    });

    const kenji = await read("kenji");
    expect(kenji.status).toBe(403);
    expect(errorBodySchema.parse(await kenji.json()).error.code).toBe(
      "NOT_SHARED",
    );
    const paolo = await read("paolo");
    expect(paolo.status).toBe(200);
    const view = sharedSelfAnalysisSchema.parse(await paolo.json());
    expect(view).toMatchObject({
      user: { displayName: "Paolo Gonzaga" },
      status: "done",
      currency: "PHP",
    });
    expect(view.sections.flatMap((section) => section.answers)).toHaveLength(
      36,
    );
  });
});
