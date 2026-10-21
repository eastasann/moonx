import {
  type AiScope,
  type AmountReading,
  type ImportedAnswer,
  isInScope,
  type MatchedBlock,
  readAmount,
  readChoice,
  readImportedAnswer,
} from "@moonx/domain";
import { formatInputNumber, i18n } from "@moonx/i18n";
import {
  type ClassificationInput,
  type ImportChange,
  type ImportContext,
  longTextSchema,
  moneySchema,
  shortTextSchema,
} from "@moonx/schemas";
import { inputIssueMessage } from "./input-issues";

// What 25 does with a reply between reading it and applying it (design-spec 6.7 ②③):
// where each block goes, and what each question would be written with.

/** A question of the import's target, with its answer now (SDD 5.10 X2). */
export type ContextQuestion = ImportContext["questions"][number];

/** What ② does with a block of the reply. */
export interface BlockChoice {
  /** The question it goes to; null while none is chosen (it is then discarded). */
  questionKey: string | null;
  discarded: boolean;
}

/**
 * Where a block starts (6.7 ②): on its question when it matched one (a duplicate too,
 * until one of them is kept); on none when it is unmatched, hidden or not importable.
 */
export const initialChoice = (block: MatchedBlock): BlockChoice => ({
  questionKey:
    block.status === "matched" || block.status === "duplicate"
      ? block.questionKey
      : null,
  discarded: false,
});

/**
 * How ② shows a block: on its question (`matched`); with another block on the same
 * question (`duplicate`); on none, with why (no ID, an ID the target lacks, outside the
 * scope, hidden); one that cannot be imported; one its chosen question reads nothing in
 * (`emptyFor`); or discarded.
 */
export type RowStatus =
  | "matched"
  | "duplicate"
  | "unmatched"
  | "unknownId"
  | "outOfScope"
  | "hidden"
  | "notImportable"
  | "emptyFor"
  | "discarded";

/** The questions of `context` a block can be put on: importable, shown, in `scope`. */
export function choosable(context: ImportContext, scope: AiScope) {
  return context.questions.filter(
    (question) =>
      question.importable &&
      !question.hidden &&
      isInScope(scope, question.sectionKey, context.sections),
  );
}

/**
 * What `block` writes to `question` (6.7 ①): what matching read when it is the block's
 * own question, else read again for that question's type; null when it reads nothing
 * there.
 */
export function answerFor(
  block: MatchedBlock,
  question: ContextQuestion,
  currency: string | null,
): ImportedAnswer | null {
  if (block.questionKey === question.questionKey && block.answer !== null) {
    return block.answer;
  }
  return readImportedAnswer(block.body, question, currency);
}

/** One block as ② lists it, with what it writes where it now goes. */
export interface Row {
  block: MatchedBlock;
  choice: BlockChoice;
  status: RowStatus;
  question: ContextQuestion | null;
  answer: ImportedAnswer | null;
}

/** The rows of ② for `blocks` and the choices made on them. */
export function rowsOf(
  blocks: readonly MatchedBlock[],
  choices: readonly BlockChoice[],
  context: ImportContext,
  scope: AiScope,
): Row[] {
  const questions = new Map(
    context.questions.map((question) => [question.questionKey, question]),
  );
  const shown = new Set(
    choosable(context, scope).map((question) => question.questionKey),
  );
  const { currency } = context.target;
  const rows = blocks.map((block, index): Row => {
    const choice = choices[index] ?? initialChoice(block);
    const base = { block, choice, question: null, answer: null };
    if (choice.discarded) return { ...base, status: "discarded" };
    const question =
      choice.questionKey === null
        ? undefined
        : questions.get(choice.questionKey);
    if (question === undefined) {
      if (block.status === "not_importable") {
        return { ...base, status: "notImportable" };
      }
      if (block.status === "hidden") return { ...base, status: "hidden" };
      if (block.id === null) return { ...base, status: "unmatched" };
      const named = questions.get(block.id);
      if (named === undefined) return { ...base, status: "unknownId" };
      return {
        ...base,
        status: shown.has(named.questionKey) ? "unmatched" : "outOfScope",
      };
    }
    const answer = answerFor(block, question, currency);
    return answer === null
      ? { ...base, question, status: "emptyFor" }
      : { ...base, question, answer, status: "matched" };
  });
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.status === "matched" && row.question !== null) {
      const key = row.question.questionKey;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return rows.map((row) =>
    row.status === "matched" &&
    (counts.get(row.question?.questionKey ?? "") ?? 0) > 1
      ? { ...row, status: "duplicate" }
      : row,
  );
}

// ---- ③ Review ----

/** One question as ③ holds it, as edited. */
export interface Draft {
  questionKey: string;
  /**
   * The text to write (an amount question's reason) as edited; undefined keeps what the
   * answer holds (an amount block without its reason, 6.7 ①).
   */
  text: string | undefined;
  /** The amount as typed; undefined keeps the answer's. */
  amount: string | undefined;
  /** "Apply this change" (6.7 ③: on at first). */
  apply: boolean;
  /** A validation answer's F/A/U chosen again on ③; null keeps it Unclassified. */
  classification: ClassificationInput | null;
}

