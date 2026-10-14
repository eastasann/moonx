import { describe, expect, test } from "bun:test";
import type {
  CheckResult,
  CostCategory,
  EconomicsField,
  SupportsCheck,
  TemplateQuestion,
  TemplateSection,
} from "@moonx/schemas";
import {
  checkResultSchema,
  economicsResultSchema,
  fauBreakdownSchema,
  keyMetricsSchema,
  nextStepSchema,
} from "@moonx/schemas";
import {
  buildDecisionSnapshot,
  type CostRowState,
  type EconomicsInputState,
  evaluateValidation,
  type ValidationAnswerInput,
  type ValidationState,
  type ViewContext,
} from "./validation";

const question = (
  key: string,
  displayCondition: TemplateQuestion["displayCondition"] = null,
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] as string,
  title: key,
  prompt: `${key}?`,
  example: null,
  hint: null,
  answerType: key === "V.02.OCEAN" ? "choice" : "long_text",
  options:
    key === "V.02.OCEAN"
      ? { kind: "choice", choices: ["Red", "Blue", "Mixed"] }
      : null,
  displayCondition,
  hasFau: true,
});

const section = (
  key: string,
  questions: TemplateQuestion[],
): TemplateSection => ({
  key,
  part: null,
  title: `${key} title`,
  subtitle: null,
  guidance: null,
  questions,
});

const keys = (sectionKey: string, names: string[]) =>
  names.map((name) => `V.${sectionKey}.${name}`);

const S01 = keys("01", [
  "WHO",
  "WHY_THEM",
  "BEHAVIOR",
  "PROBLEM",
  "FREQUENCY",
  "SEVERITY",
  "PAYMENT",
  "SWITCHING",
  "NON_CUSTOMER",
  "PROOF",
]);
const RED = keys("02", ["RED_1", "RED_2", "RED_3", "RED_4"]);
const BLUE = keys("02", ["BLUE_1", "BLUE_2", "BLUE_3"]);
const S10 = keys("10", [
  "WHY_WORK",
  "WHY_FAIL",
  "MUST_BE_TRUE",
  "BIGGEST_UNKNOWN",
  "BIGGEST_RISK",
  "BIGGEST_OPPORTUNITY",
]);

/** The validation template's question sections (design-spec 6.6). */
const sections: TemplateSection[] = [
  section(
    "01",
    S01.map((k) => question(k)),
  ),
  section("02", [
    ...keys("02", ["CATEGORY", "OCEAN", "WHY", "DRIVERS", "BARRIERS"]).map(
      (k) => question(k),
    ),
    ...RED.map((k) => question(k, { "V.02.OCEAN": ["Red", "Mixed"] })),
    ...BLUE.map((k) => question(k, { "V.02.OCEAN": ["Blue", "Mixed"] })),
    ...keys("02", ["MARKET_SIZE", "REACHABLE", "SHARE"]).map((k) =>
      question(k),
    ),
  ]),
  section(
    "04",
    ["V.04.SURVIVOR_PATTERNS", "V.04.FAILURE_PATTERNS"].map((k) => question(k)),
  ),
  section("08", [question("V.08.WORTH")]),
  section(
    "10",
    S10.map((k) => question(k)),
  ),
];

const ctx: ViewContext = { workspaceId: "ws", ideaId: "idea", canWrite: true };
const viewer: ViewContext = { ...ctx, canWrite: false };

const TEMPLATE_ROWS: Record<CostCategory, string[]> = {
  initial: [
    "equipment",
    "renovation",
    "lease_deposit",
    "permits",
    "inventory",
    "branding",
    "launch_marketing",
    "tech_setup",
    "working_capital",
    "other",
  ],
  monthly_fixed: [
    "rent",
    "salaries",
    "utilities",
    "internet",
    "accounting",
    "marketing",
    "insurance",
    "other",
  ],
  variable: [
    "materials",
    "packaging",
    "payment_fee",
    "delivery",
    "labor",
    "other",
  ],
};
const PREFIX: Record<CostCategory, string> = {
  initial: "initial",
  monthly_fixed: "monthly",
  variable: "variable",
};

