import type {
  Confidence,
  ExecutionType,
  PlanItemMark,
  PlanReferenceSpec,
  PlanTableRow,
  QuestionOptions,
  TemplateQuestion,
} from "@moonx/schemas";
import { hasText } from "./fau";

/** A plan sub-item with what plan templates add to a question (SDD 6.3 末尾). */
export interface PlanQuestion extends TemplateQuestion {
  /** What the draft copies into it: validation question IDs and pseudo keys. */
  copyFrom: readonly string[] | null;
  /** What its item shows beside it. */
  reference: readonly PlanReferenceSpec[] | null;
}

/** A plan answer's content, as the history and a version keep it. */
export interface PlanAnswerContent {
  text: string | null;
  rows: PlanTableRow[] | null;
}

/**
 * The values §22's Probability and Impact cells take: the original's choices (SDD 6.5
 * 「選択肢の値は原本を踏襲する」), stored as the cell's text.
 */
const LEVEL_VALUES: Record<Confidence, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

/**
 * One piece of evidence on an assumption, as §21's Evidence column names it: a URL with
 * its note, or a research log entry that is not deleted. Evidence citing a deleted entry
 * has neither.
 */
export interface DraftEvidence {
  url: string | null;
  note: string | null;
  log: { observedOn: string | null; topic: string } | null;
}

/** An assumption of 16, as the draft copies it into §21. */
export interface DraftAssumption {
  statement: string;
  whyBelieve: string | null;
  evidence: readonly DraftEvidence[];
  evidenceNote: string | null;
  disproveCondition: string | null;
}

/** A risk of 16, as the draft copies it into §22. */
export interface DraftRisk {
  statement: string;
  probability: Confidence | null;
  impact: Confidence | null;
  mitigation: string | null;
}

/** What the draft (M5) copies from, as it stands when the plan is made. */
export interface DraftSource {
  oneLineConcept: string;
  proposedSolution: string | null;
  /**
   * The text of the validation answer `questionKey`, or null when it is blank, hidden by
   * its display condition or not in the validation's pinned version.
   */
  answerText(questionKey: string): string | null;
  /** In their order on 16. */
  assumptions: readonly DraftAssumption[];
  /** In their order on 16. */
  risks: readonly DraftRisk[];
}

/**
 * §21's Evidence cell for an assumption (design-spec 6.12): each piece in the order
 * attached, a URL as "{url}" or "{url} ({note})" and a research log entry as "{date}
 * {topic}" (or the topic without a date), then the free text, joined by "; ". Null when
 * there is nothing to write.
 */
export const assumptionEvidenceText = (
  evidence: readonly DraftEvidence[],
  note: string | null,
): string | null => {
  const parts = [
    ...evidence.map((piece) => {
      if (piece.url !== null)
        return piece.note !== null && hasText(piece.note)
          ? `${piece.url} (${piece.note})`
          : piece.url;
      if (piece.log === null) return null;
      return piece.log.observedOn === null
        ? piece.log.topic
        : `${piece.log.observedOn} ${piece.log.topic}`;
    }),
    note,
  ].filter((part): part is string => part !== null && hasText(part));
  return parts.length === 0 ? null : parts.join("; ");
};

/**
 * What the draft copies into a sub-item from `source` (SDD 6.3 `copy_from`): the texts
 * of its sources in order, blank ones skipped, joined by a blank line; or, for
 * `LIST.ASSUMPTIONS` and `LIST.RISKS`, the rows of 16's list in the columns of §21 and
 * §22 (Trigger / Indicator left empty). Null when there is nothing to copy. A text over
 * the sub-item's limit is copied whole (design-spec 6.0.8).
 */
