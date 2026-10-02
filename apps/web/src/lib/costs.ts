import type { CostRowInput, EconomicsInputValues } from "@moonx/domain";
import { formatMoney } from "@moonx/i18n";
import type {
  Classification,
  CostCategory,
  CostItem,
  CostTotal,
  EconomicsField,
  EconomicsInput,
} from "@moonx/schemas";
import { amountSchema, rateSchema } from "@moonx/schemas";
import { queryOptions } from "@tanstack/react-query";
import type { TFunction } from "i18next";
import { api, call } from "./api";
import { hasText, withText } from "./questions";
import { validationKey } from "./validation-keys";

/** The three cost tables in screen order (design-spec 6.3). */
export const COST_CATEGORIES: readonly CostCategory[] = ["initial", "monthly_fixed", "variable"];

/** Catalog keys of the table names and what a table's fields are, kept in tables for the catalog test. */
export const COST_TABLE_KEYS = {
  initial: "costs:tables.initial",
  monthly_fixed: "costs:tables.monthly_fixed",
  variable: "costs:tables.variable",
} as const satisfies Record<CostCategory, string>;

export const CAN_REDUCE_KEYS = {
  yes: "costs:canReduce.yes",
  partly: "costs:canReduce.partly",
  no: "costs:canReduce.no",
} as const;

/** Under the validation's key, so every screen that reads or changes it refreshes with one invalidation. */
export const costsKey = (validationId: string) =>
  [...validationKey(validationId), "costs"] as const;

const fetchCosts = (validationId: string) =>
  call(api().api.v1.validations({ validationId }).costs.get());

/** V12: the cost rows and the economics inputs, which 17 reads for the price. */
export type CostsData = Awaited<ReturnType<typeof fetchCosts>>;

export const costsQuery = (validationId: string) =>
  queryOptions({ queryKey: costsKey(validationId), queryFn: () => fetchCosts(validationId) });

/** A problem with a typed value. The row is not saved while it stands (design-spec 6.0.6). */
export type FieldProblem = "required" | "range";

/** What the person sees and has typed in one row, which may be ahead of the server's copy. */
export interface CostDraft {
  name: string;
  inputMode: CostItem["inputMode"];
  amount: number | null;
  percent: number | null;
  isLumpSum: boolean;
  whyNeeded: string;
  canReduce: CostItem["canReduce"];
  notes: string;
  classification: Classification;
  /** Changes when the fields must show a value they did not type (adopted copy, Unknown, new mode). */
  revision: number;
  problems: Partial<Record<"name" | "amount" | "percent", FieldProblem>>;
}

export function draftOfItem(item: CostItem, revision = 0): CostDraft {
  return {
    name: item.name,
    inputMode: item.inputMode,
    amount: item.amount,
    percent: item.percent,
    isLumpSum: item.isLumpSum,
    whyNeeded: item.whyNeeded ?? "",
    canReduce: item.canReduce,
    notes: item.notes ?? "",
    classification: item.classification,
    revision,
    problems: {},
  };
}

/** The cost row as the calculation sees it, from what the screen shows. */
export function costRowInput(
  item: Pick<CostItem, "id" | "category" | "templateKey">,
  draft: CostDraft,
): CostRowInput {
  return {
    id: item.id,
    category: item.category,
    templateKey: item.templateKey,
    inputMode: draft.inputMode,
    amount: draft.amount,
    percent: draft.percent,
    fauState: draft.classification.state,
  };
}

/** The value a row holds in its current input mode. */
export const draftValue = (draft: Pick<CostDraft, "inputMode" | "amount" | "percent">) =>
  draft.inputMode === "percent_of_price" ? draft.percent : draft.amount;

/**
 * The classification after a number was typed or cleared, following the rules of the API
 * (design-spec 6.0.3): no value ends Fact and Assumption, and a value typed into an Unknown number
 * makes it Unclassified.
 */
