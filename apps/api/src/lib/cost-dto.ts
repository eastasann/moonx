import type { CostCategory, CostItem, EconomicsField, EconomicsInput } from "@moonx/schemas";
import { UNSAVED, versionedOf } from "./dto";
import {
  buildClassification,
  type CostItemRow,
  ECONOMICS_FIELDS,
  type EconomicsInputRow,
  evidenceFor,
} from "./validation-data";
import type { DtoContext } from "./validation-table-dto";

const CATEGORY_ORDER: Record<CostCategory, number> = { initial: 0, monthly_fixed: 1, variable: 2 };

/** Initial, then monthly fixed, then variable costs; each table in its own order (design-spec 6.3). */
export function sortCostItems<T extends Pick<CostItemRow, "category" | "sortOrder">>(
  rows: T[],
): T[] {
  return [...rows].sort(
    (a, b) => CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category] || a.sortOrder - b.sortOrder,
  );
}

/** A percent-of-price row has a value when its percent is set, an amount row when its amount is. */
export const costRowHasValue = (row: Pick<CostItemRow, "inputMode" | "amount" | "percent">) =>
  row.inputMode === "percent_of_price" ? row.percent != null : row.amount != null;

/** Maps a cost row to the CostItem of SDD 5.7, with its classification and evidence. */
export function toCostItem(c: DtoContext, row: CostItemRow): CostItem {
  return {
    ...versionedOf(row, c.refs),
    id: row.id,
    category: row.category,
    templateKey: row.templateKey,
    name: row.name,
    inputMode: row.inputMode,
    amount: row.amount,
    percent: row.percent,
    isLumpSum: row.isLumpSum,
    whyNeeded: row.whyNeeded,
    canReduce: row.canReduce,
    notes: row.notes,
    classification: buildClassification(c.data, {
      hasValue: costRowHasValue(row),
      fau: row.fau,
      confidence: row.confidence,
      links: evidenceFor(c.data, { type: "cost_item", id: row.id, key: null }),
    }),
    sortOrder: row.sortOrder,
    commentCount: c.comments.get(row.id) ?? 0,
  };
}

/** Maps an economics input (or the absence of its row) to the EconomicsInput of SDD 5.7. */
export function toEconomicsInput(
  c: DtoContext,
  fieldKey: EconomicsField,
  row: EconomicsInputRow | undefined,
): EconomicsInput {
  return {
    ...(row ? versionedOf(row, c.refs) : UNSAVED),
    fieldKey,
    value: row?.value ?? null,
    classification: buildClassification(c.data, {
      hasValue: row?.value != null,
      fau: row?.fau ?? null,
      confidence: row?.confidence ?? null,
      links: evidenceFor(c.data, {
        type: "economics_input",
        id: c.data.validationId,
        key: fieldKey,
      }),
    }),
    commentCount: c.comments.get(fieldKey) ?? 0,
  };
}

/** All seven inputs in the order of `ECONOMICS_FIELDS`; fields nobody has entered are unsaved. */
export function toEconomicsInputs(c: DtoContext): EconomicsInput[] {
  return ECONOMICS_FIELDS.map((field) =>
    toEconomicsInput(
      c,
      field,
      c.data.economicsInputs.find((r) => r.fieldKey === field),
    ),
  );
}
