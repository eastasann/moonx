import { describe, expect, test } from "bun:test";
import type { MetricValue } from "@moonx/schemas";
import {
  buildKeyMetrics,
  type CostRowInput,
  computeEconomics,
  type EconomicsInput,
  isLinkedMetricKey,
  KEY_METRIC_KEYS,
  keyMetricOf,
  scenarioOf,
} from "./economics";

const amountRow = (
  category: CostRowInput["category"],
  templateKey: string | null,
  amount: number | null,
  fau: CostRowInput["fau"] = amount === null ? null : "assumption",
): CostRowInput => ({
  category,
  templateKey,
  inputMode: "amount",
  amount,
  percent: null,
  fau,
});

const percentRow = (
  templateKey: string,
  percent: number | null,
): CostRowInput => ({
  category: "variable",
  templateKey,
  inputMode: "percent_of_price",
  amount: null,
  percent,
  fau: percent === null ? null : "assumption",
});

const value = (v: number) => ({ value: v, fau: "assumption" as const });

/** design-spec 8.3: Piaya Gift Box Delivery. */
const piaya: EconomicsInput = {
  costRows: [
    amountRow("variable", "variable.materials", 120),
    amountRow("variable", "variable.packaging", 45),
    percentRow("variable.payment_fee", 0.03),
    amountRow("variable", "variable.delivery", 40),
    amountRow("variable", "variable.labor", 0),
    amountRow("variable", "variable.other", 0),
    amountRow("monthly_fixed", "monthly.rent", 12000),
    amountRow("monthly_fixed", "monthly.salaries", 18000),
    amountRow("monthly_fixed", "monthly.utilities", 3500),
    amountRow("monthly_fixed", "monthly.internet", 1200),
    amountRow("monthly_fixed", "monthly.accounting", 2000),
    amountRow("monthly_fixed", "monthly.marketing", 5000),
    amountRow("monthly_fixed", "monthly.insurance", 0),
    amountRow("monthly_fixed", "monthly.other", 0),
    amountRow("initial", "initial.equipment", 35000),
    amountRow("initial", "initial.renovation", 20000),
    amountRow("initial", "initial.lease_deposit", 24000),
    amountRow("initial", "initial.permits", 8500),
    amountRow("initial", "initial.inventory", 15000),
    amountRow("initial", "initial.branding", 12000),
    amountRow("initial", "initial.launch_marketing", 10000),
    amountRow("initial", "initial.tech_setup", 5000),
    amountRow("initial", "initial.working_capital", 40000),
    amountRow("initial", "initial.other", 0),
  ],
  inputs: {
    selling_price: value(450),
    operating_days: value(26),
    // Target margin left empty: 15% by default.
    units_conservative: value(6),
    units_expected: value(10),
    units_strong: value(15),
    units_capacity: value(25),
  },
};

/** The 8.3 table lists rounded values; the results are not rounded. */
const round = (metric: MetricValue, digits: number) =>
  metric.value === null ? null : Number(metric.value.toFixed(digits));

