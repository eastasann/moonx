/** The template kinds that have questions, mirrored here so the domain package needs no schema types. */
export type QuestionKeyKind = "self_analysis" | "validation" | "business_plan";

/** The leading segment of a question ID per template kind (design-spec 6.6). */
export const QUESTION_KEY_PREFIX: Record<QuestionKeyKind, string> = {
  self_analysis: "SA",
  validation: "V",
  business_plan: "P",
};

/** `{prefix}.{section}.{key}`: capital letters, digits and `_` only, three segments. */
const QUESTION_KEY = /^([A-Z][A-Z0-9_]*)\.([A-Z0-9_]+)\.([A-Z0-9_]+)$/;

/** The parts of a well-formed question ID, or null when the form is wrong. */
export function parseQuestionKey(
  key: string,
): { prefix: string; section: string; id: string } | null {
  const match = QUESTION_KEY.exec(key);
  return match
    ? { prefix: match[1] as string, section: match[2] as string, id: match[3] as string }
    : null;
}

/** Whether `key` has the question ID form of the kind (right prefix, three well-formed segments). */
export function isQuestionKeyOf(kind: QuestionKeyKind, key: string): boolean {
  return parseQuestionKey(key)?.prefix === QUESTION_KEY_PREFIX[kind];
}
