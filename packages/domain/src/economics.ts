import type {
  CostCategory,
  CostTotal,
  EconomicsResult,
  EconomicsWarning,
  FauState,
  KeyMetrics,
  MetricReason,
  MetricValue,
  ScenarioColumn,
} from "@moonx/schemas";

export const DEFAULT_OPERATING_DAYS = 30;
export const DEFAULT_TARGET_MARGIN = 0.15;

/** A cost row as the calculation sees it. Deleted rows must not be passed in. */
export interface CostRowInput {
  id?: string;
  category: CostCategory;
  templateKey: string | null;
  inputMode: "amount" | "percent_of_price";
  amount: number | null;
  /** 0-1 fraction; only for `percent_of_price` rows of the variable table. */
  percent: number | null;
  fauState: FauState;
}

/** The seven economics inputs (design-spec 6.4). `null` means empty or Unknown. */
export interface EconomicsInputValues {
  sellingPrice: number | null;
  operatingDays: number | null;
  targetMargin: number | null;
  unitsConservative: number | null;
  unitsExpected: number | null;
  unitsStrong: number | null;
  unitsCapacity: number | null;
}

export const EMPTY_ECONOMICS_INPUTS: EconomicsInputValues = {
  sellingPrice: null,
  operatingDays: null,
  targetMargin: null,
  unitsConservative: null,
  unitsExpected: null,
  unitsStrong: null,
  unitsCapacity: null,
};

const exact = (value: number): MetricValue => ({ value, bound: "exact", reason: null });
const missing = (reason: MetricReason): MetricValue => ({ value: null, bound: "exact", reason });
/** A value that is undefined without being "missing": shown as "—" (zero revenue). */
const dash: MetricValue = { value: null, bound: "exact", reason: null };
const bounded = (value: number, bound: "exact" | "lower" | "upper"): MetricValue => ({
  value,
  bound,
  reason: null,
});

/** A row has a value when its amount (or percent for a percent-of-price row) is set. */
function rowValue(row: CostRowInput): number | null {
  return row.category === "variable" && row.inputMode === "percent_of_price"
    ? row.percent
    : row.amount;
}

function tally(rows: CostRowInput[]) {
  let unknownRows = 0;
  let emptyRows = 0;
  let filled = 0;
  for (const row of rows) {
    if (rowValue(row) != null) filled += 1;
    else if (row.fauState === "unknown") unknownRows += 1;
    else emptyRows += 1;
  }
  return { unknownRows, emptyRows, filled };
}

/** Sums an amount table. `amount` is null when no row has a value. */
function amountTotal(rows: CostRowInput[]): CostTotal {
  const { unknownRows, emptyRows, filled } = tally(rows);
  const amount = filled === 0 ? null : rows.reduce((sum, r) => sum + (r.amount ?? 0), 0);
  return { amount, isLowerBound: unknownRows + emptyRows > 0, unknownRows, emptyRows };
}

export function costTableStats(rows: CostRowInput[], category: CostCategory) {
  return tally(rows.filter((r) => r.category === category));
}

/** A percent-of-price row with a value cannot be costed until the price is known. */
function needsPriceForPercentRows(rows: CostRowInput[], price: number | null): boolean {
  return (
    price == null &&
    rows.some(
      (r) => r.category === "variable" && r.inputMode === "percent_of_price" && r.percent != null,
    )
  );
}

/**
 * What a percent-of-price row amounts to at a price (design-spec 6.3 "35% · ₱77.00"). Null while
 * either is unknown.
 */
export function percentOfPriceAmount(percent: number | null, price: number | null): number | null {
  return percent == null || price == null ? null : percent * price;
}

/** Variable cost per sale: amount rows plus percent rows times the price. */
function variableTotal(rows: CostRowInput[], price: number | null): CostTotal {
  const { unknownRows, emptyRows, filled } = tally(rows);
  const needsPrice = needsPriceForPercentRows(rows, price);
  const amount =
    needsPrice || filled === 0
      ? null
      : rows.reduce(
          (sum, r) =>
            sum +
            (r.inputMode === "percent_of_price"
              ? (percentOfPriceAmount(r.percent, price) ?? 0)
              : (r.amount ?? 0)),
          0,
        );
  return { amount, isLowerBound: unknownRows + emptyRows > 0, unknownRows, emptyRows };
}

const SCENARIO_KEYS = ["conservative", "expected", "strong", "capacity"] as const;

/**
 * Computes break-even, scenarios, payback and ROI (design-spec 6.4). Nothing is rounded here;
 * rounding happens only when formatting. Costs with Empty or Unknown rows turn the results into
 * bounds instead of hiding the gap.
 */
