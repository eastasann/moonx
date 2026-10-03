import { describe, expect, test } from "bun:test";
import {
  buildKeyMetrics,
  type CostRowInput,
  computeEconomics,
  EMPTY_ECONOMICS_INPUTS,
  formatKeyMetric,
  percentOfPriceAmount,
} from "../src";
import { percentRow, piayaInputs, piayaRows, row } from "./fixtures";

const scenario = (r: ReturnType<typeof computeEconomics>, key: string) => {
  const s = r.scenarios.find((c) => c.key === key);
  if (!s) throw new Error(key);
  return s;
};

describe("design-spec 8.3 check data (Piaya)", () => {
  const r = computeEconomics(piayaRows, piayaInputs);

  test("unit economics", () => {
    expect(r.variableCostPerUnit.value).toBeCloseTo(218.5, 10);
    expect(r.contributionMargin.value).toBeCloseTo(231.5, 10);
    expect(r.contributionMarginRate.value).toBeCloseTo(231.5 / 450, 10);
    expect(r.totals.monthlyFixed.amount).toBe(41700);
    expect(r.totals.initial.amount).toBe(169500);
  });

  test("break-even", () => {
    expect(r.breakEvenUnitsMonth.value).toBeCloseTo(180.1296, 3);
    expect(r.breakEvenUnitsDay.value).toBeCloseTo(6.9281, 3);
    expect(r.breakEvenRevenue.value).toBeCloseTo(81058.3, 0);
    expect(r.targetMarginUnitsMonth.value).toBeCloseTo(254.27, 1);
    expect(r.targetMarginUnitsDay.value).toBeCloseTo(9.78, 2);
    expect(r.defaultsUsed).toEqual({ operatingDays: false, targetMargin: true });
  });

  test("Expected scenario", () => {
    const e = scenario(r, "expected");
    expect(e.unitsPerMonth.value).toBe(260);
    expect(e.revenue.value).toBe(117000);
    expect(e.variableCostTotal.value).toBeCloseTo(56810, 6);
    expect(e.operatingProfit.value).toBeCloseTo(18490, 6);
    expect(e.operatingMargin.value).toBeCloseTo(18490 / 117000, 10);
  });

  test("Conservative scenario shows the loss as is", () => {
    const c = scenario(r, "conservative");
    expect(c.unitsPerMonth.value).toBe(156);
    expect(c.revenue.value).toBe(70200);
    expect(c.operatingProfit.value).toBeCloseTo(-5586, 6);
  });

  test("break-even column has zero profit", () => {
    const be = scenario(r, "break_even");
    expect(be.operatingProfit).toEqual({ value: 0, bound: "exact", reason: null });
    expect(be.unitsPerDay.value).toBeCloseTo(6.9281, 3);
    expect(be.revenue.value).toBeCloseTo(81058.3, 0);
  });

  test("payback and ROI", () => {
    expect(r.paybackMonths.value).toBeCloseTo(9.167, 3);
    expect(r.simpleRoi.value).toBeCloseTo(1.3091, 3);
  });

  test("no warnings", () => {
    expect(r.warnings).toEqual([]);
    expect(r.scenarios).toHaveLength(5);
    expect(scenario(r, "capacity").unitsPerMonth.value).toBe(650);
  });
});

