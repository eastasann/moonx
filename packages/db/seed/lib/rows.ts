import type { schema } from "../../src/client";

type Insert<K extends keyof typeof schema> = (typeof schema)[K] extends { $inferInsert: infer R }
  ? R
  : never;

/**
 * Everything the seed inserts, grouped by table. Builders push rows here with deterministic ids and
 * `insertAll` writes them in foreign-key order.
 */
export class World {
  users: Insert<"users">[] = [];
  accounts: Insert<"accounts">[] = [];
  workspaces: Insert<"workspaces">[] = [];
  memberships: Insert<"memberships">[] = [];
  invitations: Insert<"invitations">[] = [];
  templates: Insert<"templates">[] = [];
  templateVersions: Insert<"templateVersions">[] = [];
  templateSections: Insert<"templateSections">[] = [];
  templateQuestions: Insert<"templateQuestions">[] = [];
  templateCostDefaults: Insert<"templateCostDefaults">[] = [];
  templateCheckRules: Insert<"templateCheckRules">[] = [];
  templateExecutionPresets: Insert<"templateExecutionPresets">[] = [];
  selfAnalyses: Insert<"selfAnalyses">[] = [];
  selfAnalysisAnswers: Insert<"selfAnalysisAnswers">[] = [];
  selfAnalysisShares: Insert<"selfAnalysisShares">[] = [];
  ideas: Insert<"ideas">[] = [];
  validations: Insert<"validations">[] = [];
  validationAnswers: Insert<"validationAnswers">[] = [];
  researchLogEntries: Insert<"researchLogEntries">[] = [];
  competitors: Insert<"competitors">[] = [];
  assumptions: Insert<"assumptions">[] = [];
  risks: Insert<"risks">[] = [];
  costItems: Insert<"costItems">[] = [];
  economicsInputs: Insert<"economicsInputs">[] = [];
  evidenceLinks: Insert<"evidenceLinks">[] = [];
  businessPlans: Insert<"businessPlans">[] = [];
  planAnswers: Insert<"planAnswers">[] = [];
  planVersions: Insert<"planVersions">[] = [];
  executionItems: Insert<"executionItems">[] = [];
  decisionLogEntries: Insert<"decisionLogEntries">[] = [];
  comments: Insert<"comments">[] = [];
  commentMentions: Insert<"commentMentions">[] = [];
  notifications: Insert<"notifications">[] = [];
  changeHistory: Insert<"changeHistory">[] = [];
}