export function computeEconomics(
  rows: CostRowInput[],
  inputs: EconomicsInputValues,
): EconomicsResult {
  const price = inputs.sellingPrice;
  const days = inputs.operatingDays ?? DEFAULT_OPERATING_DAYS;
  const margin = inputs.targetMargin ?? DEFAULT_TARGET_MARGIN;

  const initial = amountTotal(rows.filter((r) => r.category === "initial"));
  const monthlyFixed = amountTotal(rows.filter((r) => r.category === "monthly_fixed"));
  const variable = variableTotal(
    rows.filter((r) => r.category === "variable"),
    price,
  );

  const fc = monthlyFixed.amount;
  const costsLower = monthlyFixed.isLowerBound || variable.isLowerBound;

  // A table with no filled row has a variable cost of 0, which is only a lower bound when rows
  // are Empty or Unknown. Percent rows without a price make the cost incomputable.
  const percentNeedsPrice = needsPriceForPercentRows(rows, price);
  const vc: number | null = percentNeedsPrice ? null : (variable.amount ?? 0);
  const variableCostPerUnit: MetricValue =
    vc == null ? missing("needs_price") : bounded(vc, variable.isLowerBound ? "lower" : "exact");

  const cp = price != null && vc != null ? price - vc : null;
  const cpBound = variable.isLowerBound ? "upper" : "exact";
  const contributionMargin: MetricValue =
    cp == null ? missing("needs_price") : bounded(cp, cpBound);
  const contributionMarginRate: MetricValue =
    cp == null || price == null ? missing("needs_price") : bounded(cp / price, cpBound);

  const marginNotPositive = cp != null && cp <= 0;

  const lowerOrExact = costsLower ? "lower" : "exact";
  const variableBound = variable.isLowerBound ? "lower" : "exact";
  let breakEvenMonth: number | null = null;
  let beReason: MetricReason | null = null;
  if (price == null || cp == null) beReason = "needs_price";
  else if (marginNotPositive) beReason = "margin_not_positive";
  else if (fc == null) beReason = "needs_monthly_costs";
  else breakEvenMonth = fc / cp;

  const fromBreakEven = (f: (be: number) => number): MetricValue =>
    breakEvenMonth == null || beReason != null
      ? missing(beReason ?? "empty")
      : bounded(f(breakEvenMonth), lowerOrExact);

  const breakEvenUnitsMonth = fromBreakEven((be) => be);
  const breakEvenUnitsDay = fromBreakEven((be) => be / days);
  const breakEvenRevenue = fromBreakEven((be) => be * (price ?? 0));

  let targetMonth: number | null = null;
  let targetReason: MetricReason | null = beReason;
  if (targetReason == null && price != null && cp != null && fc != null) {
    const denominator = cp - price * margin;
    if (denominator <= 0) targetReason = "target_margin_unreachable";
    else targetMonth = fc / denominator;
  }
  const targetMarginUnitsMonth: MetricValue =
    targetMonth == null ? missing(targetReason ?? "empty") : bounded(targetMonth, lowerOrExact);
  const targetMarginUnitsDay: MetricValue =
    targetMonth == null
      ? missing(targetReason ?? "empty")
      : bounded(targetMonth / days, lowerOrExact);

  const unitsByKey = {
    conservative: inputs.unitsConservative,
    expected: inputs.unitsExpected,
    strong: inputs.unitsStrong,
    capacity: inputs.unitsCapacity,
  };
  const capacity = inputs.unitsCapacity;

  const column = (
    key: ScenarioColumn["key"],
    unitsDay: number | null,
    forceBreakEven: boolean,
  ): ScenarioColumn => {
    if (unitsDay == null) {
      const reason: MetricReason = forceBreakEven ? (beReason ?? "empty") : "empty";
      return {
        key,
        unitsPerDay: missing(reason),
        unitsPerMonth: missing(reason),
        revenue: missing(reason),
        variableCostTotal: missing(reason),
        operatingProfit: missing(reason),
        operatingMargin: missing(reason),
        exceedsCapacity: false,
      };
    }
    const unitsMonth = unitsDay * days;
    const exceeds = capacity != null && key !== "capacity" && unitsDay > capacity;
    const qtyBound = forceBreakEven ? lowerOrExact : "exact";
    const revenue: MetricValue =
      price == null ? missing("needs_price") : bounded(unitsMonth * price, qtyBound);
    const variableCostTotal: MetricValue =
      vc == null
        ? missing("needs_price")
        : bounded(unitsMonth * vc, forceBreakEven ? lowerOrExact : variableBound);
    let operatingProfit: MetricValue;
    if (forceBreakEven) {
      operatingProfit = exact(0);
    } else if (price == null || vc == null) {
      operatingProfit = missing("needs_price");
    } else if (fc == null) {
      operatingProfit = missing("needs_monthly_costs");
    } else {
      operatingProfit = bounded(
        unitsMonth * price - unitsMonth * vc - fc,
        costsLower ? "upper" : "exact",
      );
    }
    let operatingMargin: MetricValue;
    if (operatingProfit.value == null || revenue.value == null) {
      operatingMargin = missing(operatingProfit.reason ?? "empty");
    } else if (revenue.value === 0) {
      operatingMargin = dash;
    } else {
      operatingMargin = bounded(
        operatingProfit.value / revenue.value,
        forceBreakEven ? "exact" : operatingProfit.bound,
      );
    }
    return {
      key,
      unitsPerDay: exact(unitsDay),
      unitsPerMonth: exact(unitsMonth),
      revenue,
      variableCostTotal,
      operatingProfit,
      operatingMargin,
      exceedsCapacity: exceeds,
    };
  };

  const beDay = breakEvenUnitsDay.value;
  const beColumn: ScenarioColumn = column("break_even", beDay, true);
  if (beDay != null) {
    beColumn.unitsPerDay = breakEvenUnitsDay;
    beColumn.unitsPerMonth = breakEvenUnitsMonth;
    beColumn.exceedsCapacity = capacity != null && beDay > capacity;
  }
  const scenarios: ScenarioColumn[] = [
    beColumn,
    ...SCENARIO_KEYS.map((key) => column(key, unitsByKey[key], false)),
  ];

  const expected = scenarios.find((s) => s.key === "expected");
  const expectedProfit = expected?.operatingProfit ?? missing("empty");
  const expectedUnitsMissing = inputs.unitsExpected == null;
  const icAmount = initial.amount;

  let paybackMonths: MetricValue;
  if (expectedUnitsMissing) paybackMonths = missing("needs_expected_sales");
  else if (expectedProfit.value == null) paybackMonths = missing(expectedProfit.reason ?? "empty");
  else if (expectedProfit.value <= 0) paybackMonths = missing("not_recovered");
  else if (icAmount == null) paybackMonths = missing("needs_startup_costs");
  else {
    paybackMonths = bounded(
      icAmount / expectedProfit.value,
      initial.isLowerBound || costsLower ? "lower" : "exact",
    );
  }

  let simpleRoi: MetricValue;
  if (icAmount == null || icAmount === 0) simpleRoi = missing("needs_startup_costs");
  else if (expectedUnitsMissing) simpleRoi = missing("needs_expected_sales");
  else if (expectedProfit.value == null) simpleRoi = missing(expectedProfit.reason ?? "empty");
  else {
    simpleRoi = bounded(
      (expectedProfit.value * 12) / icAmount,
      initial.isLowerBound || costsLower ? "upper" : "exact",
    );
  }

  const warnings: EconomicsWarning[] = [];
  if (marginNotPositive) warnings.push("margin_not_positive");
  if (targetReason === "target_margin_unreachable") warnings.push("target_margin_unreachable");
  if (beColumn.exceedsCapacity) warnings.push("break_even_above_capacity");
  for (const s of scenarios) {
    if (s.exceedsCapacity && s.key !== "break_even") {
      warnings.push(`${s.key as "conservative" | "expected" | "strong"}_exceeds_capacity`);
    }
  }
  const anyIncomplete = [initial, monthlyFixed, variable].some((t) => t.isLowerBound);
  if (anyIncomplete) warnings.push("costs_incomplete");

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
    totals: { initial, monthlyFixed, variablePerUnit: variable },
    defaultsUsed: {
      operatingDays: inputs.operatingDays == null,
      targetMargin: inputs.targetMargin == null,
    },
    warnings,
  };
}