/** The template's 24 cost rows, all Empty (a new validation). */
const emptyCostRows = (): CostRowState[] =>
  (Object.keys(TEMPLATE_ROWS) as CostCategory[]).flatMap((category) =>
    (TEMPLATE_ROWS[category] ?? []).map((name, index) => ({
      id: `${PREFIX[category]}.${name}`,
      category,
      templateKey: `${PREFIX[category]}.${name}`,
      sortOrder: index,
      inputMode: "amount" as const,
      amount: null,
      percent: null,
      fau: null,
      confidence: null,
      activeEvidenceCount: 0,
    })),
  );

const filled = (row: CostRowState, amount: number): CostRowState => ({
  ...row,
  amount,
  fau: "assumption",
  confidence: "medium",
});

const newValidation = (): ValidationState => ({
  sections,
  thresholds: {
    competitors: { min: 3 },
    local_price: { pricedCompetitors: 2, researchLogs: 1 },
    permits: { researchLogs: 1 },
    demand_signal: { researchLogs: 1 },
  },
  answers: [],
  researchLogs: [],
  competitors: [],
  assumptionCount: 0,
  riskCount: 0,
  costRows: emptyCostRows(),
  economicsInputs: [],
});

const assumed = (
  questionKey: string,
  text = "an answer",
): ValidationAnswerInput => ({
  questionKey,
  text,
  fau: "assumption",
  confidence: "medium",
  activeEvidenceCount: 0,
});

const economics = (
  values: Partial<Record<EconomicsField, number>>,
): EconomicsInputState[] =>
  Object.entries(values).map(([fieldKey, value]) => ({
    fieldKey: fieldKey as EconomicsField,
    value: value as number,
    fau: "assumption",
    confidence: "high",
    activeEvidenceCount: 0,
  }));

const logs = (...tags: SupportsCheck[][]) =>
  tags.map((supportsChecks) => ({ supportsChecks }));

/** Every section filled, every check done, everything classified: ready to decide. */
const completeValidation = (): ValidationState => ({
  ...newValidation(),
  answers: [
    ...S01.map((k) => assumed(k)),
    assumed("V.02.OCEAN", "Red"),
    ...keys("02", [
      "CATEGORY",
      "WHY",
      "DRIVERS",
      "BARRIERS",
      "MARKET_SIZE",
      "REACHABLE",
      "SHARE",
    ]).map((k) => assumed(k)),
    ...RED.map((k) => assumed(k)),
    assumed("V.04.SURVIVOR_PATTERNS"),
    assumed("V.04.FAILURE_PATTERNS"),
    assumed("V.08.WORTH"),
    ...S10.map((k) => assumed(k)),
  ],
  researchLogs: logs(["local_price"], ["permits"], ["demand_signal"]),
  competitors: [
    { typicalPrice: 100 },
    { typicalPrice: 120 },
    { typicalPrice: null },
  ],
  assumptionCount: 2,
  riskCount: 1,
  costRows: emptyCostRows().map((row) =>
    filled(row, row.category === "variable" ? 10 : 1000),
  ),
  economicsInputs: economics({
    selling_price: 450,
    operating_days: 26,
    target_margin: 0.15,
    units_conservative: 6,
    units_expected: 10,
    units_strong: 15,
    units_capacity: 25,
  }),
});

const check = (checks: CheckResult[], key: CheckResult["key"]) => {
  const found = checks.find((c) => c.key === key);
  if (found === undefined) throw new Error(`no check ${key}`);
  return found;
};

