import type {
  CostCategory,
  CostTotal,
  EconomicsField,
  EconomicsResult,
  EconomicsWarning,
  Fau,
  KeyMetrics,
  MetricBound,
  MetricReason,
  MetricValue,
  ScenarioColumn,
  ScenarioKey,
} from "@moonx/schemas";

/** Used while operating days is empty or Unknown (design-spec 6.4). */
export const DEFAULT_OPERATING_DAYS = 30;
/** Used while the target operating margin is empty or Unknown (design-spec 6.4). */
export const DEFAULT_TARGET_MARGIN = 0.15;

/** One cost row of 17 that is not deleted. */
export interface CostRowInput {
  category: CostCategory;
  /** The template's key (`initial.permits`), or null for a row the user added. */
  templateKey: string | null;
  inputMode: "amount" | "percent_of_price";
  /** At most two decimal places (design-spec 6.0.8). */
  amount: number | null;
  /** A 0 to 1 rate of the selling price with at most four decimal places; variable rows only. */
  percent: number | null;
  fau: Fau | null;
}

/** One number of 18. Null value: empty or Unknown. */
export interface NumberInput {
  value: number | null;
  fau: Fau | null;
}

/**
 * What the calculation of design-spec 6.4 reads. A field left out of `inputs` was never
 * entered. The values keep the input rules of design-spec 6.0.8: the price is above 0 with
 * two decimal places, daily sales have two, the target margin is a rate with four, and
 * operating days are a whole number.
 */
export interface EconomicsInput {
  costRows: readonly CostRowInput[];
  inputs: Partial<Record<EconomicsField, NumberInput>>;
}

const exact = (value: number): MetricValue => ({
  value,
  bound: "exact",
  reason: null,
});
const bounded = (value: number, bound: MetricBound): MetricValue => ({
  value,
  bound,
  reason: null,
});
const missing = (reason: MetricReason | null): MetricValue => ({
  value: null,
  bound: "exact",
  reason,
});

// Amounts and daily sales have at most two decimal places and rates four (design-spec
// 6.0.8), so every sum and product below is an exact integer count of 1e-6 (an amount
// times a rate) or 1e-8 (that times daily sales). Binary floating point is not exact: a
// contribution of exactly 0 comes out as 2e-16 and slips past the "≤ 0" tests, and
// ₱0.165 comes out as 0.16499… and rounds down. Each result is one division of exact
// integers, the double nearest the true value, which the formatters round as the decimal
// it is.
const scaled = (value: number, decimals: number) =>
  BigInt(Math.round(value * 10 ** decimals));
const cents = (amount: number) => scaled(amount, 2);
const basisPoints = (rate: number) => scaled(rate, 4);
const MICROS_PER_CENT = 10_000n;
const MICROS = 1_000_000n;
const ratio = (numerator: bigint, denominator: bigint) =>
  Number(numerator) / Number(denominator);

/** Whether a cost row has a value in its input mode. */
export const rowHasValue = (row: CostRowInput) =>
  row.inputMode === "amount" ? row.amount !== null : row.percent !== null;

const rowTouched = (row: CostRowInput) =>
  rowHasValue(row) || row.fau === "unknown";

interface TableSum {
  total: CostTotal;
  /** The sum in 1e-6 to calculate with: 0 when no row has a value. Null when it needs the price. */
  micros: bigint | null;
}

const sumTable = (
  rows: readonly CostRowInput[],
  priceCents: bigint | null,
): TableSum => {
  let micros = 0n;
  let valued = 0;
  let needsPrice = false;
  let unknownRows = 0;
  let emptyRows = 0;
  for (const row of rows) {
    if (row.inputMode === "amount" && row.amount !== null) {
      micros += cents(row.amount) * MICROS_PER_CENT;
      valued += 1;
    } else if (row.inputMode === "percent_of_price" && row.percent !== null) {
      if (priceCents === null) needsPrice = true;
      else micros += priceCents * basisPoints(row.percent);
      valued += 1;
    } else if (row.fau === "unknown") {
      unknownRows += 1;
    } else {
      emptyRows += 1;
    }
  }
  return {
    total: {
      amount: valued === 0 || needsPrice ? null : ratio(micros, MICROS),
      isLowerBound: unknownRows + emptyRows > 0,
      unknownRows,
      emptyRows,
    },
    micros: needsPrice ? null : micros,
  };
};

const inputValue = (input: EconomicsInput, field: EconomicsField) =>
  input.inputs[field]?.value ?? null;

