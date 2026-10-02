import { createI18n } from "@moonx/i18n";
import type { CheckResult, NextStep } from "@moonx/schemas";
import { expect, test } from "vitest";
import {
  checkLabel,
  checkReasons,
  checkStateText,
  excerpt,
  fauSegments,
  HOME_KEYS,
  metricView,
  nextStepText,
  sectionProgress,
} from "../src/lib/validation-home";
import { makeFullHome, makeNewHome } from "./support-validation-home";

const i18n = createI18n();
const t = i18n.t.bind(i18n);

const link = { screen: 11 };
const step = (kind: NextStep["kind"], extra: Partial<NextStep> = {}): NextStep => ({
  kind,
  count: null,
  checkKey: null,
  sectionKey: null,
  link,
  ...extra,
});
const sections = makeNewHome().sections;

test("every catalog key the home reads exists", () => {
  const keys = Object.values(HOME_KEYS).flatMap((group) => Object.values(group));
  // A plural entry is stored as `key_one` / `key_other`.
  expect(keys.filter((key) => !(i18n.exists(key) || i18n.exists(`${key}_other`)))).toEqual([]);
});

test("Next steps text for each kind (design-spec 6.1)", () => {
  expect(nextStepText(t, step("add_evidence", { count: 2 }), sections)).toBe("Add evidence (2)");
  expect(nextStepText(t, step("classify", { count: 3 }), sections)).toBe("Classify answers (3)");
  expect(nextStepText(t, step("start_customer_problem"), sections)).toBe(
    "Start with 01 Customer & Problem",
  );
  expect(nextStepText(t, step("start_section", { sectionKey: "02" }), sections)).toBe(
    "Start 02 Market",
  );
  expect(nextStepText(t, step("check_unknowns", { count: 4 }), sections)).toBe(
    "Check unknowns (4)",
  );
  expect(nextStepText(t, step("ready_to_decide"), sections)).toBe("Ready to record a decision");
});

test("Next steps text for each check", () => {
  const check = (checkKey: NextStep["checkKey"], count: number | null = null) =>
    nextStepText(t, step("check", { checkKey, count }), sections);
  expect(check("competitors", 3)).toBe("Find 3 competitors");
  expect(check("competitors", 4)).toBe("Find 4 competitors");
  expect(check("local_price")).toBe("Add local prices");
  expect(check("costs", 2)).toBe("Fill or mark 2 empty cost rows");
  expect(check("costs", 1)).toBe("Fill or mark 1 empty cost row");
  expect(check("costs")).toBe("Add startup and monthly costs");
  expect(check("break_even")).toBe("Add price and monthly costs");
  expect(check("permits")).toBe("Check permits");
  expect(check("demand_signal")).toBe("Find a demand or problem signal");
});

const base: CheckResult = {
  key: "competitors",
  state: "not_started",
  count: 0,
  params: { min: 3, max: 5 },
  detail: null,
  link,
};

test("the competitors check carries the template's range and its count", () => {
  expect(checkLabel(t, base)).toBe("Competitors (3–5)");
  expect(checkLabel(t, { ...base, params: { min: 2, max: 4 } })).toBe("Competitors (2–4)");
  expect(checkStateText(t, { ...base, state: "done", count: 4 })).toBe("Done (4)");
  expect(checkStateText(t, { ...base, state: "partial", count: 1 })).toBe("Partial (1)");
  expect(checkStateText(t, { ...base, key: "permits", state: "done", count: 2 })).toBe("Done");
});

