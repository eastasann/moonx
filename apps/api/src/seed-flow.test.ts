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
  decisionContextSchema,
  decisionResultSchema,
  validationHomeSchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { buildTestApp, uniqueIp } from "./test-app";
import { apiRequest, cookiesOf } from "./test-fixtures";

// The step's goal on the demo data of design-spec 8: V1 of Piaya Gift Box Delivery
// shows what 6.1 and the worked numbers of 8.3 say, and V19 records a decision there.
// A database of its own, since the seed empties every table.

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
});