describe("a new validation (design-spec 6.1 作ったばかり)", () => {
  const result = evaluateValidation(newValidation(), ctx);

  test("section progress", () => {
    expect(
      result.sections.map((s) => [s.key, s.answered, s.total, s.count]),
    ).toEqual([
      ["01", 0, 10, null],
      ["02", 0, 8, null],
      ["03", null, null, 0],
      ["04", null, null, 0],
      ["05", 0, 24, null],
      ["06-08", 0, 7, null],
      ["09", null, null, 0],
      ["10", 0, 6, null],
    ]);
    expect(result.sections.find((s) => s.key === "09")?.countB).toBe(0);
    expect(result.sections.find((s) => s.key === "03")?.fau).toBeNull();
  });

  test("everything is Empty", () => {
    // 10 + 8 + 2 patterns + WORTH + 6 answers, 24 cost rows, 7 numbers.
    expect(result.fau.empty).toBe(58);
    expect(result.fau.fact + result.fau.assumption.total).toBe(0);
  });

  test("every check is not started", () => {
    expect(result.checks.map((c) => [c.key, c.state])).toEqual([
      ["competitors", "not_started"],
      ["local_price", "not_started"],
      ["costs", "not_started"],
      ["break_even", "not_started"],
      ["permits", "not_started"],
      ["demand_signal", "not_started"],
    ]);
  });

  test("Next steps start with 01", () => {
    expect(result.nextSteps).toEqual([
      {
        kind: "start_customer_problem",
        count: null,
        checkKey: null,
        sectionKey: "01",
        link: {
          screen: 11,
          workspaceId: "ws",
          ideaId: "idea",
          sectionKey: "01",
        },
      },
      {
        kind: "check",
        count: 3,
        checkKey: "competitors",
        sectionKey: null,
        link: { screen: 15, workspaceId: "ws", ideaId: "idea" },
      },
      {
        kind: "check",
        count: null,
        checkKey: "local_price",
        sectionKey: null,
        link: { screen: 15, workspaceId: "ws", ideaId: "idea" },
      },
    ]);
  });

  test("the key metrics of 13 are Empty", () => {
    for (const key of [
      "initial_cost_total",
      "break_even_units_day",
      "expected_operating_profit",
      "payback_months",
    ])
      expect(result.keyMetrics[key]).toEqual({
        value: null,
        bound: "exact",
        reason: "empty",
      });
  });
});

describe("02 OCEAN shows its questions (design-spec 6.1・6.2)", () => {
  const withOcean = (
    ocean: string | null,
    extra: ValidationAnswerInput[] = [],
  ) =>
    evaluateValidation(
      {
        ...newValidation(),
        answers: [
          ...(ocean === null ? [] : [assumed("V.02.OCEAN", ocean)]),
          ...extra,
        ],
      },
      ctx,
    ).sections.find((s) => s.key === "02");

  test("8 unanswered, 12 for Red, 11 for Blue, 15 for Mixed", () => {
    expect(withOcean(null)?.total).toBe(8);
    expect(withOcean("Red")?.total).toBe(12);
    expect(withOcean("Blue")?.total).toBe(11);
    expect(withOcean(" Mixed ")?.total).toBe(15);
  });

  test("a hidden answer is kept but not counted", () => {
    const hidden = withOcean("Blue", [assumed("V.02.RED_1")]);
    expect(hidden?.answered).toBe(1);
    expect(hidden?.fau?.assumption.total).toBe(1);
    const shown = withOcean("Red", [assumed("V.02.RED_1")]);
    expect(shown?.answered).toBe(2);
  });

  test("answers to keys the template no longer has are not counted", () => {
    const result = evaluateValidation(
      { ...newValidation(), answers: [assumed("V.02.OLD_QUESTION")] },
      ctx,
    );
    expect(result.sections.find((s) => s.key === "02")?.answered).toBe(0);
    expect(result.fau.assumption.total).toBe(0);
  });
});

