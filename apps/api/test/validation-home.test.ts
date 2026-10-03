import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { schema } from "@moonx/db";
import { BCDX, type IdeaKey, ideaId, planId } from "@moonx/db/seed";
import { eq } from "drizzle-orm";
import {
  computeValidationState,
  LIST_METRIC_KEYS,
  loadValidationData,
  pickMetrics,
} from "../src/lib/validation-data";
import { call, login, startTestApp, type TestApp } from "./helpers";

let t: TestApp;
let ana: Record<string, string>;
let grace: Record<string, string>;
let admin: Record<string, string>;

beforeAll(async () => {
  t = await startTestApp();
  ana = await login(t.app, "ana");
  grace = await login(t.app, "grace");
  admin = await login(t.app, "admin");
});
afterAll(async () => {
  await t.close();
});

const path = (key: IdeaKey) => `/api/v1/ideas/${ideaId(key)}/validation`;
const IDEAS: IdeaKey[] = [
  "piaya",
  "piaya-corp",
  "health-bowl",
  "study-cafe",
  "laundry",
  "bike-repair",
];

async function computed(key: IdeaKey) {
  const [validation] = await t.db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId(key)));
  const id = (validation as { id: string }).id;
  const data = (await loadValidationData(t.db, [id])).get(id) as NonNullable<
    Awaited<ReturnType<typeof loadValidationData>> extends Map<string, infer V> ? V : never
  >;
  return { id, state: computeValidationState(data, { workspaceId: BCDX, ideaId: ideaId(key) }) };
}