const totalMetric = (total: CostTotal): MetricValue =>
  total.amount == null
    ? missing("empty")
    : bounded(total.amount, total.isLowerBound ? "lower" : "exact");

/**
 * Scalar key metrics shared by the validation home, decision, plan and Pitch Deck (design-spec 6.4
 * "主要指標"). `scenario_table` and `scenario:*` are table-shaped and are read from
 * `EconomicsResult.scenarios`.
 */
export function buildKeyMetrics(
  result: EconomicsResult,
  inputs: EconomicsInputValues,
  rows: CostRowInput[],
): KeyMetrics {
  const expected = result.scenarios.find((s) => s.key === "expected");
  const metrics: KeyMetrics = {
    initial_cost_total: totalMetric(result.totals.initial),
    monthly_fixed_total: totalMetric(result.totals.monthlyFixed),
    variable_cost_per_unit: result.variableCostPerUnit,
    selling_price:
      inputs.sellingPrice == null ? missing("needs_price") : exact(inputs.sellingPrice),
    contribution_margin: result.contributionMargin,
    contribution_margin_rate: result.contributionMarginRate,
    break_even_units_month: result.breakEvenUnitsMonth,
    break_even_units_day: result.breakEvenUnitsDay,
    break_even_revenue: result.breakEvenRevenue,
    target_margin_units_month: result.targetMarginUnitsMonth,
    expected_revenue: expected?.revenue ?? missing("empty"),
    expected_operating_profit: expected?.operatingProfit ?? missing("empty"),
    payback_months: result.paybackMonths,
    simple_roi: result.simpleRoi,
    capacity_units_day:
      inputs.unitsCapacity == null ? missing("empty") : exact(inputs.unitsCapacity),
    operating_days: exact(inputs.operatingDays ?? DEFAULT_OPERATING_DAYS),
  };
  for (const row of rows) {
    if (row.templateKey == null) continue;
    const value = rowValue(row);
    // A percent-of-price row holds a rate; the headline metric is the amount per sale it comes to.
    const perSale = row.category === "variable" && row.inputMode === "percent_of_price";
    const amount = perSale ? percentOfPriceAmount(row.percent, inputs.sellingPrice) : value;
    metrics[`cost_row:${row.templateKey}`] =
      amount != null ? exact(amount) : missing(value == null ? "empty" : "needs_price");
  }
  return metrics;
}