describe("checks (design-spec 6.1)", () => {
  const checksOf = (state: Partial<ValidationState>, view = ctx) =>
    evaluateValidation({ ...newValidation(), ...state }, view).checks;

  test("1 competitors: not started, partial, done, with the guide range", () => {
    const c = (n: number, min = 3) =>
      check(
        checksOf({
          competitors: Array.from({ length: n }, () => ({
            typicalPrice: null,
          })),
          thresholds: { ...newValidation().thresholds, competitors: { min } },
        }),
        "competitors",
      );
    expect(c(0).state).toBe("not_started");
    expect(c(2).state).toBe("partial");
    expect(c(3).state).toBe("done");
    expect(c(7).state).toBe("done");
    expect(c(7).count).toBe(7);
    expect(c(3).params).toEqual({ min: 3, max: 5 });
    expect(c(3, 4).state).toBe("partial");
    expect(c(3, 4).params).toEqual({ min: 4, max: 5 });
  });

  test("2 local price: priced competitors or a tagged research log", () => {
    const c = (prices: (number | null)[], tags: SupportsCheck[][] = []) =>
      check(
        checksOf({
          competitors: prices.map((typicalPrice) => ({ typicalPrice })),
          researchLogs: logs(...tags),
        }),
        "local_price",
      );
    expect(c([null, null]).state).toBe("not_started");
    expect(c([100, null]).state).toBe("partial");
    expect(c([100, 0]).state).toBe("done");
    expect(c([], [["local_price", "permits"]]).state).toBe("done");
    expect(c([], [["permits"]]).state).toBe("not_started");
    expect(c([]).params).toEqual({ pricedCompetitors: 2, researchLogs: 1 });
  });

  test("raised thresholds: 2 is partial with anything counted, 5 and 6 have no partial", () => {
    const thresholds = {
      competitors: { min: 3 },
      local_price: { pricedCompetitors: 3, researchLogs: 2 },
      permits: { researchLogs: 2 },
      demand_signal: { researchLogs: 2 },
    };
    const checks = (
      prices: (number | null)[],
      tags: SupportsCheck[][],
    ): CheckResult[] =>
      checksOf({
        thresholds,
        competitors: prices.map((typicalPrice) => ({ typicalPrice })),
        researchLogs: logs(...tags),
      });
    const one = checks([], [["local_price", "permits", "demand_signal"]]);
    expect(check(one, "local_price").state).toBe("partial");
    expect(check(one, "permits").state).toBe("not_started");
    expect(check(one, "demand_signal").state).toBe("not_started");
    expect(check(checks([10, 20], []), "local_price").state).toBe("partial");
    expect(check(checks([10, 20, 30], []), "local_price").state).toBe("done");
    const two = checks(
      [],
      [
        ["local_price", "permits", "demand_signal"],
        ["local_price", "permits", "demand_signal"],
      ],
    );
    for (const key of ["local_price", "permits", "demand_signal"] as const)
      expect(check(two, key).state).toBe("done");
  });

  test("3 costs: amounts in both tables and no Empty row left", () => {
    const rows = emptyCostRows();
    const c = (costRows: CostRowState[]) =>
      check(checksOf({ costRows }), "costs");

    expect(c(rows)).toMatchObject({
      state: "not_started",
      detail: { emptyRows: 18, missing: ["initial_amount", "monthly_amount"] },
    });
    const oneInitial = rows.map((r) =>
      r.id === "initial.equipment" ? filled(r, 5000) : r,
    );
    expect(c(oneInitial)).toMatchObject({
      state: "partial",
      detail: { emptyRows: 17, missing: ["monthly_amount"] },
    });
    const bothWithEmpty = oneInitial.map((r) =>
      r.id === "monthly.rent" ? filled(r, 0) : r,
    );
    expect(c(bothWithEmpty)).toMatchObject({
      state: "partial",
      detail: { emptyRows: 16, missing: [] },
    });
    // Unknown rows are fine; variable rows are not looked at.
    const done = bothWithEmpty
      .filter(
        (r) =>
          r.category !== "initial" ||
          r.id === "initial.equipment" ||
          r.id === "initial.permits",
      )
      .map((r) =>
        r.category === "monthly_fixed" && r.amount === null
          ? { ...r, fau: "unknown" as const }
          : r.id === "initial.permits"
            ? { ...r, fau: "unknown" as const }
            : r,
      );
    expect(c(done)).toMatchObject({
      state: "done",
      detail: { emptyRows: 0, missing: [] },
      link: { screen: 17 },
    });
  });

  test("4 break-even: price and monthly costs with a positive margin", () => {
    const rent = emptyCostRows().map((r) =>
      r.id === "monthly.rent" ? filled(r, 15000) : r,
    );
    const c = (state: Partial<ValidationState>) =>
      check(checksOf(state), "break_even");

    expect(c({})).toMatchObject({
      state: "not_started",
      detail: { missing: ["price", "monthly_costs"] },
      link: { screen: 18 },
    });
    expect(
      c({ economicsInputs: economics({ selling_price: 100 }) }),
    ).toMatchObject({
      state: "partial",
      detail: { missing: ["monthly_costs"] },
      link: { screen: 17 },
    });
    expect(c({ costRows: rent })).toMatchObject({
      state: "partial",
      detail: { missing: ["price"] },
      link: { screen: 18 },
    });
    const losing = rent.map((r) =>
      r.id === "variable.materials" ? filled(r, 150) : r,
    );
    expect(
      c({
        costRows: losing,
        economicsInputs: economics({ selling_price: 100 }),
      }),
    ).toMatchObject({
      state: "partial",
      detail: { missing: [] },
      link: { screen: 18 },
    });
    expect(
      c({ costRows: rent, economicsInputs: economics({ selling_price: 100 }) }),
    ).toMatchObject({ state: "done", link: { screen: 18 } });
  });

  test("5 permits: the template's Permits row, or a tagged research log", () => {
    const withPermits = (patch: Partial<CostRowState>) =>
      emptyCostRows().map((r) =>
        r.id === "initial.permits" ? { ...r, ...patch } : r,
      );
    const c = (state: Partial<ValidationState>, view = ctx) =>
      check(checksOf(state, view), "permits");

    expect(c({})).toMatchObject({
      state: "not_started",
      params: { researchLogs: 1 },
      link: { screen: 17, rowId: "initial.permits" },
    });
    expect(
      c({
        costRows: withPermits({
          amount: 0,
          fau: "assumption",
          confidence: "low",
        }),
      }).state,
    ).toBe("done");
    expect(
      c({
        costRows: withPermits({
          amount: 2500,
          fau: "fact",
          activeEvidenceCount: 1,
        }),
      }).state,
    ).toBe("done");
    expect(c({ costRows: withPermits({ amount: 2500 }) }).state).toBe(
      "not_started",
    );
    expect(c({ researchLogs: logs(["permits"]) }).state).toBe("done");

    // Without the template's row, a user row named Permits does not count and the link
    // opens a new research log tagged Permits.
    const noRow = emptyCostRows()
      .filter((r) => r.id !== "initial.permits")
      .concat({
        ...filled(emptyCostRows()[0] as CostRowState, 2500),
        id: "mine",
        templateKey: null,
      });
    expect(c({ costRows: noRow })).toMatchObject({
      state: "not_started",
      link: {
        screen: 14,
        newEntry: true,
        presetSupports: ["permits"],
      },
    });
    expect(c({ costRows: noRow }, viewer).link).toBeNull();
  });

  test("6 demand or problem signal: a tagged research log", () => {
    const c = (tags: SupportsCheck[][], view = ctx) =>
      check(checksOf({ researchLogs: logs(...tags) }, view), "demand_signal");
    expect(c([])).toMatchObject({
      state: "not_started",
      count: 0,
      link: { screen: 14, newEntry: true },
    });
    // Only the Permits link opens the entry with a tag (design-spec 6.1).
    expect(c([]).link).toEqual({
      screen: 14,
      workspaceId: "ws",
      ideaId: "idea",
      newEntry: true,
    });
    expect(
      c([["demand_signal"], ["demand_signal", "local_price"]]),
    ).toMatchObject({
      state: "done",
      count: 2,
      params: { researchLogs: 1 },
    });
    expect(c([], viewer).link).toBeNull();
  });
});