describe("design-spec 8.3 verification data", () => {
  const result = computeEconomics(piaya);

  test("unit economics", () => {
    expect(round(result.variableCostPerUnit, 2)).toBe(218.5);
    expect(round(result.contributionMargin, 2)).toBe(231.5);
    expect(round(result.contributionMarginRate, 3)).toBe(0.514);
    expect(result.totals.monthlyFixed.amount).toBe(41700);
    expect(result.totals.initial.amount).toBe(169500);
  });

  test("break-even", () => {
    expect(round(result.breakEvenUnitsMonth, 2)).toBe(180.13);
    expect(round(result.breakEvenUnitsMonth, 1)).toBe(180.1);
    expect(round(result.breakEvenUnitsDay, 2)).toBe(6.93);
    expect(round(result.breakEvenUnitsDay, 1)).toBe(6.9);
    expect(round(result.breakEvenRevenue, 0)).toBe(81058);
  });

  test("units for the target margin, with the 15% default", () => {
    expect(result.defaultsUsed).toEqual({
      operatingDays: false,
      targetMargin: true,
    });
    expect(round(result.targetMarginUnitsMonth, 1)).toBe(254.3);
    expect(round(result.targetMarginUnitsDay, 1)).toBe(9.8);
  });

  test("Expected", () => {
    const expected = scenarioOf(result, "expected");
    expect(expected.unitsPerMonth.value).toBe(260);
    expect(round(expected.revenue, 0)).toBe(117000);
    expect(round(expected.variableCostTotal, 0)).toBe(56810);
    expect(round(expected.operatingProfit, 0)).toBe(18490);
    expect(round(expected.operatingMargin, 3)).toBe(0.158);
  });

  test("Conservative shows its loss as is", () => {
    const conservative = scenarioOf(result, "conservative");
    expect(conservative.unitsPerMonth.value).toBe(156);
    expect(round(conservative.revenue, 0)).toBe(70200);
    expect(round(conservative.operatingProfit, 0)).toBe(-5586);
  });

  test("payback and ROI", () => {
    expect(round(result.paybackMonths, 2)).toBe(9.17);
    expect(round(result.paybackMonths, 1)).toBe(9.2);
    expect(round(result.simpleRoi, 3)).toBe(1.309);
  });

  test("every result is exact and no warning is raised", () => {
    expect(result.warnings).toEqual([]);
    const { scenarios, totals, defaultsUsed, warnings, ...single } = result;
    const metrics = [
      ...Object.values(single),
      ...scenarios.flatMap((column) => [
        column.unitsPerDay,
        column.unitsPerMonth,
        column.revenue,
        column.variableCostTotal,
        column.operatingProfit,
        column.operatingMargin,
      ]),
    ];
    expect(metrics).toHaveLength(10 + 5 * 6);
    for (const metric of metrics) {
      expect(metric.bound).toBe("exact");
      expect(metric.value).not.toBeNull();
    }
    for (const total of Object.values(totals))
      expect(total.isLowerBound).toBe(false);
  });

  test("the break-even column has zero operating profit", () => {
    const breakEven = scenarioOf(result, "break_even");
    expect(breakEven.operatingProfit.value).toBe(0);
    expect(breakEven.operatingMargin.value).toBe(0);
    expect(round(breakEven.unitsPerDay, 1)).toBe(6.9);
    expect(round(breakEven.revenue, 0)).toBe(81058);
    expect(round(breakEven.variableCostTotal, 0)).toBe(39358);
    expect(breakEven.exceedsCapacity).toBe(false);
  });

  test("key metrics", () => {
    const metrics = buildKeyMetrics(piaya, result);
    expect(metrics.initial_cost_total).toEqual({
      value: 169500,
      bound: "exact",
      reason: null,
    });
    expect(metrics.monthly_fixed_total?.value).toBe(41700);
    expect(metrics.selling_price?.value).toBe(450);
    expect(metrics.operating_days?.value).toBe(26);
    expect(metrics.capacity_units_day?.value).toBe(25);
    expect(round(metrics.expected_operating_profit as MetricValue, 0)).toBe(
      18490,
    );
    expect(metrics.expected_revenue?.value).toBe(117000);
    expect(round(metrics.payback_months as MetricValue, 1)).toBe(9.2);
    expect(round(metrics.simple_roi as MetricValue, 3)).toBe(1.309);
    expect(round(metrics.break_even_units_day as MetricValue, 1)).toBe(6.9);
    expect(round(metrics.target_margin_units_month as MetricValue, 1)).toBe(
      254.3,
    );
    expect(metrics["cost_row:monthly.rent"]?.value).toBe(12000);
    expect(metrics["cost_row:variable.payment_fee"]?.value).toBe(13.5);
  });
});

const withInputs = (
  inputs: EconomicsInput["inputs"],
  costRows: CostRowInput[] = piaya.costRows as CostRowInput[],
): EconomicsInput => ({ costRows, inputs });

