import type { ReplyBlock } from "@moonx/domain";
import { parseAmount, parseChoice } from "@moonx/domain";
import {
  type AiImportApplyBody,
  amountSchema,
  type Classification,
  type ImportChange,
  MAX_LONG_TEXT,
  MAX_SHORT_TEXT,
} from "@moonx/schemas";
import type { FauChange } from "../components/FauControl";
import type { ContextQuestion } from "./ai-exchange";
import { withChoice } from "./questions";

/** What the person can edit on the Review step for one question. */
export interface ReviewDraft {
  /** The text of the answer; the reason of an amount question. */
  text: string;
  /** The amount as typed; empty when the reply has none (the amount is then left as it is). */
  amount: string;
  /** F/A/U set again by hand (validation only); null leaves the answer unclassified. */
  fau: FauChange | null;
  /** The "apply this" checkbox. */
  include: boolean;
}

export const isAmountQuestion = (q: Pick<ContextQuestion, "answerType">) =>
  q.answerType === "amount_with_reason";

export const choicesOf = (q: Pick<ContextQuestion, "options">): string[] =>
  q.options?.kind === "choice" ? q.options.choices : [];

/**
 * The imported content a block starts as. A reply that says nothing for a field leaves the field
 * as it is now, so a question is never cleared by an AI that did not mention it.
 */
export function draftOf(question: ContextQuestion, block: ReplyBlock): ReviewDraft {
  const current = question.current.text ?? "";
  if (isAmountQuestion(question)) {
    return {
      text: block.reason ?? block.text ?? current,
      amount: block.amount === null ? "" : String(block.amount),
      fau: null,
      include: true,
    };
  }
  return { text: block.text ?? current, amount: "", fau: null, include: true };
}

export type ReviewError = "amount" | "choice" | "tooLong";

/** What a draft means for its question. */
export interface Evaluation {
  error: ReviewError | null;
  /** The text to save: trimmed, null when blank, a choice in the spelling of the template. */
  text: string | null;
  /** The amount to save; undefined when the draft has none and the amount stays. */
  amount: number | undefined;
  /** Differs from what the answer holds now (a draft with an error counts as changed). */
  changed: boolean;
}

/** Reads a draft the way X3 will (design-spec 6.7 ③): amounts as numbers, choices as one of the choices. */
export function evaluate(question: ContextQuestion, draft: ReviewDraft): Evaluation {
  let error: ReviewError | null = null;
  let text: string | null = draft.text.trim() === "" ? null : draft.text.trim();
  if (text !== null && question.answerType === "choice") {
    const choice = parseChoice(text, choicesOf(question));
    if (choice === null) error = "choice";
    else text = choice;
  }
  if (
    text !== null &&
    text.length > (question.answerType === "short_text" ? MAX_SHORT_TEXT : MAX_LONG_TEXT)
  ) {
    error = "tooLong";
  }
  let amount: number | undefined;
  if (isAmountQuestion(question) && draft.amount.trim() !== "") {
    const parsed = parseAmount(draft.amount);
    if (parsed === null || !amountSchema.safeParse(parsed).success) error = "amount";
    else amount = parsed;
  }
  const currentText = (question.current.text ?? "").trim();
  const changed =
    error !== null ||
    (text ?? "") !== currentText ||
    (amount !== undefined && amount !== question.current.amount);
  return { error, text, amount, changed };
}

/** The F/A/U the imported answer will have, as the server derives it (design-spec 6.7 ③). */
export function importedClassification(
  question: ContextQuestion,
  draft: ReviewDraft,
  evaluation: Evaluation,
): Classification | null {
  const current = question.current.classification;
  if (current === null) return null;
  return withChoice(
    current,
    evaluation.text !== null,
    draft.fau?.fau ?? null,
    draft.fau?.confidence ?? null,
  );
}

/** Evidence that still exists; only an answer that keeps some can be set to Fact again. */
export function keptEvidence(question: ContextQuestion): number {
  return (question.current.classification?.evidence ?? []).filter((e) => !e.researchLog?.deleted)
    .length;
}

/** One question of the Review step. */
export interface ReviewEntry {
  question: ContextQuestion;
  draft: ReviewDraft;
  evaluation: Evaluation;
}

/** Whether Apply can run: something is checked and nothing checked is unreadable. */
export function applicable(entries: readonly ReviewEntry[]) {
  const chosen = entries.filter((e) => e.draft.include && e.evaluation.changed);
  return {
    count: chosen.length,
    blocked: chosen.some((e) => e.evaluation.error !== null),
  };
}

/**
 * The body of X3 for the checked, changed questions. `baseLockVersion` is the version of the
 * Current the person saw, so an answer someone else saved meanwhile comes back as a conflict.
 */
export function applyBody(
  target: { type: AiImportApplyBody["target"]["type"]; id: string },
  entries: readonly ReviewEntry[],
): AiImportApplyBody {
  const changes = entries
    .filter((e) => e.draft.include && e.evaluation.changed)
    .map(({ question, draft, evaluation }): ImportChange => {
      const change: ImportChange = {
        questionKey: question.questionKey,
        text: evaluation.text,
        baseLockVersion: question.current.lockVersion,
      };
      if (evaluation.amount !== undefined) change.amount = evaluation.amount;
      if (draft.fau && question.current.classification !== null) {
        change.classification =
          draft.fau.fau === "assumption"
            ? { fau: "assumption", confidence: draft.fau.confidence }
            : { fau: draft.fau.fau };
      }
      return change;
    });
  return {
    target: target.type === "self_analysis" ? { type: target.type } : target,
    changes,
  };
}