describe("Next steps (design-spec 6.1)", () => {
  const stepsOf = (state: ValidationState, view = ctx) =>
    evaluateValidation(state, view).nextSteps;

  test("everything done: ready to record a decision", () => {
    expect(stepsOf(completeValidation())).toEqual([
      {
        kind: "ready_to_decide",
        count: null,
        checkKey: null,
        sectionKey: null,
        link: { screen: 19, workspaceId: "ws", ideaId: "idea" },
      },
    ]);
    expect(stepsOf(completeValidation(), viewer)[0]?.link).toBeNull();
  });

  test("a Fact that lost its research log comes first", () => {
    const state = completeValidation();
    state.answers = state.answers.map((a) =>
      a.questionKey === "V.02.WHY" || a.questionKey === "V.10.WHY_FAIL"
        ? { ...a, fau: "fact", confidence: null, activeEvidenceCount: 0 }
        : a,
    );
    state.answers = [
      ...state.answers,
      { ...assumed("V.01.WHO"), fau: null, confidence: null },
    ];
    const steps = stepsOf(state);
    expect(steps[0]).toEqual({
      kind: "add_evidence",
      count: 2,
      checkKey: null,
      sectionKey: "02",
      link: {
        screen: 11,
        workspaceId: "ws",
        ideaId: "idea",
        sectionKey: "02",
        questionKey: "V.02.WHY",
      },
    });
    expect(steps[1]).toMatchObject({
      kind: "classify",
      count: 1,
      sectionKey: "01",
    });
  });

  test("Classify follows the section order 01 → 02 → 04 → 05 → 06–08 → 10", () => {
    const state = completeValidation();
    const unclassify = <T extends { fau: unknown; confidence: unknown }>(
      x: T,
    ) => ({
      ...x,
      fau: null,
      confidence: null,
    });
    state.answers = state.answers.map((a) =>
      ["V.10.WHY_WORK", "V.08.WORTH"].includes(a.questionKey)
        ? unclassify(a)
        : a,
    );
    state.economicsInputs = state.economicsInputs.map((i) =>
      i.fieldKey === "units_strong" ? unclassify(i) : i,
    );
    // 06–08: the inputs of 18 come before V.08.WORTH.
    expect(stepsOf(state)[0]).toEqual({
      kind: "classify",
      count: 3,
      checkKey: null,
      sectionKey: "06-08",
      link: {
        screen: 18,
        workspaceId: "ws",
        ideaId: "idea",
        field: "units_strong",
      },
    });

    state.costRows = state.costRows.map((r) =>
      r.id === "variable.delivery" || r.id === "monthly.salaries"
        ? unclassify(r)
        : r,
    );
    expect(stepsOf(state)[0]).toMatchObject({
      kind: "classify",
      count: 5,
      sectionKey: "05",
      link: { screen: 17, rowId: "monthly.salaries" },
    });

    state.answers = state.answers.map((a) =>
      a.questionKey === "V.04.FAILURE_PATTERNS" ? unclassify(a) : a,
    );
    expect(stepsOf(state)[0]).toMatchObject({
      sectionKey: "04",
      link: { screen: 15, questionKey: "V.04.FAILURE_PATTERNS" },
    });
  });

  test("unfinished checks in check order, with their counts", () => {
    const state = completeValidation();
    state.competitors = [{ typicalPrice: 100 }];
    state.costRows = state.costRows.map((r) =>
      r.id === "initial.renovation" || r.id === "monthly.rent"
        ? { ...r, amount: null, fau: null, confidence: null }
        : r,
    );
    state.researchLogs = logs(["permits"], ["local_price"]);
    expect(stepsOf(state)).toEqual([
      {
        kind: "check",
        count: 3,
        checkKey: "competitors",
        sectionKey: null,
        link: { screen: 15, workspaceId: "ws", ideaId: "idea" },
      },
      {
        kind: "check",
        count: 2,
        checkKey: "costs",
        sectionKey: null,
        link: { screen: 17, workspaceId: "ws", ideaId: "idea" },
      },
      {
        kind: "check",
        count: null,
        checkKey: "demand_signal",
        sectionKey: null,
        link: {
          screen: 14,
          workspaceId: "ws",
          ideaId: "idea",
          newEntry: true,
        },
      },
    ]);
  });

  test("costs with a table missing but no Empty row has no count", () => {
    const state = completeValidation();
    state.costRows = state.costRows.filter(
      (r) => r.category !== "monthly_fixed",
    );
    const costs = stepsOf(state).find((s) => s.checkKey === "costs");
    expect(costs?.count).toBeNull();
  });

  test("sections not started, from 01, then Unknowns", () => {
    const state = completeValidation();
    state.assumptionCount = 0;
    state.riskCount = 0;
    state.answers = state.answers.map((a) =>
      a.questionKey === "V.01.PROOF"
        ? { ...a, text: null, fau: "unknown", confidence: null }
        : a,
    );
    expect(stepsOf(state)).toEqual([
      {
        kind: "start_section",
        count: null,
        checkKey: null,
        sectionKey: "09",
        link: { screen: 16, workspaceId: "ws", ideaId: "idea" },
      },
      {
        kind: "check_unknowns",
        count: 1,
        checkKey: null,
        sectionKey: "01",
        link: {
          screen: 11,
          workspaceId: "ws",
          ideaId: "idea",
          sectionKey: "01",
          questionKey: "V.01.PROOF",
        },
      },
    ]);
  });

  test("at most three", () => {
    const state = newValidation();
    state.answers = [{ ...assumed("V.01.WHO"), fau: null, confidence: null }];
    const steps = stepsOf(state);
    expect(steps.map((s) => s.kind)).toEqual(["classify", "check", "check"]);
  });

  test("a section without answers is the one to start", () => {
    const state = completeValidation();
    state.answers = state.answers.filter(
      (a) => !a.questionKey.startsWith("V.10."),
    );
    expect(stepsOf(state)).toEqual([
      {
        kind: "start_section",
        count: null,
        checkKey: null,
        sectionKey: "10",
        link: {
          screen: 11,
          workspaceId: "ws",
          ideaId: "idea",
          sectionKey: "10",
        },
      },
    ]);
  });
});