describe("lower and upper bounds", () => {
  test("an Empty initial cost row makes the payback a lower and the ROI an upper bound", () => {
    const result = computeEconomics(
      withInputs(piaya.inputs, [
        ...piaya.costRows,
        amountRow("initial", null, null),
      ]),
    );
    expect(result.totals.initial).toEqual({
      amount: 169500,
      isLowerBound: true,
      unknownRows: 0,
      emptyRows: 1,
    });
    expect(result.paybackMonths.bound).toBe("lower");
    expect(result.simpleRoi.bound).toBe("upper");
    expect(result.breakEvenUnitsMonth.bound).toBe("exact");
    expect(scenarioOf(result, "expected").operatingProfit.bound).toBe("exact");
    expect(result.warnings).toEqual(["costs_incomplete"]);
  });

  test("an Unknown monthly row carries into break-even, profits, payback and ROI", () => {
    const result = computeEconomics(
      withInputs(piaya.inputs, [
        ...piaya.costRows,
        amountRow("monthly_fixed", null, null, "unknown"),
      ]),
    );
    expect(result.totals.monthlyFixed.unknownRows).toBe(1);
    expect(result.breakEvenUnitsMonth.bound).toBe("lower");
    expect(result.breakEvenUnitsDay.bound).toBe("lower");
    expect(result.breakEvenRevenue.bound).toBe("lower");
    expect(result.targetMarginUnitsMonth.bound).toBe("lower");
    const expected = scenarioOf(result, "expected");
    expect(expected.operatingProfit.bound).toBe("upper");
    expect(expected.operatingMargin.bound).toBe("upper");
    expect(expected.revenue.bound).toBe("exact");
    expect(expected.variableCostTotal.bound).toBe("exact");
    expect(result.paybackMonths.bound).toBe("lower");
    expect(result.simpleRoi.bound).toBe("upper");
  });

  test("an Empty variable row bounds the variable cost and the contribution", () => {
    const result = computeEconomics(
      withInputs(piaya.inputs, [
        ...piaya.costRows,
        amountRow("variable", null, null),
      ]),
    );
    expect(result.variableCostPerUnit.bound).toBe("lower");
    expect(result.contributionMargin.bound).toBe("upper");
    expect(result.contributionMarginRate.bound).toBe("upper");
    expect(result.breakEvenUnitsMonth.bound).toBe("lower");
    expect(scenarioOf(result, "expected").variableCostTotal.bound).toBe(
      "lower",
    );
    expect(scenarioOf(result, "break_even").variableCostTotal.bound).toBe(
      "lower",
    );
  });
});

describe("the ROI bound of a loss (design-spec 6.4)", () => {
  // Expected 6 a day loses ₱5,586 a month.
  const losing = { ...piaya.inputs, units_expected: value(6) };
  const emptyInitial = amountRow("initial", null, null);
  const emptyMonthly = amountRow("monthly_fixed", null, null);

  test("only IC a lower bound: a larger IC brings the loss closer to 0", () => {
    const result = computeEconomics(
      withInputs(losing, [...piaya.costRows, emptyInitial]),
    );
    expect(result.simpleRoi.value).toBeLessThan(0);
    expect(result.simpleRoi.bound).toBe("lower");
  });

  test("only the costs per month a lower bound: the loss may be larger", () => {
    const result = computeEconomics(
      withInputs(losing, [...piaya.costRows, emptyMonthly]),
    );
    expect(result.simpleRoi.bound).toBe("upper");
  });

  test("both: no direction, shown as approximate", () => {
    const result = computeEconomics(
      withInputs(losing, [...piaya.costRows, emptyInitial, emptyMonthly]),
    );
    expect(result.simpleRoi.bound).toBe("approximate");
  });

  test("an exact loss is exact", () => {
    expect(computeEconomics(withInputs(losing)).simpleRoi.bound).toBe("exact");
  });
});

