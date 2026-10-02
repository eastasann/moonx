/**
 * Values of `change_history.section_key` for the validation screens, so the history of one screen
 * can be listed by section (SDD 6.3). Answers use the section of their question (`01`, `02`, `04`,
 * `08`, `10`), see {@link answerHistorySection}.
 */
export const HISTORY_SECTION = {
  researchLog: "research_log",
  competitors: "competitors",
  assumptionsRisks: "assumptions_risks",
  costs: "costs",
  economics: "economics",
  execution: "execution",
} as const;

/** The section of a question key such as `V.01.WHO`. */
export function answerHistorySection(questionKey: string): string {
  return questionKey.split(".")[1] ?? "";
}