/** Runs `compute` unless a reason, checked in the given order, stops it first. */
const firstReason = (
  checks: readonly [boolean, MetricReason][],
  compute: () => MetricValue,
): MetricValue => {
  for (const [blocked, reason] of checks) if (blocked) return missing(reason);
  return compute();
};

/** Operating profit over revenue. Zero revenue has no margin: both value and reason null. */
const marginOf = (profit: MetricValue, revenue: MetricValue): MetricValue => {
  if (profit.value === null) return profit;
  if (revenue.value === null) return revenue;
  if (revenue.value === 0) return missing(null);
  return bounded(profit.value / revenue.value, profit.bound);
};

const SCENARIO_FIELDS = {
  conservative: "units_conservative",
  expected: "units_expected",
  strong: "units_strong",
  capacity: "units_capacity",
} as const satisfies Record<string, EconomicsField>;

/**
 * The unit economics, scenarios and investment return of design-spec 6.4. Nothing is
 * rounded: the formatters of packages/i18n round for display.
 *
 * Empty and Unknown cost rows are left out of the sums, which makes a table's total a
 * lower bound; the bound carries into every result built on it ("+" and "≤").
 */
export const computeEconomics = (input: EconomicsInput): EconomicsResult => {
  const price = inputValue(input, "selling_price");
  const priceCents = price === null ? null : cents(price);
  const priceMicros = priceCents === null ? null : priceCents * MICROS_PER_CENT;
  const days = BigInt(
    inputValue(input, "operating_days") ?? DEFAULT_OPERATING_DAYS,
  );
  const margin = basisPoints(
    inputValue(input, "target_margin") ?? DEFAULT_TARGET_MARGIN,
  );
  const capacity = inputValue(input, "units_capacity");

  const byCategory = (category: CostCategory) =>
    input.costRows.filter((row) => row.category === category);
  const initial = sumTable(byCategory("initial"), priceCents);
  const monthly = sumTable(byCategory("monthly_fixed"), priceCents);
  const variable = sumTable(byCategory("variable"), priceCents);

  // IC and FC are null when no row has an amount; VC is 0 then (design-spec 6.4) and null
  // only when % rows need the price, so it is known whenever the price is.
  const ic = initial.total.amount === null ? null : initial.micros;
  const fc = monthly.total.amount === null ? null : monthly.micros;
  const vc = variable.micros;
  const icLower = initial.total.isLowerBound;
  const fcLower = monthly.total.isLowerBound;
  const vcLower = variable.total.isLowerBound;
  const costsLower = fcLower || vcLower;

  const cp = priceMicros === null || vc === null ? null : priceMicros - vc;
  const marginNotPositive = cp !== null && cp <= 0n;
  // CP − P × m in 1e-6: cents times basis points.
  const targetGap =
    cp === null || priceCents === null ? null : cp - priceCents * margin;

  const variableCostPerUnit =
    vc === null
      ? missing("needs_price")
      : variable.total.amount === null
        ? missing("empty")
        : bounded(ratio(vc, MICROS), vcLower ? "lower" : "exact");
  const contributionMargin =
    cp === null
      ? missing("needs_price")
      : bounded(ratio(cp, MICROS), vcLower ? "upper" : "exact");
  const contributionMarginRate =
    cp === null || priceMicros === null
      ? missing("needs_price")
      : bounded(ratio(cp, priceMicros), vcLower ? "upper" : "exact");

  const breakEvenBlocks: [boolean, MetricReason][] = [
    [cp === null, "needs_price"],
    [marginNotPositive, "margin_not_positive"],
    [fc === null, "needs_monthly_costs"],
  ];
  const lowerIfCosts = costsLower ? "lower" : "exact";
  // The blocks above leave FC known and CP above 0 for every compute below.
  const fcMicros = fc as bigint;
  const cpMicros = cp as bigint;
  const breakEvenUnitsMonth = firstReason(breakEvenBlocks, () =>
    bounded(ratio(fcMicros, cpMicros), lowerIfCosts),
  );
  const breakEvenUnitsDay = firstReason(breakEvenBlocks, () =>
    bounded(ratio(fcMicros, cpMicros * days), lowerIfCosts),
  );
  // FC × P ÷ CP: the 1e-6 of P comes back as a factor of 1e6 under the line.
  const breakEvenRevenue = firstReason(breakEvenBlocks, () =>
    bounded(
      ratio(fcMicros * (priceMicros as bigint), cpMicros * MICROS),
      lowerIfCosts,
    ),
  );

  // The common reasons first, then the one of its own row, as for payback and ROI
  // (design-spec 6.4).
  const targetMarginBlocks: [boolean, MetricReason][] = [
    ...breakEvenBlocks,
    [targetGap !== null && targetGap <= 0n, "target_margin_unreachable"],
  ];
  const gapMicros = targetGap as bigint;
  const targetMarginUnitsMonth = firstReason(targetMarginBlocks, () =>
    bounded(ratio(fcMicros, gapMicros), lowerIfCosts),
  );
  const targetMarginUnitsDay = firstReason(targetMarginBlocks, () =>
    bounded(ratio(fcMicros, gapMicros * days), lowerIfCosts),
  );

  // Revenue, variable costs and profit of a scenario are in 1e-8: units per month (1e-2)
  // times an amount per sale (1e-6).
  const PER_1E8 = MICROS * 100n;

  const scenario = (
    key: keyof typeof SCENARIO_FIELDS,
  ): { column: ScenarioColumn; profit: bigint | null } => {
    const units = inputValue(input, SCENARIO_FIELDS[key]);
    if (units === null) {
      const empty = missing("empty");
      return {
        column: {
          key,
          unitsPerDay: empty,
          unitsPerMonth: empty,
          revenue: empty,
          variableCostTotal: empty,
          operatingProfit: empty,
          operatingMargin: empty,
          exceedsCapacity: false,
        },
        profit: null,
      };
    }
    const unitsPerMonth = cents(units) * days;
    const revenue =
      priceMicros === null
        ? missing("needs_price")
        : exact(ratio(unitsPerMonth * priceMicros, PER_1E8));
    const variableCostTotal =
      vc === null
        ? missing("needs_price")
        : bounded(
            ratio(unitsPerMonth * vc, PER_1E8),
            vcLower ? "lower" : "exact",
          );
    const profit =
      priceMicros === null || fc === null
        ? null
        : unitsPerMonth * (priceMicros - (vc as bigint)) - fc * 100n;
    const operatingProfit =
      profit === null
        ? missing(price === null ? "needs_price" : "needs_monthly_costs")
        : bounded(ratio(profit, PER_1E8), costsLower ? "upper" : "exact");
    return {
      column: {
        key,
        unitsPerDay: exact(units),
        unitsPerMonth: exact(ratio(unitsPerMonth, 100n)),
        revenue,
        variableCostTotal,
        operatingProfit,
        operatingMargin:
          profit === null
            ? operatingProfit
            : unitsPerMonth === 0n
              ? missing(null)
              : bounded(
                  ratio(profit, unitsPerMonth * (priceMicros as bigint)),
                  operatingProfit.bound,
                ),
        exceedsCapacity:
          key !== "capacity" &&
          capacity !== null &&
          cents(units) > cents(capacity),
      },
      profit,
    };
  };

  const breakEvenColumn = (): ScenarioColumn => {
    const base = {
      key: "break_even" as const,
      unitsPerDay: breakEvenUnitsDay,
      unitsPerMonth: breakEvenUnitsMonth,
      revenue: breakEvenRevenue,
    };
    if (breakEvenUnitsMonth.value === null)
      return {
        ...base,
        variableCostTotal: breakEvenUnitsMonth,
        operatingProfit: breakEvenUnitsMonth,
        operatingMargin: breakEvenUnitsMonth,
        exceedsCapacity: false,
      };
    // Zero by definition. Computing revenue − costs here would only show rounding noise.
    const operatingProfit = exact(0);
    return {
      ...base,
      // FC × VC ÷ CP, scaled like the break-even revenue.
      variableCostTotal: bounded(
        ratio(fcMicros * (vc as bigint), cpMicros * MICROS),
        breakEvenUnitsMonth.bound,
      ),
      operatingProfit,
      operatingMargin: marginOf(operatingProfit, breakEvenRevenue),
      // FC ÷ (CP × D) > capacity, without dividing.
      exceedsCapacity:
        capacity !== null &&
        fcMicros * 100n > cents(capacity) * cpMicros * days,
    };
  };

  const breakEven = breakEvenColumn();
  const expected = scenario("expected");
  const scenarios = [
    breakEven,
    scenario("conservative").column,
    expected.column,
    scenario("strong").column,
    scenario("capacity").column,
  ];
  const expectedProfit = expected.profit;
  const expectedUnits = inputValue(input, "units_expected");

  // The common order first (price, margin, monthly costs), then the order of their own
  // table (design-spec 6.4).
  const returnBlocks: [boolean, MetricReason][] = [
    ...breakEvenBlocks,
    [ic === null || ic === 0n, "needs_startup_costs"],
    [expectedUnits === null, "needs_expected_sales"],
  ];
  const profitUpper = expected.column.operatingProfit.bound === "upper";
  // A larger true IC shrinks a gain but brings a loss closer to 0, so with a loss the IC
  // bound points the other way; with both bounds the direction is unknown (design-spec 6.4).
  const roiBound = (profit: bigint): MetricBound => {
    if (profit >= 0n) return icLower || profitUpper ? "upper" : "exact";
    if (icLower && profitUpper) return "approximate";
    if (icLower) return "lower";
    return profitUpper ? "upper" : "exact";
  };
  // IC in 1e-6 against the profit in 1e-8.
  const icMicros = ic as bigint;
  const profitPer1e8 = expectedProfit as bigint;
  const paybackMonths = firstReason(
    [
      ...returnBlocks,
      // Never null here: the reasons above cover every way it can be.
      [expectedProfit !== null && expectedProfit <= 0n, "not_recovered"],
    ],
    () =>
      bounded(
        ratio(icMicros * 100n, profitPer1e8),
        icLower || profitUpper ? "lower" : "exact",
      ),
  );
  const simpleRoi = firstReason(returnBlocks, () =>
    bounded(ratio(profitPer1e8 * 12n, icMicros * 100n), roiBound(profitPer1e8)),
  );

  const warnings: EconomicsWarning[] = [];
  if (marginNotPositive) warnings.push("margin_not_positive");
  if (!marginNotPositive && targetGap !== null && targetGap <= 0n)
    warnings.push("target_margin_unreachable");
  if (breakEven.exceedsCapacity) warnings.push("break_even_above_capacity");
  for (const column of scenarios.slice(1, 4))
    if (column.exceedsCapacity)
      warnings.push(`${column.key}_exceeds_capacity` as EconomicsWarning);
  if (icLower || fcLower || vcLower) warnings.push("costs_incomplete");

  return {
    variableCostPerUnit,
    contributionMargin,
    contributionMarginRate,
    breakEvenUnitsMonth,
    breakEvenUnitsDay,
    breakEvenRevenue,
    targetMarginUnitsMonth,
    targetMarginUnitsDay,
    scenarios,
    paybackMonths,
    simpleRoi,
    totals: {
      initial: initial.total,
      monthlyFixed: monthly.total,
      variablePerUnit: variable.total,
    },
    defaultsUsed: {
      operatingDays: inputValue(input, "operating_days") === null,
      targetMargin: inputValue(input, "target_margin") === null,
    },
    warnings,
  };
};