export const draftAnswer = (
  copyFrom: readonly string[],
  source: DraftSource,
): PlanAnswerContent | null => {
  if (copyFrom.includes("LIST.ASSUMPTIONS")) {
    const rows = source.assumptions.map((assumption) => ({
      assumption: assumption.statement,
      why_we_believe_it: assumption.whyBelieve,
      evidence: assumptionEvidenceText(
        assumption.evidence,
        assumption.evidenceNote,
      ),
      what_would_disprove_it: assumption.disproveCondition,
    }));
    return rows.length === 0 ? null : { text: null, rows };
  }
  if (copyFrom.includes("LIST.RISKS")) {
    const rows = source.risks.map((risk) => ({
      risk: risk.statement,
      probability:
        risk.probability === null ? null : LEVEL_VALUES[risk.probability],
      impact: risk.impact === null ? null : LEVEL_VALUES[risk.impact],
      mitigation: risk.mitigation,
      trigger_indicator: null,
    }));
    return rows.length === 0 ? null : { text: null, rows };
  }
  const texts = copyFrom
    .map((key) => {
      if (key === "IDEA.ONE_LINE_CONCEPT") return source.oneLineConcept;
      if (key === "IDEA.PROPOSED_SOLUTION") return source.proposedSolution;
      return source.answerText(key);
    })
    .filter((text): text is string => text !== null && hasText(text));
  return texts.length === 0 ? null : { text: texts.join("\n\n"), rows: null };
};

/** What a plan item's progress reads: its answers and its execution items by type. */
export interface PlanItemContent {
  answers: ReadonlyMap<string, PlanAnswerContent>;
  /** Items not deleted, per type. */
  executionCounts: ReadonlyMap<ExecutionType, number>;
}

/**
 * How many sub-items of a plan item are filled, of those counted (design-spec 6.12): a
 * text when it is not blank, a table with a row, an execution view with an item. The
 * number sub-items show the validation's numbers and are not counted.
 */
export const planItemProgress = (
  questions: readonly TemplateQuestion[],
  content: PlanItemContent,
): { filled: number; total: number } => {
  let filled = 0;
  let total = 0;
  for (const question of questions) {
    if (question.answerType === "linked_metric") continue;
    total += 1;
    const answer = content.answers.get(question.key);
    const done =
      question.answerType === "table"
        ? (answer?.rows?.length ?? 0) > 0
        : question.answerType === "execution_view"
          ? question.options?.kind === "execution_view" &&
            (content.executionCounts.get(question.options.executionType) ?? 0) >
              0
          : hasText(answer?.text ?? null);
    if (done) filled += 1;
  }
  return { filled, total };
};

/**
 * The marks of a plan item on 20 (design-spec 6.12): V when a sub-item is copied from
 * the validation by the draft or shows the validation's numbers, S when one refers to
 * the shared self-analyses. The starting execution rows come from the template, not the
 * validation, and mark nothing.
 */
export const planItemMarks = (
  questions: readonly PlanQuestion[],
): PlanItemMark[] => {
  const marks: PlanItemMark[] = [];
  if (
    questions.some(
      (question) =>
        (question.copyFrom?.length ?? 0) > 0 ||
        question.answerType === "linked_metric",
    )
  )
    marks.push("V");
  if (
    questions.some((question) =>
      question.reference?.some((spec) => spec.kind === "self_analysis"),
    )
  )
    marks.push("S");
  return marks;
};

/** Sums the numbers of `column` in `rows` exactly at `digits` decimal places. */
const columnSum = (
  rows: readonly PlanTableRow[],
  column: string | undefined,
  digits: number,
) => {
  if (column === undefined) return 0;
  const scale = 10 ** digits;
  let units = 0;
  for (const row of rows) {
    const value = row[column];
    if (typeof value === "number") units += Math.round(value * scale);
  }
  return units / scale;
};

/**
 * The totals under §13's table (design-spec 6.12): the sum of its % column (a 0–1
 * rate) and of its money column. No warning when the % is not 100.
 */
export const tableTotals = (
  options: QuestionOptions | null,
  rows: readonly PlanTableRow[] | null,
): { ownership: number; capital: number } => {
  const columns = options?.kind === "table" ? options.columns : [];
  const of = (type: "percent" | "money") =>
    columns.find((column) => column.type === type)?.key;
  return {
    ownership: columnSum(rows ?? [], of("percent"), 4),
    capital: columnSum(rows ?? [], of("money"), 2),
  };
};

/**
 * The sub-items of §24 a Go / No-Go records as its conditions (design-spec 6.12 M4): We
 * proceed to launch if / We delay if / We stop / abandon if.
 */
export const GO_NO_GO_CONDITION_KEYS = {
  launchIf: "P.24.1",
  delayIf: "P.24.2",
  stopIf: "P.24.3",
} as const;
