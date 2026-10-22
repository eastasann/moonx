import {
  formatInputNumber,
  formatInputPercent,
  formatMoney,
} from "@moonx/i18n";
import {
  moneySchema,
  numberTextSchema,
  type PlanTableRow,
  percentInputSchema,
  percentToRate,
  type QuestionOptions,
  rateToPercent,
  tableNumberCellSchema,
  tableTextCellSchema,
} from "@moonx/schemas";
import type { z } from "zod";
import { inputIssueMessage } from "./input-issues";

// The cells of a plan's table sub-items (§11, §13, §21, §22. design-spec 6.12・6.0.8): how
// 21 shows them, how they are typed, and the rule each kind of column keeps.

/** A column of a plan's table sub-item (the template's `options.columns`). */
export type TableColumn = Extract<
  QuestionOptions,
  { kind: "table" }
>["columns"][number];

/** A cell as 21 shows it: a % of 0–1 as "40%", money in the currency (6.12). */
export function tableCellText(
  column: TableColumn,
  value: unknown,
  currency: string,
): string {
  if (typeof value === "string") return value;
  if (typeof value !== "number") return "";
  switch (column.type) {
    case "percent":
      return formatInputPercent(value);
    case "money":
      return formatMoney(value, currency, { cents: !Number.isInteger(value) });
    default:
      return formatInputNumber(value);
  }
}

/** A cell as its field shows it to be typed: a % as 40, numbers regrouped. */
export function tableCellInput(column: TableColumn, value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value !== "number") return "";
  return formatInputNumber(
    column.type === "percent" ? rateToPercent(value) : value,
  );
}

const numberCell = numberTextSchema(tableNumberCellSchema);
const moneyCell = numberTextSchema(moneySchema);
const percentCell = numberTextSchema(percentInputSchema);

/**
 * What a typed cell is as the API keeps it (blank is null, a % its 0–1 rate), or why it
 * breaks its column's rule (6.0.8: text 2,000 characters, numbers and money 0 to 1
 * trillion with 2 decimals, a % 0–100).
 */
export function parseTableCell(
  column: TableColumn,
  typed: string,
):
  | { success: true; value: string | number | null }
  | { success: false; error: string } {
  const failed = (error: z.ZodError) => {
    const [issue] = error.issues;
    if (issue === undefined) throw new Error("A failed parse with no issue");
    return { success: false as const, error: inputIssueMessage(issue) };
  };
  if (column.type === "text") {
    const parsed = tableTextCellSchema.safeParse(typed);
    return parsed.success
      ? { success: true, value: parsed.data }
      : failed(parsed.error);
  }
  if (typed.trim() === "") return { success: true, value: null };
  const schema =
    column.type === "money"
      ? moneyCell
      : column.type === "percent"
        ? percentCell
        : numberCell;
  const parsed = schema.safeParse(typed);
  if (!parsed.success) return failed(parsed.error);
  return {
    success: true,
    value: column.type === "percent" ? percentToRate(parsed.data) : parsed.data,
  };
}

/** Whether a kept cell breaks its column's rule: a text the draft copied over its limit. */
export function storedCellError(
  column: TableColumn,
  value: PlanTableRow[string] | undefined,
): string | undefined {
  if (column.type !== "text" || typeof value !== "string") return undefined;
  const [issue] = tableTextCellSchema.safeParse(value).error?.issues ?? [];
  return issue === undefined ? undefined : inputIssueMessage(issue);
}