/** The column of `key`; `computeEconomics` always returns all five. */
export const scenarioOf = (result: EconomicsResult, key: ScenarioKey) => {
  const column = result.scenarios.find((s) => s.key === key);
  if (column === undefined) throw new Error(`No scenario column ${key}`);
  return column;
};

/**
 * The keys of the single-value key metrics of design-spec 6.4 that every `KeyMetrics`
 * has. Besides them, it has `cost_row:{template key}` for each template row not deleted.
 */
export const KEY_METRIC_KEYS = [
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
  "operating_days",
] as const;
/** One of `KEY_METRIC_KEYS`. The `cost_row:*` keys are plain strings outside it. */
export type KeyMetricKey = (typeof KEY_METRIC_KEYS)[number];

/** The key metric of one template cost row is this prefix and the row's template key. */
export const COST_ROW_METRIC_PREFIX = "cost_row:";

/** The key metrics that are one scenario's column (design-spec 6.4 `scenario:*`). */
export const SCENARIO_METRIC_KEYS = [
  "scenario:conservative",
  "scenario:expected",
  "scenario:strong",
  "scenario:capacity",
] as const;

/**
 * Whether a plan template's number sub-item may name `key` (SDD 5.2 `linked_metric`):
 * one of design-spec 6.4's key metrics that 21 shows (6.12), a single value, a scenario's
 * column, or the cost row of one of `costRowKeys`, the template keys that published
 * validation templates give their starting rows. `scenario_table` is not one: 21 shows a
 * scenario's column, never the whole table.
 */