describe("what cannot be calculated", () => {
  test("a new validation names the missing inputs", () => {
    const result = computeEconomics({
      costRows: [
        amountRow("initial", "initial.equipment", null),
        amountRow("monthly_fixed", "monthly.rent", null),
        amountRow("variable", "variable.materials", null),
      ],
      inputs: {},
    });
    expect(result.variableCostPerUnit.reason).toBe("empty");
    expect(result.contributionMargin.reason).toBe("needs_price");
    expect(result.contributionMarginRate.reason).toBe("needs_price");
    expect(result.breakEvenUnitsMonth.reason).toBe("needs_price");
    expect(result.targetMarginUnitsMonth.reason).toBe("needs_price");
    expect(result.paybackMonths.reason).toBe("needs_price");
    expect(result.simpleRoi.reason).toBe("needs_price");
    for (const s of result.scenarios.slice(1)) {
      expect(s.unitsPerMonth.reason).toBe("empty");
      expect(s.operatingProfit.reason).toBe("empty");
    }
    expect(result.scenarios[0]?.unitsPerDay.reason).toBe("needs_price");
    expect(result.totals.initial).toEqual({
      amount: null,
      isLowerBound: true,
      unknownRows: 0,
      emptyRows: 1,
    });
    expect(result.defaultsUsed).toEqual({
      operatingDays: true,
      targetMargin: true,
    });
  });

  test("no monthly costs", () => {
    const result = computeEconomics(
      withInputs(
        piaya.inputs,
        piaya.costRows.filter((row) => row.category !== "monthly_fixed"),
      ),
    );
    expect(result.breakEvenUnitsMonth.reason).toBe("needs_monthly_costs");
    expect(result.breakEvenUnitsDay.reason).toBe("needs_monthly_costs");
    expect(result.breakEvenRevenue.reason).toBe("needs_monthly_costs");
    expect(result.targetMarginUnitsMonth.reason).toBe("needs_monthly_costs");
    expect(scenarioOf(result, "expected").operatingProfit.reason).toBe(
      "needs_monthly_costs",
    );
    expect(scenarioOf(result, "expected").revenue.value).toBe(117000);
    expect(result.paybackMonths.reason).toBe("needs_monthly_costs");
    const breakEven = scenarioOf(result, "break_even");
    expect(breakEven.operatingProfit.reason).toBe("needs_monthly_costs");
  });

  test("a % row needs the price", () => {
    const { selling_price: _, ...rest } = piaya.inputs;
    const result = computeEconomics(withInputs(rest));
    expect(result.variableCostPerUnit.reason).toBe("needs_price");
    expect(result.totals.variablePerUnit.amount).toBeNull();
    expect(scenarioOf(result, "expected").variableCostTotal.reason).toBe(
      "needs_price",
    );
    expect(scenarioOf(result, "expected").revenue.reason).toBe("needs_price");
    expect(scenarioOf(result, "expected").operatingMargin.reason).toBe(
      "needs_price",
    );
  });

  test("a margin of zero or less stops break-even, the target, payback and ROI, not the scenarios", () => {
    const result = computeEconomics(
      withInputs({ ...piaya.inputs, selling_price: value(200) }),
    );
    // VC = 205 + 3% of 200 = 211, above the price.
    expect(result.contributionMargin.value).toBe(-11);
    expect(result.breakEvenUnitsMonth.reason).toBe("margin_not_positive");
    expect(result.targetMarginUnitsMonth.reason).toBe("margin_not_positive");
    expect(result.warnings).toContain("margin_not_positive");
    expect(result.warnings).not.toContain("target_margin_unreachable");
    expect(scenarioOf(result, "expected").operatingProfit.value).toBeLessThan(
      0,
    );
    // The margin comes before the reasons of their own table (design-spec 6.4).
    expect(result.paybackMonths.reason).toBe("margin_not_positive");
    expect(result.simpleRoi.reason).toBe("margin_not_positive");
    expect(scenarioOf(result, "break_even").operatingMargin.reason).toBe(
      "margin_not_positive",
    );
  });

  test("a target margin above the contribution rate is not reachable", () => {
    const result = computeEconomics(
      withInputs({ ...piaya.inputs, target_margin: value(0.6) }),
    );
    expect(result.targetMarginUnitsMonth.reason).toBe(
      "target_margin_unreachable",
    );
    expect(result.targetMarginUnitsDay.reason).toBe(
      "target_margin_unreachable",
    );
    expect(result.breakEvenUnitsMonth.value).not.toBeNull();
    expect(result.warnings).toContain("target_margin_unreachable");
    expect(result.defaultsUsed.targetMargin).toBe(false);
  });

  test("an unreachable target margin comes after the missing monthly costs", () => {
    const result = computeEconomics(
      withInputs(
        { ...piaya.inputs, target_margin: value(0.6) },
        piaya.costRows.filter((row) => row.category !== "monthly_fixed"),
      ),
    );
    expect(result.targetMarginUnitsMonth.reason).toBe("needs_monthly_costs");
    expect(result.targetMarginUnitsDay.reason).toBe("needs_monthly_costs");
    // The warning above the results still says it.
    expect(result.warnings).toContain("target_margin_unreachable");
  });

  test("with no variable cost row filled, VC is Empty and counts as 0", () => {
    const result = computeEconomics(
      withInputs(piaya.inputs, [
        ...piaya.costRows.filter((row) => row.category !== "variable"),
        amountRow("variable", "variable.materials", null),
      ]),
    );
    expect(result.variableCostPerUnit.reason).toBe("empty");
    expect(result.contributionMargin).toEqual({
      value: 450,
      bound: "upper",
      reason: null,
    });
    expect(result.contributionMarginRate.value).toBe(1);
    expect(result.breakEvenUnitsMonth.bound).toBe("lower");
    const exactZero = computeEconomics(
      withInputs(
        piaya.inputs,
        piaya.costRows.filter((row) => row.category !== "variable"),
      ),
    );
    expect(exactZero.variableCostPerUnit.reason).toBe("empty");
    expect(exactZero.contributionMargin).toEqual({
      value: 450,
      bound: "exact",
      reason: null,
    });
  });

  test("payback and ROI: startup costs, then Expected sales, then its profit", () => {
    const noInitial = piaya.costRows.filter(
      (row) => row.category !== "initial",
    );
    expect(
      computeEconomics(withInputs(piaya.inputs, noInitial)).paybackMonths
        .reason,
    ).toBe("needs_startup_costs");
    const zeroInitial = [...noInitial, amountRow("initial", null, 0)];
    const zero = computeEconomics(withInputs(piaya.inputs, zeroInitial));
    expect(zero.paybackMonths.reason).toBe("needs_startup_costs");
    expect(zero.simpleRoi.reason).toBe("needs_startup_costs");

    const { units_expected: _, ...rest } = piaya.inputs;
    const noExpected = computeEconomics(withInputs(rest));
    expect(noExpected.paybackMonths.reason).toBe("needs_expected_sales");
    expect(noExpected.simpleRoi.reason).toBe("needs_expected_sales");

    const noMonthlyNorInitial = computeEconomics(
      withInputs(
        piaya.inputs,
        piaya.costRows.filter((row) => row.category === "variable"),
      ),
    );
    expect(noMonthlyNorInitial.paybackMonths.reason).toBe(
      "needs_monthly_costs",
    );
    expect(noMonthlyNorInitial.simpleRoi.reason).toBe("needs_monthly_costs");
    const noInitialNorExpected = computeEconomics(withInputs(rest, noInitial));
    expect(noInitialNorExpected.paybackMonths.reason).toBe(
      "needs_startup_costs",
    );
    expect(noInitialNorExpected.simpleRoi.reason).toBe("needs_startup_costs");

    const losing = computeEconomics(
      withInputs({ ...piaya.inputs, units_expected: value(6) }),
    );
    expect(losing.paybackMonths.reason).toBe("not_recovered");
    expect(round(losing.simpleRoi, 4)).toBe(
      Number(((-5586 * 12) / 169500).toFixed(4)),
    );
  });

  test("zero revenue has no margin", () => {
    const result = computeEconomics(
      withInputs({ ...piaya.inputs, units_strong: value(0) }),
    );
    expect(scenarioOf(result, "strong").operatingMargin).toEqual({
      value: null,
      bound: "exact",
      reason: null,
    });
  });

  test("zero monthly costs: break-even is 0 and its margin a dash", () => {
    const result = computeEconomics(
      withInputs(piaya.inputs, [
        ...piaya.costRows.filter((row) => row.category !== "monthly_fixed"),
        amountRow("monthly_fixed", "monthly.rent", 0),
      ]),
    );
    expect(result.breakEvenUnitsMonth.value).toBe(0);
    expect(scenarioOf(result, "break_even").operatingMargin.reason).toBeNull();
    expect(scenarioOf(result, "break_even").operatingMargin.value).toBeNull();
  });
});

