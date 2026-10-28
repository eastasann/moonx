import { computeEconomics, fauState } from "@moonx/domain";
import type {
  CanReduce,
  ClassificationInput,
  Confidence,
  CostInputMode,
  CostItem,
  EconomicsField,
  EconomicsInput as EconomicsInputRow,
  EconomicsResult,
  Fau,
  FauState,
} from "@moonx/schemas";
import { useMemo } from "react";
import type { AutosaveState, SaveFields } from "../lib/autosave";
import { useAutosaveState } from "../lib/autosave-react";
import { countingEvidence } from "../lib/evidence";

// The rows of 17 and the numbers of 18 as the screens show them while they are typed in:
// what was saved under what waits to be saved, and the results of design-spec 6.4
// calculated again from them at once (6.3「金額・%・文章を入れる」: the totals and 18's
// results change as it is typed).

/** The page's save of a cost row (design-spec 6.0.2's item "1つの行"). */
export const costKey = (costItemId: string) => `cost_item:${costItemId}`;

/** The page's save of a number of 18 (6.0.2's item "1つの数字"). */
export const numberKey = (validationId: string, field: EconomicsField) =>
  `economics_input:${validationId}:${field}`;

/** A cost row with what waits to be saved over it. */
export interface CostRowView {
  row: CostItem;
  name: string;
  inputMode: CostInputMode;
  amount: number | null;
  /** A 0 to 1 rate of the price. */
  percent: number | null;
  isLumpSum: boolean;
  whyNeeded: string | null;
  canReduce: CanReduce | null;
  notes: string | null;
  fau: Fau | null;
  confidence: Confidence | null;
  state: FauState;
  /** The evidence that counts (6.0.3). */
  counted: number;
  hasValue: boolean;
}

const has = (fields: SaveFields, field: string) => Object.hasOwn(fields, field);

/**
 * A save of a cost row or a number as the API takes it (SDD 5.7 V14・V16 refuse a value
 * sent with Unknown). Unknown is always chosen with the value cleared in the same change,
 * so a value waiting with an Unknown was typed after it: the value stands, and the item
 * is Unclassified, as the API makes an item typed into once its Unknown is saved.
 */
export function settleUnknown(
  fields: SaveFields,
  valueFields: readonly string[],
): SaveFields {
  const classification = fields.classification as
    | ClassificationInput
    | undefined;
  return classification?.fau === "unknown" &&
    valueFields.some((field) => fields[field] != null)
    ? { ...fields, classification: { fau: null, confidence: null } }
    : fields;
}

/**
 * Whether an Unknown waits to be saved: the saved value is then not the item's any more
 * (Unknown clears it), even where the null sent with the Unknown was taken back by a
 * keystroke that broke its rule.
 */
export const unknownWaits = (fields: SaveFields) =>
  (fields.classification as ClassificationInput | undefined)?.fau === "unknown";

/**
 * The F/A/U an item shows: a value waiting over an Unknown (saved, or waiting before it)
 * takes it off, as the save will (`settleUnknown`, and the API for a saved one).
 */
const shownFau = (
  classification: { fau: Fau | null; confidence: Confidence | null },
  value: number | null,
) =>
  classification.fau === "unknown" && value !== null
    ? { fau: null, confidence: null }
    : classification;

/** The classification a save sends, else the saved one. */
function classificationOf(
  saved: { fau: Fau | null; confidence: Confidence | null },
  unsaved: SaveFields,
) {
  if (!has(unsaved, "classification")) return saved;
  const sent = unsaved.classification as ClassificationInput;
  return { fau: sent.fau, confidence: sent.confidence ?? null };
}

/**
 * A cost row as it shows: the saved row under the fields waiting to be saved. A switch
 * of the input mode drops the value of the mode left (SDD 5.7 V14), and Unknown holds no
 * value (6.0.3).
 */
