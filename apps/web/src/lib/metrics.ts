import {
  formatInputNumber,
  formatMoney,
  formatMonths,
  formatPercent,
  formatUnits,
  i18n,
} from "@moonx/i18n";
import type { CostTotal, MetricValue } from "@moonx/schemas";

/**
 * How a calculated number reads (design-spec 6.4「端数」): an amount in whole units or
 * with cents (variable cost and contribution per sale), a count with one decimal, a
 * count as typed (a scenario's daily sales), a rate with one decimal, months.
 */
export type MetricFormat =
  | "money"
  | "moneyCents"
  | "units"
  | "typedUnits"
  | "percent"
  | "months";

/**
 * A result of design-spec 6.4 as the screens show it: the number in its format with its
 * bound ("6.9+", "≤ ₱18,490", "≈ −24.0%"), or, when it cannot be calculated, why
 * ("Needs price", "Empty"; "-" for the margin of no revenue).
 */
export function metricText(
  metric: MetricValue,
  format: MetricFormat,
  currency: string,
): string {
  const { value, bound } = metric;
  if (value === null) {
    return i18n.t(`common:metricReason.${metric.reason ?? "none"}`);
  }
  switch (format) {
    case "money":
      return formatMoney(value, currency, { bound });
    case "moneyCents":
      return formatMoney(value, currency, { bound, cents: true });
    case "units":
      return formatUnits(value, { bound });
    case "typedUnits":
      return formatInputNumber(value);
    case "percent":
      return formatPercent(value, { bound });
    case "months":
      return formatMonths(value, { bound });
  }
}

/**
 * A cost table's total (design-spec 6.3「合計の出し方」): the sum of the rows with an
 * amount, "+" while a row is Empty or Unknown; "Empty" when no row has one.
 */
export function costTotalText(
  total: CostTotal,
  currency: string,
  { cents = false }: { cents?: boolean } = {},
): string {
  if (total.amount === null) return i18n.t("common:metricReason.empty");
  return formatMoney(total.amount, currency, {
    cents,
    bound: total.isLowerBound ? "lower" : "exact",
  });
}

/** What a lower bound leaves out: "3 Unknown, 1 Empty"; null when nothing is. */
export function costGapText(total: CostTotal): string | null {
  const parts = [
    ...(total.unknownRows > 0
      ? [i18n.t("validation:costs.unknownRows", { count: total.unknownRows })]
      : []),
    ...(total.emptyRows > 0
      ? [i18n.t("validation:costs.emptyRows", { count: total.emptyRows })]
      : []),
  ];
  return parts.length === 0
    ? null
    : parts.join(i18n.t("validation:costs.gapSeparator"));
}