test("check reasons name what is missing", () => {
  expect(checkReasons(t, { ...base, state: "partial", count: 1 })).toEqual(["1 found, 3 needed"]);
  expect(checkReasons(t, { ...base, state: "done", count: 4 })).toEqual([]);
  expect(checkReasons(t, { ...base, state: "done", count: 6 })).toEqual(["Aim for 3–5"]);
  const costs: CheckResult = {
    ...base,
    key: "costs",
    state: "partial",
    count: null,
    params: {},
    detail: { emptyRows: 2, missing: ["monthly_amount"] },
  };
  expect(checkReasons(t, costs)).toEqual(["2 rows are Empty", "No monthly cost amount yet"]);
  const breakEven: CheckResult = {
    ...costs,
    key: "break_even",
    detail: { missing: ["price", "monthly_costs"] },
  };
  expect(checkReasons(t, breakEven)).toEqual(["Needs price", "Needs monthly costs"]);
  expect(checkReasons(t, { ...breakEven, detail: { missing: [] } })[0]).toMatch(
    /^Contribution margin is zero or negative/,
  );
  expect(
    checkReasons(t, {
      ...base,
      key: "local_price",
      state: "partial",
      count: 1,
      params: { pricedCompetitors: 2, researchLogs: 1 },
    }),
  ).toEqual(["1 of 2 competitors have a price"]);
});

const options = { currency: "PHP", marginNegative: false };

test("key numbers: amounts, lower bounds, units and reasons", () => {
  const full = makeFullHome().keyMetrics;
  expect(metricView(t, "initial_cost_total", full.initial_cost_total, options).value).toBe(
    "₱169,500",
  );
  expect(metricView(t, "break_even_units_day", full.break_even_units_day, options).value).toBe(
    "6.9 / day",
  );
  expect(
    metricView(t, "expected_operating_profit", full.expected_operating_profit, options).value,
  ).toBe("₱18,490 / month");
  expect(metricView(t, "payback_months", full.payback_months, options).value).toBe("9.2 months");

  const lower = metricView(
    t,
    "initial_cost_total",
    { value: 450000, bound: "lower", reason: null },
    options,
  );
  expect(lower.value).toBe("₱450,000+");
  expect(lower.note).toBe("Lower bound: some rows are Empty or Unknown");

  const needsPrice = metricView(
    t,
    "break_even_units_day",
    { value: null, bound: "exact", reason: "needs_price" },
    options,
  );
  expect(needsPrice).toMatchObject({ value: "Empty", note: "Needs price" });
  expect(
    metricView(t, "initial_cost_total", { value: null, bound: "exact", reason: "empty" }, options),
  ).toMatchObject({ value: "Empty", note: null });
});

test("a negative margin puts the warning on the break-even number", () => {
  const view = metricView(
    t,
    "break_even_units_day",
    { value: null, bound: "exact", reason: "margin_not_positive" },
    { currency: "PHP", marginNegative: true },
  );
  expect(view).toMatchObject({
    value: "Empty",
    note: "Contribution margin is negative",
    marginNegative: true,
  });
  const other = metricView(
    t,
    "initial_cost_total",
    { value: 1000, bound: "exact", reason: null },
    { currency: "PHP", marginNegative: true },
  );
  expect(other.marginNegative).toBe(false);
});

test("the F/A/U legend lists the five states with the assumption confidence split", () => {
  const segments = fauSegments(t, makeFullHome().fau);
  expect(segments.map((s) => [s.label, s.valueLabel])).toEqual([
    ["Fact", "12"],
    ["Assumption", "9 (L3 M4 H2)"],
    ["Unknown", "2"],
    ["Unclassified", "3"],
    ["Empty", "18"],
  ]);
  const empty = fauSegments(t, makeNewHome().fau);
  expect(empty.find((s) => s.variant === "assumption")?.valueLabel).toBe("0");
});

test("section progress counts", () => {
  const full = makeFullHome().sections;
  const text = (key: string) => {
    const section = full.find((s) => s.key === key);
    if (!section) throw new Error(key);
    return sectionProgress(t, section, { min: 3, max: 5 });
  };
  expect(text("01")).toBe("8/10");
  expect(text("03")).toBe("7 entries");
  expect(text("04")).toBe("4 (3–5)");
  expect(text("05")).toBe("22/24 rows");
  expect(text("06-08")).toBe("5/7 inputs");
  expect(text("09")).toBe("3 assumptions · 2 risks");
});

test("a long answer is cut for the Summary block", () => {
  expect(excerpt("  short  ")).toBe("short");
  const long = excerpt("a".repeat(500));
  expect(long.endsWith("…")).toBe(true);
  expect(long.length).toBeLessThan(300);
});
