import type { TemplateSection } from "@moonx/schemas";
import { hasText } from "./fau";
import { isQuestionShown } from "./validation";

/** What progress reads of a self-analysis answer. */
export interface SelfAnalysisAnswerInput {
  text: string | null;
  /** Amount-with-reason questions only. */
  amount: number | null;
}

/**
 * Whether a self-analysis answer counts as answered: it has a text that is not blank,
 * or an amount (an amount-with-reason question has two fields, and either one is an
 * answer, design-spec 6.11).
 */
export const isSelfAnalysisAnswered = (
  answer: SelfAnalysisAnswerInput | undefined,
) => answer !== undefined && (hasText(answer.text) || answer.amount !== null);

/** How far a self-analysis is (SDD 5.8 SelfAnalysisHome), counted on its pinned version. */
export interface SelfAnalysisProgress {
  answered: number;
  total: number;
  sections: { key: string; title: string; answered: number; total: number }[];
  /** The first question in template order not answered yet; null when all are. */
  firstUnanswered: { sectionKey: string; questionKey: string } | null;
}

/**
 * Counts the answered questions of a self-analysis, section by section, on the questions
 * of its pinned version. A question its display condition hides counts nowhere, as on 11
 * (design-spec 6.2), and an answer to a question the version lacks is not counted.
 */
export const selfAnalysisProgress = (
  sections: readonly TemplateSection[],
  answers: ReadonlyMap<string, SelfAnalysisAnswerInput>,
): SelfAnalysisProgress => {
  let firstUnanswered: SelfAnalysisProgress["firstUnanswered"] = null;
  const rows = sections.map((section) => {
    const shown = section.questions.filter((question) =>
      isQuestionShown(question, answers),
    );
    let answered = 0;
    for (const question of shown) {
      if (isSelfAnalysisAnswered(answers.get(question.key))) answered += 1;
      else
        firstUnanswered ??= {
          sectionKey: section.key,
          questionKey: question.key,
        };
    }
    return {
      key: section.key,
      title: section.title,
      answered,
      total: shown.length,
    };
  });
  return {
    answered: rows.reduce((sum, row) => sum + row.answered, 0),
    total: rows.reduce((sum, row) => sum + row.total, 0),
    sections: rows,
    firstUnanswered,
  };
};