export function withNumber(prev: Classification, hasValue: boolean): Classification {
  const base = prev.fau === "unknown" && hasValue ? { ...prev, fau: null, confidence: null } : prev;
  return withText(base, hasValue ? "1" : "");
}

/** The range of an amount (design-spec 6.3): 0 to 1 trillion. */
export const amountProblem = (value: number): FieldProblem | null =>
  amountSchema.safeParse(value).success ? null : "range";

/** The range of a percent of price: 0 to 100 percent, as the fraction 0 to 1. */
export const percentProblem = (value: number): FieldProblem | null =>
  rateSchema.safeParse(value).success ? null : "range";

export const nameProblem = (name: string): FieldProblem | null =>
  hasText(name) ? null : "required";

/** The rows of a table in the order the screen shows them. */
export const rowsOf = (items: readonly CostItem[], category: CostCategory) =>
  items.filter((item) => item.category === category);

/** The seven economics inputs as the calculation takes them. */
export function economicsValues(inputs: readonly EconomicsInput[]): EconomicsInputValues {
  const valueFor = (field: EconomicsField) =>
    inputs.find((input) => input.fieldKey === field)?.value ?? null;
  return {
    sellingPrice: valueFor("selling_price"),
    operatingDays: valueFor("operating_days"),
    targetMargin: valueFor("target_margin"),
    unitsConservative: valueFor("units_conservative"),
    unitsExpected: valueFor("units_expected"),
    unitsStrong: valueFor("units_strong"),
    unitsCapacity: valueFor("units_capacity"),
  };
}

/**
 * Where a `?row=` value points: the id of a row, or a template key such as `initial.permits`
 * (checks and plans link by key, SDD 4).
 */
export function findRow(items: readonly CostItem[], wanted: string | undefined): CostItem | null {
  if (!wanted) return null;
  return items.find((item) => item.id === wanted || item.templateKey === wanted) ?? null;
}

/**
 * A table's total as text (design-spec 6.3 "合計の出し方"): "₱450,000+" while rows are Empty or
 * Unknown, with the breakdown "3 Unknown, 1 Empty"; "Empty" while no row has a value.
 */
export function totalView(
  t: TFunction,
  total: CostTotal,
  currency: string,
): { value: string; breakdown: string | null } {
  const value =
    total.amount === null
      ? t("costs:totals.empty")
      : formatMoney(total.amount, currency, { bound: total.isLowerBound ? "lower" : "exact" });
  return { value, breakdown: breakdownText(t, total) };
}

/** "3 Unknown, 1 Empty", or null when no row is missing. */
export function breakdownText(
  t: TFunction,
  { unknownRows, emptyRows }: Pick<CostTotal, "unknownRows" | "emptyRows">,
): string | null {
  if (unknownRows > 0 && emptyRows > 0) {
    return t("costs:totals.breakdown.both", { unknown: unknownRows, empty: emptyRows });
  }
  if (unknownRows > 0) return t("costs:totals.breakdown.unknown", { unknown: unknownRows });
  if (emptyRows > 0) return t("costs:totals.breakdown.empty", { empty: emptyRows });
  return null;
}

/**
 * The rows with `item` one place up or down within its table, or null at either end. The rows of
 * the other tables keep their places, because the server lists the three tables in one array.
 */
export function movedRows(
  items: readonly CostItem[],
  item: CostItem,
  direction: "up" | "down",
): CostItem[] | null {
  const table = items.filter((candidate) => candidate.category === item.category);
  const from = table.findIndex((candidate) => candidate.id === item.id);
  const to = from + (direction === "up" ? -1 : 1);
  if (from < 0 || to < 0 || to >= table.length) return null;
  const reordered = [...table];
  const [row] = reordered.splice(from, 1);
  reordered.splice(to, 0, row as CostItem);
  let next = 0;
  return items.map((candidate) =>
    candidate.category === item.category ? (reordered[next++] as CostItem) : candidate,
  );
}