describe("a section is started by any answer in it", () => {
  test("V.08.WORTH and the V.04 patterns start 06–08 and 04", () => {
    const state = completeValidation();
    state.economicsInputs = [];
    state.competitors = [];
    const before = evaluateValidation(state, ctx);
    expect(before.sections.find((s) => s.key === "06-08")?.answered).toBe(0);
    expect(before.sections.find((s) => s.key === "04")?.count).toBe(0);
    const starts = (steps: typeof before.nextSteps) =>
      steps.filter((s) => s.kind === "start_section").map((s) => s.sectionKey);
    // The V.04 patterns and V.08.WORTH still start 04 and 06–08, so no section is left.
    expect(starts(evaluateValidation(state, ctx).nextSteps)).toEqual([]);
    state.answers = state.answers.filter(
      (a) =>
        a.questionKey !== "V.08.WORTH" && !a.questionKey.startsWith("V.04."),
    );
    const steps = evaluateValidation(state, ctx).nextSteps;
    expect(steps.map((s) => s.checkKey ?? s.sectionKey)).toEqual([
      "competitors",
      "break_even",
      "04",
    ]);
  });
});

describe("progress of 05 and 06–08", () => {
  test("operating days and target margin still at the default count as not entered", () => {
    const state = newValidation();
    state.economicsInputs = [
      ...economics({ selling_price: 450 }),
      {
        fieldKey: "operating_days",
        value: null,
        fau: "unknown",
        confidence: null,
        activeEvidenceCount: 0,
      },
      {
        fieldKey: "units_expected",
        value: null,
        fau: "unknown",
        confidence: null,
        activeEvidenceCount: 0,
      },
    ];
    state.costRows = state.costRows.map((r) =>
      r.id === "initial.other" ? { ...r, fau: "unknown" } : r,
    );
    const result = evaluateValidation(state, ctx);
    const s0608 = result.sections.find((s) => s.key === "06-08");
    expect(s0608?.answered).toBe(2);
    expect(s0608?.fau?.unknown).toBe(2);
    expect(result.sections.find((s) => s.key === "05")?.answered).toBe(1);
  });

  test("a % variable row counts as entered", () => {
    const state = newValidation();
    state.costRows = state.costRows.map((r) =>
      r.id === "variable.payment_fee"
        ? { ...r, inputMode: "percent_of_price", percent: 0.03, fau: null }
        : r,
    );
    const result = evaluateValidation(state, ctx);
    expect(result.sections.find((s) => s.key === "05")?.answered).toBe(1);
    expect(result.fau.unclassified).toBe(1);
  });
});