describe("incomplete input", () => {
  test("a new validation has a reason for every result", () => {
    const r = computeEconomics([], EMPTY_ECONOMICS_INPUTS);
    expect(r.variableCostPerUnit.value).toBe(0);
    expect(r.contributionMargin.reason).toBe("needs_price");
    expect(r.breakEvenUnitsMonth.reason).toBe("needs_price");
    expect(r.targetMarginUnitsMonth.reason).toBe("needs_price");
    expect(r.paybackMonths.reason).toBe("needs_expected_sales");
    expect(r.simpleRoi.reason).toBe("needs_startup_costs");
    expect(r.defaultsUsed).toEqual({ operatingDays: true, targetMargin: true });
    for (const s of r.scenarios) expect(s.unitsPerDay.reason).not.toBeNull();
    expect(scenario(r, "expected").operatingProfit.reason).toBe("empty");
  });

  test("percent rows without a price cannot be computed", () => {
    const r = computeEconomics([percentRow("v.fee", 0.03)], EMPTY_ECONOMICS_INPUTS);
    expect(r.variableCostPerUnit.reason).toBe("needs_price");
    expect(r.totals.variablePerUnit.amount).toBeNull();
  });

  test("price without monthly costs", () => {
    const r = computeEconomics([], { ...EMPTY_ECONOMICS_INPUTS, sellingPrice: 100 });
    expect(r.breakEvenUnitsMonth.reason).toBe("needs_monthly_costs");
    expect(r.contributionMargin.value).toBe(100);
  });

  test("an empty scenario is Empty, never 0", () => {
    const r = computeEconomics(piayaRows, { ...piayaInputs, unitsStrong: null });
    const s = scenario(r, "strong");
    expect(s.unitsPerMonth).toEqual({ value: null, bound: "exact", reason: "empty" });
    expect(s.operatingProfit.reason).toBe("empty");
  });

  test("scenario profit needs monthly costs and a price", () => {
    const noFixed = computeEconomics(
      piayaRows.filter((x) => x.category !== "monthly_fixed"),
      piayaInputs,
    );
    expect(scenario(noFixed, "expected").operatingProfit.reason).toBe("needs_monthly_costs");
    expect(scenario(noFixed, "expected").operatingMargin.reason).toBe("needs_monthly_costs");
    expect(noFixed.paybackMonths.reason).toBe("needs_monthly_costs");
    expect(noFixed.simpleRoi.reason).toBe("needs_monthly_costs");

    const noPrice = computeEconomics(piayaRows, { ...piayaInputs, sellingPrice: null });
    expect(scenario(noPrice, "expected").revenue.reason).toBe("needs_price");
    expect(scenario(noPrice, "expected").operatingProfit.reason).toBe("needs_price");
  });

  test("a percent row outside the variable table is read as an amount", () => {
    const stray: CostRowInput = { ...percentRow("m.stray", 0.5), category: "monthly_fixed" };
    const r = computeEconomics([stray], EMPTY_ECONOMICS_INPUTS);
    expect(r.totals.monthlyFixed).toMatchObject({ amount: null, emptyRows: 1 });
  });

  test("zero units gives a dash for the margin", () => {
    const r = computeEconomics(piayaRows, { ...piayaInputs, unitsConservative: 0 });
    const c = scenario(r, "conservative");
    expect(c.revenue.value).toBe(0);
    expect(c.operatingMargin).toEqual({ value: null, bound: "exact", reason: null });
  });

  test("defaults: 30 days and 15% when empty, typed values are inputs", () => {
    const empty = computeEconomics(piayaRows, { ...piayaInputs, operatingDays: null });
    expect(empty.breakEvenUnitsDay.value).toBeCloseTo(180.1296 / 30, 3);
    expect(empty.defaultsUsed.operatingDays).toBe(true);
    const typed = computeEconomics(piayaRows, { ...piayaInputs, targetMargin: 0.15 });
    expect(typed.defaultsUsed.targetMargin).toBe(false);
  });
});

describe("margin problems", () => {
  const lossy: CostRowInput[] = [
    row("variable", "v.materials", 500),
    row("monthly_fixed", "m.rent", 1000),
  ];

  test("negative contribution margin hides break-even and warns", () => {
    const r = computeEconomics(lossy, { ...piayaInputs });
    expect(r.contributionMargin.value).toBe(-50);
    expect(r.breakEvenUnitsMonth.reason).toBe("margin_not_positive");
    expect(r.targetMarginUnitsMonth.reason).toBe("margin_not_positive");
    expect(r.warnings).toContain("margin_not_positive");
    expect(scenario(r, "expected").operatingProfit.value).toBeLessThan(0);
    expect(scenario(r, "break_even").unitsPerDay.reason).toBe("margin_not_positive");
    expect(r.paybackMonths.reason).toBe("not_recovered");
  });

  test("margin at or below target is unreachable", () => {
    const r = computeEconomics(
      [row("variable", "v.materials", 400), row("monthly_fixed", "m.rent", 1000)],
      { ...piayaInputs, targetMargin: 0.2 },
    );
    expect(r.breakEvenUnitsMonth.value).toBeCloseTo(20, 6);
    expect(r.targetMarginUnitsMonth.reason).toBe("target_margin_unreachable");
    expect(r.targetMarginUnitsDay.reason).toBe("target_margin_unreachable");
    expect(r.warnings).toContain("target_margin_unreachable");
  });

  test("profit of zero is not recovered", () => {
    const r = computeEconomics(
      [row("variable", "v", 200), row("monthly_fixed", "m", 2600), row("initial", "i", 1000)],
      { ...EMPTY_ECONOMICS_INPUTS, sellingPrice: 300, operatingDays: 26, unitsExpected: 1 },
    );
    expect(scenario(r, "expected").operatingProfit.value).toBeCloseTo(0, 9);
    expect(r.paybackMonths.reason).toBe("not_recovered");
  });

  test("startup costs of zero cannot give an ROI", () => {
    const rows = piayaRows.map((x) => (x.category === "initial" ? { ...x, amount: 0 } : x));
    const r = computeEconomics(rows, piayaInputs);
    expect(r.simpleRoi.reason).toBe("needs_startup_costs");
    expect(r.paybackMonths.value).toBe(0);
  });

  test("missing startup costs", () => {
    const rows = piayaRows.filter((x) => x.category !== "initial");
    const r = computeEconomics(rows, piayaInputs);
    expect(r.paybackMonths.reason).toBe("needs_startup_costs");
    expect(r.simpleRoi.reason).toBe("needs_startup_costs");
  });
});