describe("decimal inputs are calculated exactly", () => {
  test("a contribution of exactly 0 is not positive", () => {
    // 1.17 + 10% of 1.30 = 1.30, which binary floating point makes 2e-16 short.
    const result = computeEconomics({
      costRows: [
        amountRow("variable", "variable.materials", 1.17),
        percentRow("variable.payment_fee", 0.1),
        amountRow("monthly_fixed", "monthly.rent", 1000),
      ],
      inputs: { selling_price: value(1.3) },
    });
    expect(result.contributionMargin.value).toBe(0);
    expect(result.breakEvenUnitsMonth.reason).toBe("margin_not_positive");
    expect(result.warnings).toEqual(["margin_not_positive"]);
  });

  test("a target exactly at the contribution rate is not reachable", () => {
    // 100 × 29% is 28.999999999999996 in binary floating point.
    for (const [price, materials, margin] of [
      [100, 71, 0.29],
      [50, 21, 0.58],
      [100, 43, 0.57],
      [90, 27, 0.7],
    ] as const) {
      const result = computeEconomics({
        costRows: [
          amountRow("variable", "variable.materials", materials),
          amountRow("monthly_fixed", "monthly.rent", 1000),
        ],
        inputs: { selling_price: value(price), target_margin: value(margin) },
      });
      expect(result.targetMarginUnitsMonth.reason).toBe(
        "target_margin_unreachable",
      );
    }
  });

  test("an Expected profit of exactly 0 is not recovered", () => {
    // 10 a day × 30 days × (1.30 − 1.20) = 30.
    const result = computeEconomics({
      costRows: [
        amountRow("variable", "variable.materials", 1.2),
        amountRow("monthly_fixed", "monthly.rent", 30),
        amountRow("initial", "initial.equipment", 500),
      ],
      inputs: { selling_price: value(1.3), units_expected: value(10) },
    });
    expect(scenarioOf(result, "expected").operatingProfit.value).toBe(0);
    expect(result.paybackMonths.reason).toBe("not_recovered");
    expect(result.simpleRoi).toEqual({
      value: 0,
      bound: "exact",
      reason: null,
    });
  });

  test("results are the doubles nearest the decimals, so display rounds them half up", () => {
    // 1.5% of 11 = 0.165 and 10.10 − 5% = 9.595; binary floating point gives 0.16499… and
    // 9.59499…, which would round down.
    const fee = (price: number, rate: number) =>
      computeEconomics({
        costRows: [percentRow("variable.payment_fee", rate)],
        inputs: { selling_price: value(price) },
      });
    expect(fee(11, 0.015).variableCostPerUnit.value).toBe(0.165);
    expect(fee(10.1, 0.05).contributionMargin.value).toBe(9.595);
  });
});

