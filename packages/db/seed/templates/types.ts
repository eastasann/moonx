import type { schema } from "../../src/client";

type Tables = typeof schema;

export type AnswerType = Tables["templateQuestions"]["$inferInsert"]["answerType"];
export type CostCategory = Tables["costItems"]["$inferInsert"]["category"];
export type CheckKey = Tables["templateCheckRules"]["$inferInsert"]["checkKey"];
export type PresetType = Tables["templateExecutionPresets"]["$inferInsert"]["type"];
export type LaunchTiming = NonNullable<
  Tables["templateExecutionPresets"]["$inferInsert"]["launchTiming"]
>;

/** `template_questions.options` (SDD 5.2 QuestionOptions). */
export type QuestionOptions =
  | { kind: "choice"; choices: string[] }
  | {
      kind: "table";
      columns: { key: string; label: string; type: "text" | "number" | "percent" | "money" }[];
    }
  | { kind: "linked_metric"; metricKeys: string[] }
  | {
      kind: "execution_view";
      executionType: "milestone" | "launch" | "kpi" | "open_question" | "next_action";
    };

/** One entry of `template_questions.reference` (SDD 6.3). */
export type PlanReferenceSpec =
  | { kind: "validation_answers"; section?: string; keys?: string[] }
  | { kind: "competitors"; limit: number }
  | { kind: "cost_rows"; keys: string[] }
  | { kind: "research_log"; tag: "local_price" | "permits" | "demand_signal" }
  | { kind: "self_analysis"; sections: string[] }
  | { kind: "metrics"; keys: string[] }
  | { kind: "decision_log" | "go_no_go_history" | "assumptions" | "risks" | "totals" };

export interface SeedQuestion {
  key: string;
  title: string;
  prompt: string;
  example: string | null;
  hint: string | null;
  answerType: AnswerType;
  options: QuestionOptions | null;
  displayCondition: Record<string, string[]> | null;
  hasFau: boolean;
  copyFrom: string[] | null;
  reference: PlanReferenceSpec[] | null;
}

export interface SeedSection {
  key: string;
  part: "a" | "b" | null;
  title: string;
  guidance: string | null;
  questions: SeedQuestion[];
}

export interface SeedCostDefault {
  category: CostCategory;
  key: string;
  name: string;
}

export interface SeedExecutionPreset {
  type: PresetType;
  title: string;
  area: string | null;
  launchTiming: LaunchTiming | null;
}

export interface SeedTemplateVersion {
  versionNumber: number;
  status: "draft" | "published";
  aiPrompt: string;
  sections: SeedSection[];
  costDefaults: SeedCostDefault[];
  checkRules: { checkKey: CheckKey; params: Record<string, unknown> }[];
  executionPresets: SeedExecutionPreset[];
}

export interface SeedTemplate {
  kind: "self_analysis" | "validation" | "business_plan";
  name: string;
  versions: SeedTemplateVersion[];
}

export const question = (
  q: Partial<SeedQuestion> & Pick<SeedQuestion, "key" | "title" | "prompt">,
): SeedQuestion => ({
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  copyFrom: null,
  reference: null,
  ...q,
});

/** The version with this number, or an error: seed code names versions it knows exist. */
export function versionOf(template: SeedTemplate, versionNumber: number): SeedTemplateVersion {
  const found = template.versions.find((v) => v.versionNumber === versionNumber);
  if (!found) throw new Error(`${template.kind} has no v${versionNumber}`);
  return found;
}