test("a decision snapshot keeps the checks not done, the key metrics and F/A/U", () => {
  const state = completeValidation();
  state.competitors = [];
  const evaluation = evaluateValidation(state, ctx);
  const snapshot = buildDecisionSnapshot(evaluation);
  // The local price check stays done through its tagged research log.
  expect(snapshot.missingChecks.map((c) => c.key)).toEqual(["competitors"]);
  expect(snapshot.keyMetrics).toBe(evaluation.keyMetrics);
  expect(snapshot.fau).toBe(evaluation.fau);
  expect(snapshot).not.toContainKey("conditions");
  const goNoGo = buildDecisionSnapshot(evaluation, {
    conditions: { launchIf: "Pre-orders", delayIf: null, stopIf: null },
    planVersion: null,
  });
  expect(goNoGo.conditions?.launchIf).toBe("Pre-orders");
  expect(goNoGo.planVersion).toBeNull();
});

test("the evaluation fits the shared schemas of SDD 5.2", () => {
  const state = completeValidation();
  state.costRows = state.costRows.map((row) => ({
    ...row,
    id: crypto.randomUUID(),
  }));
  state.answers = state.answers.map((a) =>
    a.questionKey === "V.01.WHO" ? { ...a, fau: null, confidence: null } : a,
  );
  state.competitors = [];
  const result = evaluateValidation(state, {
    workspaceId: crypto.randomUUID(),
    ideaId: crypto.randomUUID(),
    canWrite: true,
  });
  expect(result.nextSteps.length).toBeGreaterThan(0);
  economicsResultSchema.parse(result.economics);
  keyMetricsSchema.parse(result.keyMetrics);
  fauBreakdownSchema.parse(result.fau);
  for (const check of result.checks) checkResultSchema.parse(check);
  for (const step of result.nextSteps) nextStepSchema.parse(step);
});