export function costRowView(
  row: CostItem,
  unsaved: SaveFields = {},
): CostRowView {
  const field = <T>(name: string, saved: T): T =>
    has(unsaved, name) ? (unsaved[name] as T) : saved;
  const inputMode = field("inputMode", row.inputMode);
  const cleared = inputMode !== row.inputMode || unknownWaits(unsaved);
  const amount = field("amount", cleared ? null : row.amount);
  const percent = field("percent", cleared ? null : row.percent);
  const value = inputMode === "amount" ? amount : percent;
  const { fau, confidence } = shownFau(
    classificationOf(row.classification, unsaved),
    value,
  );
  const hasValue = fau !== "unknown" && value !== null;
  const counted = countingEvidence(row.classification.evidence).length;
  return {
    row,
    name: field("name", row.name),
    inputMode,
    amount: inputMode === "amount" && hasValue ? amount : null,
    percent: inputMode === "percent_of_price" && hasValue ? percent : null,
    isLumpSum: field("isLumpSum", row.isLumpSum),
    whyNeeded: field("whyNeeded", row.whyNeeded),
    canReduce: field("canReduce", row.canReduce),
    notes: field("notes", row.notes),
    fau,
    confidence: fau === "assumption" ? confidence : null,
    state: fauState({
      hasValue,
      fau,
      confidence,
      activeEvidenceCount: counted,
    }),
    counted,
    hasValue,
  };
}

/** A number of 18 with what waits to be saved over it. */
export interface NumberView {
  input: EconomicsInputRow;
  value: number | null;
  fau: Fau | null;
  confidence: Confidence | null;
  state: FauState;
  counted: number;
  hasValue: boolean;
}

/** A number of 18 as it shows: the saved one under the fields waiting to be saved. */
export function numberView(
  input: EconomicsInputRow,
  unsaved: SaveFields = {},
): NumberView {
  const value = has(unsaved, "value")
    ? (unsaved.value as number | null)
    : unknownWaits(unsaved)
      ? null
      : input.value;
  const { fau, confidence } = shownFau(
    classificationOf(input.classification, unsaved),
    value,
  );
  const hasValue = fau !== "unknown" && value !== null;
  const counted = countingEvidence(input.classification.evidence).length;
  return {
    input,
    value: hasValue ? value : null,
    fau,
    confidence: fau === "assumption" ? confidence : null,
    state: fauState({
      hasValue,
      fau,
      confidence,
      activeEvidenceCount: counted,
    }),
    counted,
    hasValue,
  };
}

/** The results of design-spec 6.4 for the rows and numbers as they show. */
export function economicsOf(
  rows: readonly CostRowView[],
  numbers: readonly NumberView[],
): EconomicsResult {
  return computeEconomics({
    costRows: rows.map((view) => ({
      category: view.row.category,
      templateKey: view.row.templateKey,
      inputMode: view.inputMode,
      amount: view.amount,
      percent: view.percent,
      fau: view.fau,
    })),
    inputs: Object.fromEntries(
      numbers.map((view) => [
        view.input.fieldKey,
        { value: view.value, fau: view.fau },
      ]),
    ),
  });
}

const unsavedOf = (state: AutosaveState | null, key: string): SaveFields =>
  state?.items.get(key)?.unsaved ?? {};

/**
 * 17's rows and 18's numbers as they show, and the results calculated from them, kept
 * up to date with every keystroke that passes its rule.
 */
export function useWorksheet(
  validationId: string,
  costItems: readonly CostItem[],
  inputs: readonly EconomicsInputRow[],
) {
  const saves = useAutosaveState();
  return useMemo(() => {
    const rows = costItems.map((row) =>
      costRowView(row, unsavedOf(saves, costKey(row.id))),
    );
    const numbers = inputs.map((input) =>
      numberView(
        input,
        unsavedOf(saves, numberKey(validationId, input.fieldKey)),
      ),
    );
    return { rows, numbers, result: economicsOf(rows, numbers) };
  }, [saves, validationId, costItems, inputs]);
}
