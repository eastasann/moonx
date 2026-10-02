import type { schema } from "@moonx/db";
import {
  amountSchema,
  type Confidence,
  type EconomicsField,
  economicsValueSchemas,
  type Fau,
  rateSchema,
  type UpdateCostItemBody,
} from "@moonx/schemas";
import { ApiError, validationFailed } from "../errors";
import { costRowHasValue } from "./cost-dto";
import { applyClassification, type ClassificationBody } from "./fau-rules";

type CostRow = typeof schema.costItems.$inferSelect;

/** The fields of a V14 request that may change a cost row. */
export interface CostItemPatch {
  name: string;
  inputMode: CostRow["inputMode"];
  amount: number | null;
  percent: number | null;
  isLumpSum: boolean;
  whyNeeded: string | null;
  canReduce: CostRow["canReduce"];
  notes: string | null;
  fau: Fau | null;
  confidence: Confidence | null;
}

const outOfRange = (path: string, message: string) =>
  new ApiError("OUT_OF_RANGE", `${path}: ${message}`, {
    details: [{ path, code: "out_of_range", message }],
  });

/**
 * Applies a V14 body to a cost row and returns the columns it must end up with. Every rule the
 * table's check constraints enforce is decided here first, so no request is rejected by the
 * database:
 *
 * - a percent-of-price row exists only in the variable table (PERCENT_ONLY_FOR_VARIABLE);
 * - amount 0 or more and percent 0 to 1 (OUT_OF_RANGE);
 * - a row holds the value of its input mode only: switching the mode clears the other value, and
 *   a value sent for the inactive mode is a validation failure;
 * - an Unknown number holds no value, and typing a value into an Unknown row makes it
 *   Unclassified (design-spec 6.0.3).
 */
export function planCostUpdate(
  row: CostRow,
  body: Omit<UpdateCostItemBody, "lockVersion" | "force">,
  activeEvidenceCount: number,
): CostItemPatch {
  const inputMode = body.inputMode ?? row.inputMode;
  if (body.amount != null && !amountSchema.safeParse(body.amount).success) {
    throw outOfRange("amount", "Must be between 0 and 1,000,000,000,000");
  }
  if (body.percent != null && !rateSchema.safeParse(body.percent).success) {
    throw outOfRange("percent", "Must be between 0 and 1");
  }
  if (row.category !== "variable" && (inputMode === "percent_of_price" || body.percent != null)) {
    throw new ApiError(
      "PERCENT_ONLY_FOR_VARIABLE",
      "A percent of price is only for variable costs",
    );
  }
  if (inputMode === "amount" && body.percent != null) {
    throw validationFailed([
      {
        path: "percent",
        code: "invalid_value",
        message: "Percent needs inputMode percent_of_price",
      },
    ]);
  }
  if (inputMode === "percent_of_price" && body.amount != null) {
    throw validationFailed([
      { path: "amount", code: "invalid_value", message: "Amount needs inputMode amount" },
    ]);
  }

  let amount = body.amount !== undefined ? body.amount : row.amount;
  let percent = body.percent !== undefined ? body.percent : row.percent;
  if (inputMode === "amount") percent = null;
  else amount = null;

  const hasValue = costRowHasValue({ inputMode, amount, percent });
  const setsValue = hasValue && (body.amount != null || body.percent != null);
  const dropUnknown = row.fau === "unknown" && setsValue && body.classification === undefined;
  const change = applyClassification(
    {
      current: dropUnknown
        ? { fau: null, confidence: null }
        : { fau: row.fau, confidence: row.confidence },
      hasValue,
      input: body.classification as ClassificationBody | undefined,
      activeEvidenceCount,
    },
    true,
  );
  if (change.clearValue) {
    amount = null;
    percent = null;
  }
  return {
    name: body.name ?? row.name,
    inputMode,
    amount,
    percent,
    isLumpSum: body.isLumpSum ?? row.isLumpSum,
    whyNeeded: body.whyNeeded !== undefined ? body.whyNeeded : row.whyNeeded,
    canReduce: body.canReduce !== undefined ? body.canReduce : row.canReduce,
    notes: body.notes !== undefined ? body.notes : row.notes,
    fau: change.fau,
    confidence: change.confidence,
  };
}

type EconomicsRow = typeof schema.economicsInputs.$inferSelect;

/** The body of a V16 request. */
export interface EconomicsPatch {
  value: number | null;
  fau: Fau | null;
  confidence: Confidence | null;
}

/**
 * The V16 rules: the range of the field (OUT_OF_RANGE, design-spec 6.4), then F/A/U. An Unknown
 * input holds no value, and entering a value in an Unknown input makes it Unclassified.
 */
export function planEconomicsUpdate(
  field: EconomicsField,
  row: EconomicsRow | null,
  body: { value: number | null; classification?: ClassificationBody },
  activeEvidenceCount: number,
): EconomicsPatch {
  if (body.value != null) {
    const parsed = economicsValueSchemas[field].safeParse(body.value);
    if (!parsed.success) {
      throw outOfRange("value", parsed.error.issues[0]?.message ?? "Out of range");
    }
  }
  const dropUnknown =
    row?.fau === "unknown" && body.value != null && body.classification === undefined;
  const change = applyClassification(
    {
      current: dropUnknown
        ? { fau: null, confidence: null }
        : { fau: row?.fau ?? null, confidence: row?.confidence ?? null },
      hasValue: body.value != null,
      input: body.classification,
      activeEvidenceCount,
    },
    true,
  );
  return {
    value: change.clearValue ? null : body.value,
    fau: change.fau,
    confidence: change.confidence,
  };
}