describe("capacity warnings", () => {
  test("scenarios above the capacity limit", () => {
    const r = computeEconomics(piayaRows, {
      ...piayaInputs,
      unitsConservative: 30,
      unitsExpected: 26,
      unitsStrong: 27,
      unitsCapacity: 25,
    });
    expect(r.warnings).toEqual([
      "conservative_exceeds_capacity",
      "expected_exceeds_capacity",
      "strong_exceeds_capacity",
    ]);
    expect(scenario(r, "expected").exceedsCapacity).toBe(true);
    expect(scenario(r, "capacity").exceedsCapacity).toBe(false);
  });

  test("break-even above capacity", () => {
    const r = computeEconomics(piayaRows, { ...piayaInputs, unitsCapacity: 5 });
    expect(r.warnings).toContain("break_even_above_capacity");
    expect(scenario(r, "break_even").exceedsCapacity).toBe(true);
  });
});

describe("lower and upper bounds from incomplete costs", () => {
  const withGaps = (category: CostRowInput["category"], key: string): CostRowInput[] => [
    ...piayaRows,
    row(category, key, null, "empty"),
  ];

  test("startup cost gap: payback is a lower bound, ROI an upper bound", () => {
    const r = computeEconomics(withGaps("initial", "initial.extra"), piayaInputs);
    expect(r.totals.initial).toMatchObject({ amount: 169500, isLowerBound: true, emptyRows: 1 });
    expect(r.paybackMonths.bound).toBe("lower");
    expect(r.simpleRoi.bound).toBe("upper");
    expect(r.breakEvenUnitsMonth.bound).toBe("exact");
    expect(r.warnings).toEqual(["costs_incomplete"]);
  });

  test("monthly gap (Unknown row): break-even is a lower bound, profit an upper bound", () => {
    const rows = [...piayaRows, row("monthly_fixed", "monthly.extra", null, "unknown")];
    const r = computeEconomics(rows, piayaInputs);
    expect(r.totals.monthlyFixed).toMatchObject({
      isLowerBound: true,
      unknownRows: 1,
      emptyRows: 0,
    });
    expect(r.breakEvenUnitsMonth.bound).toBe("lower");
    expect(r.breakEvenUnitsDay.bound).toBe("lower");
    expect(r.breakEvenRevenue.bound).toBe("lower");
    expect(r.targetMarginUnitsMonth.bound).toBe("lower");
    const e = scenario(r, "expected");
    expect(e.operatingProfit.bound).toBe("upper");
    expect(e.operatingMargin.bound).toBe("upper");
    expect(e.revenue.bound).toBe("exact");
    expect(scenario(r, "break_even").revenue.bound).toBe("lower");
    expect(scenario(r, "break_even").operatingProfit.bound).toBe("exact");
    expect(r.paybackMonths.bound).toBe("lower");
    expect(r.simpleRoi.bound).toBe("upper");
  });

  test("variable gap: cost per sale is a lower bound, contribution an upper bound", () => {
    const r = computeEconomics(withGaps("variable", "variable.extra"), piayaInputs);
    expect(r.variableCostPerUnit.bound).toBe("lower");
    expect(r.contributionMargin.bound).toBe("upper");
    expect(r.contributionMarginRate.bound).toBe("upper");
    expect(r.breakEvenUnitsMonth.bound).toBe("lower");
    expect(scenario(r, "expected").variableCostTotal.bound).toBe("lower");
    expect(scenario(r, "break_even").variableCostTotal.bound).toBe("lower");
  });

  test("a table with only gaps has a null total", () => {
    const r = computeEconomics([row("initial", "i", null, "empty")], EMPTY_ECONOMICS_INPUTS);
    expect(r.totals.initial).toEqual({
      amount: null,
      isLowerBound: true,
      unknownRows: 0,
      emptyRows: 1,
    });
  });
});

