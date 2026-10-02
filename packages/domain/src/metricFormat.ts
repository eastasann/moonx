import { formatMoney, formatMonths, formatPercent, formatUnits } from "@moonx/i18n";
import type { MetricValue } from "@moonx/schemas";

/** The text for a metric that has no value; the reason is shown separately by the screens. */
const NO_METRIC_VALUE = "—";

type Kind = "money" | "money2" | "percent" | "units" | "months";

const KIND: Record<string, Kind> = {
  initial_cost_total: "money",
  monthly_fixed_total: "money",
  selling_price: "money",
  break_even_revenue: "money",
  expected_revenue: "money",
  expected_operating_profit: "money",
  variable_cost_per_unit: "money2",
  contribution_margin: "money2",
  contribution_margin_rate: "percent",
  simple_roi: "percent",
  break_even_units_month: "units",
  break_even_units_day: "units",
  target_margin_units_month: "units",
  capacity_units_day: "units",
  operating_days: "units",
  payback_months: "months",
};

/**
 * A key metric (design-spec 6.4 "主要指標") as text: money in the workspace currency (two decimals
 * for per-sale amounts), rates as percentages, counts and months to one decimal, with the bound
 * mark ("+", "≤"). `cost_row:*` keys are amounts. Unknown keys read as plain numbers.
 */
export function formatKeyMetric(key: string, metric: MetricValue | undefined, currency: string) {
  if (!metric || metric.value == null) return NO_METRIC_VALUE;
  const kind: Kind = key.startsWith("cost_row:") ? "money" : (KIND[key] ?? "units");
  const options = { bound: metric.bound };
  switch (kind) {
    case "money":
      return formatMoney(metric.value, currency, options);
    case "money2":
      return formatMoney(metric.value, currency, { ...options, decimals: 2 });
    case "percent":
      return formatPercent(metric.value, options);
    case "months":
      return formatMonths(metric.value, options);
    case "units":
      return formatUnits(metric.value, options);
  }
}
