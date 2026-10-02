import { isQuestionKeyOf, QUESTION_KEY_PREFIX } from "@moonx/domain";
import type { AnswerType, TemplateKind } from "@moonx/schemas";

/** The section key form the API accepts (AD4): capital letters, digits and `_`. */
export const SECTION_KEY_PATTERN = /^[A-Z0-9_]{1,40}$/;

/** The row key form of a cost default (AD5): lower-case dotted segments. */
export const COST_KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

export const ANSWER_TYPES: readonly AnswerType[] = [
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
  "table",
  "linked_metric",
  "execution_view",
];

/** Whether a question ID has the form of its template kind (design-spec 6.6). */
export const isValidQuestionKey = (kind: TemplateKind, key: string) => isQuestionKeyOf(kind, key);

/** The shape of a question ID of the kind, for help text: `V.SECTION.KEY`. */
export const questionKeyShape = (kind: TemplateKind) => `${QUESTION_KEY_PREFIX[kind]}.SECTION.KEY`;

/** What a new question ID starts with: `V.05.` for section 05 of a validation. */
export const questionKeyStart = (kind: TemplateKind, sectionKey: string) =>
  `${QUESTION_KEY_PREFIX[kind]}.${sectionKey}.`;

/** One entry per non-blank line. */
export const linesOf = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

/** The `Shown when` conditions of a question as rows, and back. */
export interface ConditionRow {
  questionKey: string;
  values: string[];
}

export const conditionRows = (condition: Record<string, string[]> | null): ConditionRow[] =>
  Object.entries(condition ?? {}).map(([questionKey, values]) => ({ questionKey, values }));

/** Rows with a question chosen; an empty list means "always shown" (`null`). */
export function conditionOf(rows: readonly ConditionRow[]): Record<string, string[]> | null {
  const entries = rows.filter((row) => row.questionKey !== "");
  return entries.length === 0
    ? null
    : Object.fromEntries(entries.map((row) => [row.questionKey, row.values]));
}

/** The limits of `copyFrom` (AD4): 50 sources of up to 100 characters. */
export const copyFromTooLong = (lines: readonly string[]) =>
  lines.length > 50 || lines.some((line) => line.length > 100);