describe("key metrics", () => {
  test("scalar metrics and cost rows", () => {
    const r = computeEconomics(piayaRows, piayaInputs);
    const m = buildKeyMetrics(r, piayaInputs, piayaRows);
    expect(m.initial_cost_total?.value).toBe(169500);
    expect(m.monthly_fixed_total?.value).toBe(41700);
    expect(m.selling_price?.value).toBe(450);
    expect(m.break_even_units_day?.value).toBeCloseTo(6.9281, 3);
    expect(m.expected_operating_profit?.value).toBeCloseTo(18490, 6);
    expect(m.expected_revenue?.value).toBe(117000);
    expect(m.capacity_units_day?.value).toBe(25);
    expect(m.operating_days?.value).toBe(26);
    expect(m["cost_row:monthly.rent"]?.value).toBe(12000);
    expect(m.payback_months?.value).toBeCloseTo(9.167, 3);
  });

  test("a percent-of-price row is the amount per sale, never the bare rate", () => {
    const rows = [percentRow("variable.card_fees", 0.03), ...piayaRows];
    const m = buildKeyMetrics(computeEconomics(rows, piayaInputs), piayaInputs, rows);
    expect(m["cost_row:variable.card_fees"]?.value).toBeCloseTo(13.5, 10);
    const noPrice = { ...piayaInputs, sellingPrice: null };
    const n = buildKeyMetrics(computeEconomics(rows, noPrice), noPrice, rows);
    expect(n["cost_row:variable.card_fees"]?.reason).toBe("needs_price");
    const blank = [percentRow("variable.card_fees", null)];
    const b = buildKeyMetrics(computeEconomics(blank, piayaInputs), piayaInputs, blank);
    expect(b["cost_row:variable.card_fees"]?.reason).toBe("empty");
  });

  test("formatted headline metrics: rates and payback keep .0, typed volumes stay as typed", () => {
    const inputs = { ...piayaInputs, unitsCapacity: 6.25 };
    const m = buildKeyMetrics(computeEconomics(piayaRows, inputs), inputs, piayaRows);
    expect(formatKeyMetric("capacity_units_day", m.capacity_units_day, "PHP")).toBe("6.25");
    expect(
      formatKeyMetric("payback_months", { value: 9, bound: "exact", reason: null }, "PHP"),
    ).toBe("9.0");
    expect(formatKeyMetric("simple_roi", { value: 0.5, bound: "exact", reason: null }, "PHP")).toBe(
      "50.0%",
    );
    expect(
      formatKeyMetric("break_even_units_day", { value: 13, bound: "exact", reason: null }, "PHP"),
    ).toBe("13");
    const rate = percentRow("variable.card_fees", 0.03);
    const priced = buildKeyMetrics(computeEconomics([rate], piayaInputs), piayaInputs, [rate]);
    expect(
      formatKeyMetric("cost_row:variable.card_fees", priced["cost_row:variable.card_fees"], "PHP"),
    ).toBe("₱14");
  });

  test("missing values carry a reason, rows without a key are skipped", () => {
    const rows = [row("initial", "initial.permits", null, "empty"), row("initial", "", 5)];
    const noKey: CostRowInput = { ...row("initial", "x", 5), templateKey: null };
    const r = computeEconomics([...rows, noKey], EMPTY_ECONOMICS_INPUTS);
    const m = buildKeyMetrics(r, EMPTY_ECONOMICS_INPUTS, [...rows, noKey]);
    expect(m.selling_price?.reason).toBe("needs_price");
    expect(m.capacity_units_day?.reason).toBe("empty");
    expect(m.monthly_fixed_total?.reason).toBe("empty");
    expect(m.operating_days?.value).toBe(30);
    expect(m["cost_row:initial.permits"]?.reason).toBe("empty");
    expect(Object.keys(m).some((k) => k === "cost_row:null")).toBe(false);
  });
});

describe("percentOfPriceAmount", () => {
  test("is the percent times the price, and unknown while either is missing", () => {
    expect(percentOfPriceAmount(0.35, 220)).toBeCloseTo(77, 10);
    expect(percentOfPriceAmount(0, 450)).toBe(0);
    expect(percentOfPriceAmount(0.35, null)).toBeNull();
    expect(percentOfPriceAmount(null, 450)).toBeNull();
  });
});