describe("capacity", () => {
  test("scenarios above the capacity limit are flagged", () => {
    const result = computeEconomics(
      withInputs({ ...piaya.inputs, units_capacity: value(8) }),
    );
    expect(result.warnings).toEqual([
      "expected_exceeds_capacity",
      "strong_exceeds_capacity",
    ]);
    expect(scenarioOf(result, "capacity").exceedsCapacity).toBe(false);
  });

  test("break-even above the capacity limit is flagged", () => {
    const result = computeEconomics(
      withInputs({ ...piaya.inputs, units_capacity: value(5) }),
    );
    expect(result.warnings).toEqual([
      "break_even_above_capacity",
      "conservative_exceeds_capacity",
      "expected_exceeds_capacity",
      "strong_exceeds_capacity",
    ]);
  });

  test("no capacity limit, no flag", () => {
    const { units_capacity: _, ...rest } = piaya.inputs;
    const result = computeEconomics(withInputs(rest));
    expect(result.warnings).toEqual([]);
    expect(scenarioOf(result, "capacity").unitsPerDay.reason).toBe("empty");
  });
});

describe("key metrics", () => {
  test("a new validation shows every derived key metric as Empty", () => {
    const input: EconomicsInput = {
      costRows: [
        amountRow("initial", "initial.permits", null),
        amountRow("monthly_fixed", "monthly.rent", null),
        amountRow("variable", "variable.materials", null),
      ],
      inputs: {},
    };
    const metrics = buildKeyMetrics(input, computeEconomics(input));
    for (const key of [
      "initial_cost_total",
      "monthly_fixed_total",
      "variable_cost_per_unit",
      "selling_price",
      "contribution_margin",
      "contribution_margin_rate",
      "break_even_units_month",
      "break_even_units_day",
      "break_even_revenue",
      "target_margin_units_month",
      "expected_revenue",
      "expected_operating_profit",
      "payback_months",
      "simple_roi",
      "capacity_units_day",
      "cost_row:initial.permits",
    ])
      expect(metrics[key]).toEqual({
        value: null,
        bound: "exact",
        reason: "empty",
      });
    expect(metrics.operating_days?.value).toBe(30);
  });

  test("once an input is in, the missing one is named", () => {
    const input: EconomicsInput = {
      costRows: [amountRow("monthly_fixed", "monthly.rent", 15000)],
      inputs: {},
    };
    const metrics = buildKeyMetrics(input, computeEconomics(input));
    expect(metrics.break_even_units_day?.reason).toBe("needs_price");
    expect(metrics.payback_months?.reason).toBe("needs_price");
    expect(metrics.contribution_margin?.reason).toBe("empty");
  });

  test("Unknown inputs and rows say Unknown, % rows need the price", () => {
    const input: EconomicsInput = {
      costRows: [
        amountRow("initial", "initial.permits", null, "unknown"),
        percentRow("variable.payment_fee", 0.03),
        amountRow("initial", null, 500),
      ],
      inputs: {
        selling_price: { value: null, fau: "unknown" },
        units_capacity: { value: null, fau: "unknown" },
      },
    };
    const metrics = buildKeyMetrics(input, computeEconomics(input));
    expect(metrics.selling_price?.reason).toBe("unknown");
    expect(metrics.capacity_units_day?.reason).toBe("unknown");
    expect(metrics["cost_row:initial.permits"]?.reason).toBe("unknown");
    expect(metrics["cost_row:variable.payment_fee"]?.reason).toBe(
      "needs_price",
    );
    expect(metrics.initial_cost_total).toEqual({
      value: 500,
      bound: "lower",
      reason: null,
    });
    // The price is Unknown, so it counts as entered: the reason is named.
    expect(metrics.break_even_units_day?.reason).toBe("needs_price");
  });
});

