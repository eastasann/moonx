import type { EconomicsInputValues } from "@moonx/domain";
import { formatMoney, formatMonths, formatPercent, formatUnits } from "@moonx/i18n";
import {
  type EconomicsField,
  type EconomicsWarning,
  economicsFieldSchema,
  economicsValueSchemas,
  type MetricValue,
} from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import { api, call } from "./api";
import type { FieldProblem } from "./costs";
import { validationKey } from "./validation-keys";

/** Under the validation's key, so one invalidation refreshes 17, 18 and the home together. */
export const economicsKey = (validationId: string) =>
  [...validationKey(validationId), "economics"] as const;

const fetchEconomics = (validationId: string) =>
  call(api().api.v1.validations({ validationId }).economics.get());

/** V15: the seven inputs, the `V.08.WORTH` answer and the cost rows. */
export type EconomicsData = Awaited<ReturnType<typeof fetchEconomics>>;

export const economicsQuery = (validationId: string) =>
  queryOptions({
    queryKey: economicsKey(validationId),
    queryFn: () => fetchEconomics(validationId),
  });

/** The inputs in screen order: price, days, margin, then the four daily sales. */
export const ECONOMICS_FIELDS: readonly EconomicsField[] = economicsFieldSchema.options;

/** Which entry of the calculation's input each field fills. */
export const VALUE_KEY: Record<EconomicsField, keyof EconomicsInputValues> = {
  selling_price: "sellingPrice",
  operating_days: "operatingDays",
  target_margin: "targetMargin",
  units_conservative: "unitsConservative",
  units_expected: "unitsExpected",
  units_strong: "unitsStrong",
  units_capacity: "unitsCapacity",
};

/** How a field's number is typed and shown. */
export type FieldKind = "money" | "days" | "percent" | "units";

export const FIELD_KIND: Record<EconomicsField, FieldKind> = {
  selling_price: "money",
  operating_days: "days",
  target_margin: "percent",
  units_conservative: "units",
  units_expected: "units",
  units_strong: "units",
  units_capacity: "units",
};

/** Where each catalog text of the screen is looked up (kept in tables for the catalog test). */
export const ECONOMICS_KEYS = {
  field: {
    selling_price: "validation:economicsFields.selling_price",
    operating_days: "validation:economicsFields.operating_days",
    target_margin: "validation:economicsFields.target_margin",
    units_conservative: "validation:economicsFields.units_conservative",
    units_expected: "validation:economicsFields.units_expected",
    units_strong: "validation:economicsFields.units_strong",
    units_capacity: "validation:economicsFields.units_capacity",
  },
  problem: {
    selling_price: "economics:range.selling_price",
    operating_days: "economics:range.operating_days",
    target_margin: "economics:range.target_margin",
    units_conservative: "economics:range.units",
    units_expected: "economics:range.units",
    units_strong: "economics:range.units",
    units_capacity: "economics:range.units",
  },
  warning: {
    margin_not_positive: "validation:economics.warning.margin_not_positive",
    target_margin_unreachable: "validation:economics.warning.target_margin_unreachable",
    break_even_above_capacity: "validation:economics.warning.break_even_above_capacity",
    conservative_exceeds_capacity: "validation:economics.warning.conservative_exceeds_capacity",
    expected_exceeds_capacity: "validation:economics.warning.expected_exceeds_capacity",
    strong_exceeds_capacity: "validation:economics.warning.strong_exceeds_capacity",
    costs_incomplete: "validation:economics.warning.costs_incomplete",
  },
  scenario: {
    break_even: "economics:scenario.break_even",
    conservative: "economics:scenario.conservative",
    expected: "economics:scenario.expected",
    strong: "economics:scenario.strong",
    capacity: "economics:scenario.capacity",
  },
  scenarioFull: {
    break_even: "common:scenario.break_even",
    conservative: "common:scenario.conservative",
    expected: "common:scenario.expected",
    strong: "common:scenario.strong",
    capacity: "common:scenario.capacity",
  },
} as const satisfies {
  field: Record<EconomicsField, string>;
  problem: Record<EconomicsField, string>;
  warning: Record<EconomicsWarning, string>;
  scenario: Record<string, string>;
  scenarioFull: Record<string, string>;
};

/** The range of an input (design-spec 6.4 "入力"), from the same schema the API checks. */
export const inputProblem = (field: EconomicsField, value: number): FieldProblem | null =>
  economicsValueSchemas[field].safeParse(value).success ? null : "range";

/** The number formats of the result pane. */
export type MetricKind = "money" | "money2" | "units" | "percent" | "months";

/** A metric as text with its bound mark, or null when it has no value (the reason is shown instead). */
export function formatMetric(
  kind: MetricKind,
  metric: MetricValue,
  currency: string,
): string | null {
  if (metric.value == null) return null;
  const options = { bound: metric.bound };
  switch (kind) {
    case "money":
      return formatMoney(metric.value, currency, options);
    case "money2":
      return formatMoney(metric.value, currency, { ...options, decimals: 2 });
    case "units":
      return formatUnits(metric.value, options);
    case "percent":
      return formatPercent(metric.value, options);
    case "months":
      return formatMonths(metric.value, options);
  }
}