/**
 * An amount as its field shows it: grouped as typed elsewhere ("30,000.5") when that
 * reads back as the same amount, else as it is, so a third decimal is not rounded away
 * unseen but refused (6.0.8).
 */
function amountText(reading: AmountReading, currency: string | null): string {
  if (reading.kind === "empty") return "";
  if (reading.kind === "unreadable") return reading.text;
  const shown = formatInputNumber(reading.value);
  const back = readAmount(shown, currency);
  return back.kind === "value" && back.value === reading.value
    ? shown
    : String(reading.value);
}

/** ③'s first draft of what `answer` writes to `questionKey`. */
export const draftOf = (
  questionKey: string,
  answer: ImportedAnswer,
  currency: string | null,
): Draft => ({
  questionKey,
  text: answer.text === undefined ? undefined : (answer.text ?? ""),
  amount:
    answer.amount === undefined
      ? undefined
      : amountText(answer.amount, currency),
  apply: true,
  classification: null,
});

/** A draft held against its question's answer now. */
export interface Reviewed {
  question: ContextQuestion;
  draft: Draft;
  /** What the change writes to the text: null clears it, undefined keeps it. */
  text: string | null | undefined;
  /** What it writes to the amount: null clears it, undefined keeps it. */
  amount: number | null | undefined;
  /** The answer would hold something else: shown as a change, not as unchanged. */
  isChanged: boolean;
  /** Why the text cannot be applied as it is (6.7 ③), under its field. */
  textError: string | null;
  /** Why the amount cannot be applied as it is. */
  amountError: string | null;
  /**
   * Why the question takes no import now (hidden since it was matched, or gone from the
   * template): under the change, whatever parts it writes.
   */
  questionError: string | null;
}

/**
 * `draft` held against `question`'s answer now (6.7 ③): what it writes, whether that
 * changes the answer, and what keeps it from being applied: a length or amount outside
 * 6.0.8 (11's rules), an amount that does not read, a choice that is none of the
 * question's, or a question hidden since it was matched (someone answered 02 OCEAN) or
 * gone from the template (`isGone`: X2 no longer lists it).
 */
export function review(
  question: ContextQuestion,
  draft: Draft,
  currency: string | null,
  isGone = false,
): Reviewed {
  let text: string | null | undefined;
  let textError: string | null = null;
  if (draft.text !== undefined) {
    if (question.options?.kind === "choice") {
      const { choices } = question.options;
      const blank = draft.text.trim() === "";
      const choice = blank ? null : readChoice(draft.text, choices);
      text = blank ? null : (choice ?? draft.text);
      if (!blank && choice === null) {
        textError = i18n.t("ai:import.review.choice", {
          choices: choices.join(", "),
        });
      }
    } else {
      const parsed = (
        question.answerType === "short_text" ? shortTextSchema : longTextSchema
      ).safeParse(draft.text);
      text = parsed.success ? parsed.data : draft.text;
      const issue = parsed.error?.issues[0];
      if (issue !== undefined) textError = inputIssueMessage(issue);
    }
  }
  let amount: number | null | undefined;
  let amountError: string | null = null;
  let amountChanged = false;
  if (draft.amount !== undefined) {
    const reading: AmountReading =
      draft.amount.trim() === ""
        ? { kind: "empty" }
        : readAmount(draft.amount, currency);
    if (reading.kind === "unreadable") {
      amountError = i18n.t("ai:import.review.unreadableAmount");
      amountChanged = true;
    } else {
      amount = reading.kind === "empty" ? null : reading.value;
      const issue =
        amount === null
          ? undefined
          : moneySchema.safeParse(amount).error?.issues[0];
      if (issue !== undefined) amountError = inputIssueMessage(issue);
      amountChanged = amount !== question.current.amount;
    }
  }
  return {
    question,
    draft,
    text,
    amount,
    isChanged:
      (text !== undefined && text !== question.current.text) || amountChanged,
    textError,
    amountError,
    questionError: isGone
      ? i18n.t("ai:import.review.gone")
      : question.hidden
        ? i18n.t("ai:import.review.hidden")
        : null,
  };
}

/** Whether a reviewed change can be applied: nothing wrong with what it writes. */
export const isValid = (reviewed: Reviewed) =>
  reviewed.textError === null &&
  reviewed.amountError === null &&
  reviewed.questionError === null;

/**
 * The change X3 is sent for `reviewed` (SDD 5.10 ImportChange): the parts it writes, the
 * F/A/U chosen on ③ for a validation answer, and the version of the answer shown.
 */
export function changeOf(reviewed: Reviewed): ImportChange {
  const { question, draft, text, amount } = reviewed;
  const classification = draft.classification;
  return {
    questionKey: question.questionKey,
    ...(text === undefined ? {} : { text }),
    ...(amount === undefined ? {} : { amount }),
    ...(classification === null || classification.fau === null
      ? {}
      : { classification }),
    baseLockVersion: question.current.lockVersion,
  };
}