export function isLinkedMetricKey(
  key: string,
  costRowKeys: ReadonlySet<string>,
): boolean {
  if (key.startsWith(COST_ROW_METRIC_PREFIX)) {
    return costRowKeys.has(key.slice(COST_ROW_METRIC_PREFIX.length));
  }
  return (
    (KEY_METRIC_KEYS as readonly string[]).includes(key) ||
    (SCENARIO_METRIC_KEYS as readonly string[]).includes(key)
  );
}

const inputMetric = (input: NumberInput | undefined): MetricValue =>
  input?.value != null
    ? exact(input.value)
    : missing(input?.fau === "unknown" ? "unknown" : "empty");

const totalMetric = (total: CostTotal): MetricValue =>
  total.amount === null
    ? missing("empty")
    : bounded(total.amount, total.isLowerBound ? "lower" : "exact");

/**
 * The single-value key metrics of design-spec 6.4, shared by 13, 19, 20, 21, 23 and the
 * snapshots of the decision log and plan versions.
 *
 * A metric that cannot be calculated and has none of its inputs entered (no value and not
 * Unknown) is Empty rather than naming the first missing input: a new idea shows "Empty"
 * for every key metric (design-spec 6.1), and "Needs price" once the user starts on it.
 */
export const buildKeyMetrics = (
  input: EconomicsInput,
  result: EconomicsResult,
): KeyMetrics => {
  const touched = (field: EconomicsField) => {
    const entry = input.inputs[field];
    return entry?.value != null || entry?.fau === "unknown";
  };
  const tableTouched = (category: CostCategory) =>
    input.costRows.some((row) => row.category === category && rowTouched(row));
  const price = touched("selling_price");
  const initial = tableTouched("initial");
  const monthly = tableTouched("monthly_fixed");
  const variable = tableTouched("variable");
  const expected = touched("units_expected");
  const emptyUnless = (metric: MetricValue, anyInput: boolean) =>
    metric.value === null && !anyInput ? missing("empty") : metric;

  const expectedColumn = scenarioOf(result, "expected");
  const priceValue = inputValue(input, "selling_price");
  const metrics: Record<KeyMetricKey, MetricValue> & KeyMetrics = {
    initial_cost_total: totalMetric(result.totals.initial),
    monthly_fixed_total: totalMetric(result.totals.monthlyFixed),
    variable_cost_per_unit: result.variableCostPerUnit,
    selling_price: inputMetric(input.inputs.selling_price),
    contribution_margin: emptyUnless(
      result.contributionMargin,
      price || variable,
    ),
    contribution_margin_rate: emptyUnless(
      result.contributionMarginRate,
      price || variable,
    ),
    break_even_units_month: emptyUnless(
      result.breakEvenUnitsMonth,
      price || monthly || variable,
    ),
    break_even_units_day: emptyUnless(
      result.breakEvenUnitsDay,
      price || monthly || variable,
    ),
    break_even_revenue: emptyUnless(
      result.breakEvenRevenue,
      price || monthly || variable,
    ),
    target_margin_units_month: emptyUnless(
      result.targetMarginUnitsMonth,
      price || monthly || variable,
    ),
    expected_revenue: expectedColumn.revenue,
    expected_operating_profit: expectedColumn.operatingProfit,
    payback_months: emptyUnless(
      result.paybackMonths,
      price || monthly || variable || initial || expected,
    ),
    simple_roi: emptyUnless(
      result.simpleRoi,
      price || monthly || variable || initial || expected,
    ),
    capacity_units_day: inputMetric(input.inputs.units_capacity),
    operating_days: exact(
      inputValue(input, "operating_days") ?? DEFAULT_OPERATING_DAYS,
    ),
  };
  for (const row of input.costRows) {
    if (row.templateKey === null) continue;
    metrics[`${COST_ROW_METRIC_PREFIX}${row.templateKey}`] = costRowMetric(
      row,
      priceValue,
    );
  }
  return metrics;
};

const costRowMetric = (row: CostRowInput, price: number | null) => {
  if (!rowHasValue(row))
    return missing(row.fau === "unknown" ? "unknown" : "empty");
  if (row.inputMode === "amount") return exact(row.amount as number);
  return price === null
    ? missing("needs_price")
    : exact(ratio(cents(price) * basisPoints(row.percent as number), MICROS));
};

/**
 * One key metric by its key, from `buildKeyMetrics` or a stored snapshot. A
 * `cost_row:{template key}` without an entry is a template row the user deleted (or one
 * the pinned template does not have): it has no value, so it is Empty (design-spec 6.4).
 * Any other missing key is a caller's mistake and throws.
 */
export const keyMetricOf = (metrics: KeyMetrics, key: string): MetricValue => {
  const metric = metrics[key];
  if (metric !== undefined) return metric;
  if (key.startsWith(COST_ROW_METRIC_PREFIX)) return missing("empty");
  throw new Error(`No key metric ${key}`);
};