describe("V1 validation home", () => {
  test("every demo idea: the calculated blocks equal computeValidationState", async () => {
    for (const key of IDEAS) {
      const res = await call(t.app, "GET", path(key), { as: ana });
      expect(res.status).toBe(200);
      const { id, state } = await computed(key);
      expect(res.body.validationId).toBe(id);
      expect(res.body.idea.id).toBe(ideaId(key));
      expect(res.body.idea.validationId).toBe(id);
      expect(res.body.checks).toHaveLength(6);
      expect(res.body.checks).toEqual(JSON.parse(JSON.stringify(state.checks)));
      expect(res.body.fau).toEqual(state.fau);
      expect(res.body.nextSteps).toEqual(JSON.parse(JSON.stringify(state.nextSteps)));
      expect(res.body.nextSteps.length).toBeLessThanOrEqual(3);
      expect(res.body.economicsWarnings).toEqual(state.economics.warnings);
      expect(res.body.keyMetrics).toEqual(
        JSON.parse(JSON.stringify(pickMetrics(state.keyMetrics, LIST_METRIC_KEYS))),
      );
      expect(Object.keys(res.body.keyMetrics).sort()).toEqual([...LIST_METRIC_KEYS].sort());
      expect(res.body.sections.map((s: { key: string }) => s.key)).toEqual([
        "01",
        "02",
        "03",
        "04",
        "05",
        "06-08",
        "09",
        "10",
      ]);
      for (const section of res.body.sections) {
        const expected = state.sections.find((s) => s.key === section.key);
        expect(section).toEqual({ ...JSON.parse(JSON.stringify(expected)), title: section.title });
      }
    }
  });

  test("Piaya shows the verified numbers of design-spec 8.3", async () => {
    const res = await call(t.app, "GET", path("piaya"), { as: ana });
    const m = res.body.keyMetrics;
    expect(m.initial_cost_total.value).toBe(169500);
    expect(m.break_even_units_day.value).toBeCloseTo(6.93, 2);
    expect(m.expected_operating_profit.value).toBe(18490);
    expect(m.payback_months.value).toBeCloseTo(9.17, 2);
    expect(res.body.checks.map((c: { state: string }) => c.state)).toEqual(Array(6).fill("done"));
    expect(res.body.economicsWarnings).toEqual([]);
  });

  test("section titles are the fixed labels of the catalog, number included", async () => {
    const res = await call(t.app, "GET", path("piaya"), { as: ana });
    const titles = Object.fromEntries(
      res.body.sections.map((s: { key: string; title: string }) => [s.key, s.title]),
    );
    expect(titles).toEqual({
      "01": "01 Customer & Problem",
      "02": "02 Market",
      "03": "03 Research Log",
      "04": "04 Competitors",
      "05": "05 Costs",
      "06-08": "06–08 Unit Economics & Scenarios",
      "09": "09 Assumptions & Risks",
      "10": "10 Final Assessment",
    });
  });

  test("summary, template reference, decisions, plans and canAddPlan", async () => {
    const piaya = (await call(t.app, "GET", path("piaya"), { as: ana })).body;
    expect(piaya.summary.solution).toBe(piaya.idea.proposedSolution);
    expect(piaya.summary.customer).toBeString();
    expect(piaya.summary.problem).toBeString();
    expect(["Red", "Blue", "Mixed", null]).toContain(piaya.summary.marketType);
    expect(piaya.template.versionNumber).toBe(1);
    expect(piaya.template.newerVersion.versionNumber).toBe(2);
    expect(piaya.canAddPlan).toBe(true);
    expect(piaya.plans.map((p: { id: string }) => p.id).sort()).toEqual(
      [planId("piaya-a"), planId("piaya-b")].sort(),
    );
    expect(piaya.decisions.length).toBeGreaterThan(0);
    expect(piaya.decisions.length).toBeLessThanOrEqual(5);
    const times = piaya.decisions.map((d: { recordedAt: string }) => d.recordedAt);
    expect([...times].sort().reverse()).toEqual(times);
    for (const d of piaya.decisions) expect(d.idea.id).toBe(ideaId("piaya"));

    const bike = (await call(t.app, "GET", path("bike-repair"), { as: ana })).body;
    expect(bike.template.versionNumber).toBe(2);
    expect(bike.template.newerVersion).toBeNull();
    expect(bike.canAddPlan).toBe(false);
    expect(bike.plans).toEqual([]);
    expect(bike.decisions).toEqual([]);
    expect(bike.summary.marketType).toBeNull();
    expect(bike.checks.map((c: { state: string }) => c.state)).toEqual(
      Array(6).fill("not_started"),
    );
  });

  test("archived plans are left out and an archived idea stays readable", async () => {
    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: new Date() })
      .where(eq(schema.businessPlans.id, planId("piaya-b")));
    const res = await call(t.app, "GET", path("piaya"), { as: ana });
    expect(res.body.plans.map((p: { id: string }) => p.id)).toEqual([planId("piaya-a")]);
    await t.db
      .update(schema.businessPlans)
      .set({ archivedAt: null })
      .where(eq(schema.businessPlans.id, planId("piaya-b")));

    await t.db
      .update(schema.ideas)
      .set({ archivedAt: new Date() })
      .where(eq(schema.ideas.id, ideaId("laundry")));
    const archived = await call(t.app, "GET", path("laundry"), { as: ana });
    expect(archived.status).toBe(200);
    expect(archived.body.idea.archived).toBe(true);
    await t.db
      .update(schema.ideas)
      .set({ archivedAt: null })
      .where(eq(schema.ideas.id, ideaId("laundry")));
  });

  test("a Viewer can read; a person outside the workspace gets 403; unknown idea 404; no sign-in 401", async () => {
    expect((await call(t.app, "GET", path("piaya"), { as: grace })).status).toBe(200);
    const outsider = await call(t.app, "GET", path("piaya"), { as: admin });
    expect(outsider.status).toBe(403);
    expect(outsider.body.error.code).toBe("NO_ACCESS");
    const missing = await call(
      t.app,
      "GET",
      "/api/v1/ideas/6f1f3f3a-1111-4111-8111-111111111111/validation",
      { as: ana },
    );
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
    expect((await call(t.app, "GET", path("piaya"))).status).toBe(401);
    expect(
      (await call(t.app, "GET", "/api/v1/ideas/not-a-uuid/validation", { as: ana })).status,
    ).toBe(422);
  });
});

describe("06-08 progress counts Unknown of the defaulted inputs as unanswered", () => {
  test("operating days and target margin count only with a value; the others count with Unknown", async () => {
    const { id } = await computed("piaya");
    await t.db.delete(schema.economicsInputs).where(eq(schema.economicsInputs.validationId, id));
    const put = (field: string, body: Record<string, unknown>, lockVersion = 0) =>
      call(t.app, "PUT", `/api/v1/validations/${id}/economics/${field}`, {
        as: ana,
        body: { ...body, lockVersion },
      });
    const progress = async () => {
      const res = await call(t.app, "GET", path("piaya"), { as: ana });
      return res.body.sections.find((s: { key: string }) => s.key === "06-08");
    };
    expect(await progress()).toMatchObject({ answered: 0, total: 7 });

    for (const field of ["operating_days", "target_margin", "units_expected"]) {
      expect((await put(field, { value: null, classification: { fau: "unknown" } })).status).toBe(
        200,
      );
    }
    // Only units_expected counts; the other two stay on their defaults.
    const unknown = await progress();
    expect(unknown).toMatchObject({ answered: 1, total: 7 });
    expect(unknown.fau.unknown).toBe(3);

    const days = await put("operating_days", { value: 26 }, 1);
    expect(days.status).toBe(200);
    expect(await progress()).toMatchObject({ answered: 2, total: 7 });
    expect((await put("selling_price", { value: 100 })).status).toBe(200);
    expect(await progress()).toMatchObject({ answered: 3, total: 7 });
  });
});