describe("keyMetricOf", () => {
  const metrics = buildKeyMetrics(piaya, computeEconomics(piaya));

  test("every fixed key is there", () => {
    for (const key of KEY_METRIC_KEYS)
      expect(keyMetricOf(metrics, key)).toBe(metrics[key] as MetricValue);
  });

  test("a deleted template cost row is Empty", () => {
    expect(keyMetricOf(metrics, "cost_row:monthly.rent").value).toBe(12000);
    const withoutRent = {
      ...piaya,
      costRows: piaya.costRows.filter((r) => r.templateKey !== "monthly.rent"),
    };
    const after = buildKeyMetrics(withoutRent, computeEconomics(withoutRent));
    expect(after["cost_row:monthly.rent"]).toBeUndefined();
    expect(keyMetricOf(after, "cost_row:monthly.rent")).toEqual({
      value: null,
      bound: "exact",
      reason: "empty",
    });
  });

  test("any other missing key is a mistake", () => {
    expect(() => keyMetricOf(metrics, "scenario_table")).toThrow();
  });
});

test("scenarioOf finds a column and refuses a result without it", () => {
  const result = computeEconomics(piaya);
  expect(scenarioOf(result, "strong").unitsPerDay.value).toBe(15);
  expect(() => scenarioOf({ ...result, scenarios: [] }, "strong")).toThrow();
});

describe("the key metrics a number sub-item may name (SDD 5.2 linked_metric)", () => {
  const costRows = new Set(["monthly.salaries"]);
  test("single values, scenario columns and published cost rows", () => {
    for (const key of [
      "break_even_units_day",
      "operating_days",
      "scenario:expected",
      "scenario:capacity",
      "cost_row:monthly.salaries",
    ]) {
      expect(isLinkedMetricKey(key, costRows)).toBe(true);
    }
  });
  test("not a typo, the whole scenario table, break-even's column or an unknown row", () => {
    for (const key of [
      "break_even_unit_day",
      "scenario_table",
      "scenario:break_even",
      "cost_row:monthly.salary",
      "cost_row:",
      "",
    ]) {
      expect(isLinkedMetricKey(key, costRows)).toBe(false);
    }
  });
});
