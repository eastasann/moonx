import { relations } from "drizzle-orm";
import {
  accounts,
  assumptions,
  businessPlans,
  changeHistory,
  commentMentions,
  comments,
  competitors,
  costItems,
  decisionLogEntries,
  economicsInputs,
  evidenceLinks,
  executionItems,
  ideas,
  invitations,
  memberships,
  notifications,
  planAnswers,
  planVersions,
  researchLogEntries,
  risks,
  selfAnalyses,
  selfAnalysisAnswers,
  selfAnalysisShares,
  sessions,
  templateCheckRules,
  templateCostDefaults,
  templateExecutionPresets,
  templateQuestions,
  templateSections,
  templates,
  templateVersions,
  users,
  validationAnswers,
  validations,
  workspaces,
} from "./schema";

// Two relations per foreign key of schema.ts, tables in its order. The table holding the
// key gets one() named after the column without "Id"; the referenced table gets the
// inverse, many() or, for a unique column, one(). The inverse takes the holding table's
// name, plus "As" and the role when the column names a role rather than the referenced
// table (users.ideasAsProposer). Both carry the relationName "{table}_{column}", so tables
// joined by several keys resolve unambiguously. The inverse one() cannot carry a name
// (Drizzle types it to need fields), which is safe because a unique column here is always
// the only key between its two tables.

export const usersRelations = relations(users, ({ one, many }) => ({
  lastWorkspace: one(workspaces, {
    fields: [users.lastWorkspaceId],
    references: [workspaces.id],
    relationName: "users_last_workspace_id",
  }),
  sessions: many(sessions, { relationName: "sessions_user_id" }),
  accounts: many(accounts, { relationName: "accounts_user_id" }),
  workspacesAsCreatedBy: many(workspaces, {
    relationName: "workspaces_created_by_id",
  }),
  memberships: many(memberships, { relationName: "memberships_user_id" }),
  invitationsAsInvitedBy: many(invitations, {
    relationName: "invitations_invited_by_id",
  }),
  invitationsAsAcceptedBy: many(invitations, {
    relationName: "invitations_accepted_by_id",
  }),
  templateVersionsAsPublishedBy: many(templateVersions, {
    relationName: "template_versions_published_by_id",
  }),
  selfAnalysis: one(selfAnalyses),
  selfAnalysisAnswersAsUpdatedBy: many(selfAnalysisAnswers, {
    relationName: "self_analysis_answers_updated_by_id",
  }),
  ideasAsProposer: many(ideas, { relationName: "ideas_proposer_id" }),
  ideasAsUpdatedBy: many(ideas, { relationName: "ideas_updated_by_id" }),
  validationAnswersAsUpdatedBy: many(validationAnswers, {
    relationName: "validation_answers_updated_by_id",
  }),
  researchLogEntriesAsCreatedBy: many(researchLogEntries, {
    relationName: "research_log_entries_created_by_id",
  }),
  researchLogEntriesAsUpdatedBy: many(researchLogEntries, {
    relationName: "research_log_entries_updated_by_id",
  }),
  competitorsAsUpdatedBy: many(competitors, {
    relationName: "competitors_updated_by_id",
  }),
  assumptionsAsUpdatedBy: many(assumptions, {
    relationName: "assumptions_updated_by_id",
  }),
  risksAsUpdatedBy: many(risks, { relationName: "risks_updated_by_id" }),
  costItemsAsUpdatedBy: many(costItems, {
    relationName: "cost_items_updated_by_id",
  }),
  economicsInputsAsUpdatedBy: many(economicsInputs, {
    relationName: "economics_inputs_updated_by_id",
  }),
  evidenceLinksAsCreatedBy: many(evidenceLinks, {
    relationName: "evidence_links_created_by_id",
  }),
  businessPlansAsCreatedBy: many(businessPlans, {
    relationName: "business_plans_created_by_id",
  }),
  businessPlansAsUpdatedBy: many(businessPlans, {
    relationName: "business_plans_updated_by_id",
  }),
  planAnswersAsUpdatedBy: many(planAnswers, {
    relationName: "plan_answers_updated_by_id",
  }),
  planVersionsAsSavedBy: many(planVersions, {
    relationName: "plan_versions_saved_by_id",
  }),
  executionItemsAsAssigneeUser: many(executionItems, {
    relationName: "execution_items_assignee_user_id",
  }),
  executionItemsAsUpdatedBy: many(executionItems, {
    relationName: "execution_items_updated_by_id",
  }),
  decisionLogEntriesAsRecordedBy: many(decisionLogEntries, {
    relationName: "decision_log_entries_recorded_by_id",
  }),
  commentsAsAuthor: many(comments, { relationName: "comments_author_id" }),
  commentsAsResolvedBy: many(comments, {
    relationName: "comments_resolved_by_id",
  }),
  commentMentions: many(commentMentions, {
    relationName: "comment_mentions_user_id",
  }),
  notifications: many(notifications, { relationName: "notifications_user_id" }),
  notificationsAsActor: many(notifications, {
    relationName: "notifications_actor_id",
  }),
  changeHistoryAsOwnerUser: many(changeHistory, {
    relationName: "change_history_owner_user_id",
  }),
  changeHistoryAsChangedBy: many(changeHistory, {
    relationName: "change_history_changed_by_id",
  }),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, {
    fields: [sessions.userId],
    references: [users.id],
    relationName: "sessions_user_id",
  }),
}));

export const accountsRelations = relations(accounts, ({ one }) => ({
  user: one(users, {
    fields: [accounts.userId],
    references: [users.id],
    relationName: "accounts_user_id",
  }),
}));

export const workspacesRelations = relations(workspaces, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [workspaces.createdById],
    references: [users.id],
    relationName: "workspaces_created_by_id",
  }),
  usersAsLastWorkspace: many(users, {
    relationName: "users_last_workspace_id",
  }),
  memberships: many(memberships, { relationName: "memberships_workspace_id" }),
  invitations: many(invitations, { relationName: "invitations_workspace_id" }),
  selfAnalysisShares: many(selfAnalysisShares, {
    relationName: "self_analysis_shares_workspace_id",
  }),
  ideas: many(ideas, { relationName: "ideas_workspace_id" }),
  evidenceLinks: many(evidenceLinks, {
    relationName: "evidence_links_workspace_id",
  }),
  decisionLogEntries: many(decisionLogEntries, {
    relationName: "decision_log_entries_workspace_id",
  }),
  comments: many(comments, { relationName: "comments_workspace_id" }),
  notifications: many(notifications, {
    relationName: "notifications_workspace_id",
  }),
  changeHistory: many(changeHistory, {
    relationName: "change_history_workspace_id",
  }),
}));

export const membershipsRelations = relations(memberships, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [memberships.workspaceId],
    references: [workspaces.id],
    relationName: "memberships_workspace_id",
  }),
  user: one(users, {
    fields: [memberships.userId],
    references: [users.id],
    relationName: "memberships_user_id",
  }),
}));

export const invitationsRelations = relations(invitations, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [invitations.workspaceId],
    references: [workspaces.id],
    relationName: "invitations_workspace_id",
  }),
  invitedBy: one(users, {
    fields: [invitations.invitedById],
    references: [users.id],
    relationName: "invitations_invited_by_id",
  }),
  acceptedBy: one(users, {
    fields: [invitations.acceptedById],
    references: [users.id],
    relationName: "invitations_accepted_by_id",
  }),
}));

export const templatesRelations = relations(templates, ({ many }) => ({
  templateVersions: many(templateVersions, {
    relationName: "template_versions_template_id",
  }),
}));

export const templateVersionsRelations = relations(
  templateVersions,
  ({ one, many }) => ({
    template: one(templates, {
      fields: [templateVersions.templateId],
      references: [templates.id],
      relationName: "template_versions_template_id",
    }),
    publishedBy: one(users, {
      fields: [templateVersions.publishedById],
      references: [users.id],
      relationName: "template_versions_published_by_id",
    }),
    templateSections: many(templateSections, {
      relationName: "template_sections_template_version_id",
    }),
    templateQuestions: many(templateQuestions, {
      relationName: "template_questions_template_version_id",
    }),
    templateCostDefaults: many(templateCostDefaults, {
      relationName: "template_cost_defaults_template_version_id",
    }),
    templateCheckRules: many(templateCheckRules, {
      relationName: "template_check_rules_template_version_id",
    }),
    templateExecutionPresets: many(templateExecutionPresets, {
      relationName: "template_execution_presets_template_version_id",
    }),
    selfAnalyses: many(selfAnalyses, {
      relationName: "self_analyses_template_version_id",
    }),
    validations: many(validations, {
      relationName: "validations_template_version_id",
    }),
    businessPlans: many(businessPlans, {
      relationName: "business_plans_template_version_id",
    }),
  }),
);

export const templateSectionsRelations = relations(
  templateSections,
  ({ one, many }) => ({
    templateVersion: one(templateVersions, {
      fields: [templateSections.templateVersionId],
      references: [templateVersions.id],
      relationName: "template_sections_template_version_id",
    }),
    templateQuestions: many(templateQuestions, {
      relationName: "template_questions_template_section_id",
    }),
  }),
);

export const templateQuestionsRelations = relations(
  templateQuestions,
  ({ one }) => ({
    templateVersion: one(templateVersions, {
      fields: [templateQuestions.templateVersionId],
      references: [templateVersions.id],
      relationName: "template_questions_template_version_id",
    }),
    templateSection: one(templateSections, {
      fields: [templateQuestions.templateSectionId],
      references: [templateSections.id],
      relationName: "template_questions_template_section_id",
    }),
  }),
);

export const templateCostDefaultsRelations = relations(
  templateCostDefaults,
  ({ one }) => ({
    templateVersion: one(templateVersions, {
      fields: [templateCostDefaults.templateVersionId],
      references: [templateVersions.id],
      relationName: "template_cost_defaults_template_version_id",
    }),
  }),
);

export const templateCheckRulesRelations = relations(
  templateCheckRules,
  ({ one }) => ({
    templateVersion: one(templateVersions, {
      fields: [templateCheckRules.templateVersionId],
      references: [templateVersions.id],
      relationName: "template_check_rules_template_version_id",
    }),
  }),
);

export const templateExecutionPresetsRelations = relations(
  templateExecutionPresets,
  ({ one }) => ({
    templateVersion: one(templateVersions, {
      fields: [templateExecutionPresets.templateVersionId],
      references: [templateVersions.id],
      relationName: "template_execution_presets_template_version_id",
    }),
  }),
);

export const selfAnalysesRelations = relations(
  selfAnalyses,
  ({ one, many }) => ({
    user: one(users, {
      fields: [selfAnalyses.userId],
      references: [users.id],
      relationName: "self_analyses_user_id",
    }),
    templateVersion: one(templateVersions, {
      fields: [selfAnalyses.templateVersionId],
      references: [templateVersions.id],
      relationName: "self_analyses_template_version_id",
    }),
    selfAnalysisAnswers: many(selfAnalysisAnswers, {
      relationName: "self_analysis_answers_self_analysis_id",
    }),
    selfAnalysisShares: many(selfAnalysisShares, {
      relationName: "self_analysis_shares_self_analysis_id",
    }),
  }),
);

export const selfAnalysisAnswersRelations = relations(
  selfAnalysisAnswers,
  ({ one }) => ({
    selfAnalysis: one(selfAnalyses, {
      fields: [selfAnalysisAnswers.selfAnalysisId],
      references: [selfAnalyses.id],
      relationName: "self_analysis_answers_self_analysis_id",
    }),
    updatedBy: one(users, {
      fields: [selfAnalysisAnswers.updatedById],
      references: [users.id],
      relationName: "self_analysis_answers_updated_by_id",
    }),
  }),
);

export const selfAnalysisSharesRelations = relations(
  selfAnalysisShares,
  ({ one }) => ({
    selfAnalysis: one(selfAnalyses, {
      fields: [selfAnalysisShares.selfAnalysisId],
      references: [selfAnalyses.id],
      relationName: "self_analysis_shares_self_analysis_id",
    }),
    workspace: one(workspaces, {
      fields: [selfAnalysisShares.workspaceId],
      references: [workspaces.id],
      relationName: "self_analysis_shares_workspace_id",
    }),
  }),
);

export const ideasRelations = relations(ideas, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [ideas.workspaceId],
    references: [workspaces.id],
    relationName: "ideas_workspace_id",
  }),
  proposer: one(users, {
    fields: [ideas.proposerId],
    references: [users.id],
    relationName: "ideas_proposer_id",
  }),
  duplicatedFrom: one(ideas, {
    fields: [ideas.duplicatedFromId],
    references: [ideas.id],
    relationName: "ideas_duplicated_from_id",
  }),
  updatedBy: one(users, {
    fields: [ideas.updatedById],
    references: [users.id],
    relationName: "ideas_updated_by_id",
  }),
  ideasAsDuplicatedFrom: many(ideas, {
    relationName: "ideas_duplicated_from_id",
  }),
  validation: one(validations),
  businessPlans: many(businessPlans, {
    relationName: "business_plans_idea_id",
  }),
  decisionLogEntries: many(decisionLogEntries, {
    relationName: "decision_log_entries_idea_id",
  }),
}));

export const validationsRelations = relations(validations, ({ one, many }) => ({
  idea: one(ideas, {
    fields: [validations.ideaId],
    references: [ideas.id],
    relationName: "validations_idea_id",
  }),
  templateVersion: one(templateVersions, {
    fields: [validations.templateVersionId],
    references: [templateVersions.id],
    relationName: "validations_template_version_id",
  }),
  validationAnswers: many(validationAnswers, {
    relationName: "validation_answers_validation_id",
  }),
  researchLogEntries: many(researchLogEntries, {
    relationName: "research_log_entries_validation_id",
  }),
  competitors: many(competitors, { relationName: "competitors_validation_id" }),
  assumptions: many(assumptions, { relationName: "assumptions_validation_id" }),
  risks: many(risks, { relationName: "risks_validation_id" }),
  costItems: many(costItems, { relationName: "cost_items_validation_id" }),
  economicsInputs: many(economicsInputs, {
    relationName: "economics_inputs_validation_id",
  }),
  evidenceLinks: many(evidenceLinks, {
    relationName: "evidence_links_validation_id",
  }),
}));

export const validationAnswersRelations = relations(
  validationAnswers,
  ({ one }) => ({
    validation: one(validations, {
      fields: [validationAnswers.validationId],
      references: [validations.id],
      relationName: "validation_answers_validation_id",
    }),
    updatedBy: one(users, {
      fields: [validationAnswers.updatedById],
      references: [users.id],
      relationName: "validation_answers_updated_by_id",
    }),
  }),
);

export const researchLogEntriesRelations = relations(
  researchLogEntries,
  ({ one, many }) => ({
    validation: one(validations, {
      fields: [researchLogEntries.validationId],
      references: [validations.id],
      relationName: "research_log_entries_validation_id",
    }),
    createdBy: one(users, {
      fields: [researchLogEntries.createdById],
      references: [users.id],
      relationName: "research_log_entries_created_by_id",
    }),
    updatedBy: one(users, {
      fields: [researchLogEntries.updatedById],
      references: [users.id],
      relationName: "research_log_entries_updated_by_id",
    }),
    evidenceLinks: many(evidenceLinks, {
      relationName: "evidence_links_research_log_entry_id",
    }),
  }),
);

export const competitorsRelations = relations(competitors, ({ one }) => ({
  validation: one(validations, {
    fields: [competitors.validationId],
    references: [validations.id],
    relationName: "competitors_validation_id",
  }),
  updatedBy: one(users, {
    fields: [competitors.updatedById],
    references: [users.id],
    relationName: "competitors_updated_by_id",
  }),
}));

export const assumptionsRelations = relations(assumptions, ({ one }) => ({
  validation: one(validations, {
    fields: [assumptions.validationId],
    references: [validations.id],
    relationName: "assumptions_validation_id",
  }),
  updatedBy: one(users, {
    fields: [assumptions.updatedById],
    references: [users.id],
    relationName: "assumptions_updated_by_id",
  }),
}));

export const risksRelations = relations(risks, ({ one }) => ({
  validation: one(validations, {
    fields: [risks.validationId],
    references: [validations.id],
    relationName: "risks_validation_id",
  }),
  updatedBy: one(users, {
    fields: [risks.updatedById],
    references: [users.id],
    relationName: "risks_updated_by_id",
  }),
}));

export const costItemsRelations = relations(costItems, ({ one }) => ({
  validation: one(validations, {
    fields: [costItems.validationId],
    references: [validations.id],
    relationName: "cost_items_validation_id",
  }),
  updatedBy: one(users, {
    fields: [costItems.updatedById],
    references: [users.id],
    relationName: "cost_items_updated_by_id",
  }),
}));

export const economicsInputsRelations = relations(
  economicsInputs,
  ({ one }) => ({
    validation: one(validations, {
      fields: [economicsInputs.validationId],
      references: [validations.id],
      relationName: "economics_inputs_validation_id",
    }),
    updatedBy: one(users, {
      fields: [economicsInputs.updatedById],
      references: [users.id],
      relationName: "economics_inputs_updated_by_id",
    }),
  }),
);

export const evidenceLinksRelations = relations(evidenceLinks, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [evidenceLinks.workspaceId],
    references: [workspaces.id],
    relationName: "evidence_links_workspace_id",
  }),
  validation: one(validations, {
    fields: [evidenceLinks.validationId],
    references: [validations.id],
    relationName: "evidence_links_validation_id",
  }),
  researchLogEntry: one(researchLogEntries, {
    fields: [evidenceLinks.researchLogEntryId],
    references: [researchLogEntries.id],
    relationName: "evidence_links_research_log_entry_id",
  }),
  createdBy: one(users, {
    fields: [evidenceLinks.createdById],
    references: [users.id],
    relationName: "evidence_links_created_by_id",
  }),
}));

export const businessPlansRelations = relations(
  businessPlans,
  ({ one, many }) => ({
    idea: one(ideas, {
      fields: [businessPlans.ideaId],
      references: [ideas.id],
      relationName: "business_plans_idea_id",
    }),
    templateVersion: one(templateVersions, {
      fields: [businessPlans.templateVersionId],
      references: [templateVersions.id],
      relationName: "business_plans_template_version_id",
    }),
    createdBy: one(users, {
      fields: [businessPlans.createdById],
      references: [users.id],
      relationName: "business_plans_created_by_id",
    }),
    updatedBy: one(users, {
      fields: [businessPlans.updatedById],
      references: [users.id],
      relationName: "business_plans_updated_by_id",
    }),
    createdFromDecision: one(decisionLogEntries, {
      fields: [businessPlans.createdFromDecisionId],
      references: [decisionLogEntries.id],
      relationName: "business_plans_created_from_decision_id",
    }),
    planAnswers: many(planAnswers, {
      relationName: "plan_answers_business_plan_id",
    }),
    planVersions: many(planVersions, {
      relationName: "plan_versions_business_plan_id",
    }),
    executionItems: many(executionItems, {
      relationName: "execution_items_business_plan_id",
    }),
    decisionLogEntries: many(decisionLogEntries, {
      relationName: "decision_log_entries_business_plan_id",
    }),
  }),
);

export const planAnswersRelations = relations(planAnswers, ({ one }) => ({
  businessPlan: one(businessPlans, {
    fields: [planAnswers.businessPlanId],
    references: [businessPlans.id],
    relationName: "plan_answers_business_plan_id",
  }),
  updatedBy: one(users, {
    fields: [planAnswers.updatedById],
    references: [users.id],
    relationName: "plan_answers_updated_by_id",
  }),
}));

export const planVersionsRelations = relations(
  planVersions,
  ({ one, many }) => ({
    businessPlan: one(businessPlans, {
      fields: [planVersions.businessPlanId],
      references: [businessPlans.id],
      relationName: "plan_versions_business_plan_id",
    }),
    savedBy: one(users, {
      fields: [planVersions.savedById],
      references: [users.id],
      relationName: "plan_versions_saved_by_id",
    }),
    decisionLogEntries: many(decisionLogEntries, {
      relationName: "decision_log_entries_plan_version_id",
    }),
  }),
);

export const executionItemsRelations = relations(executionItems, ({ one }) => ({
  businessPlan: one(businessPlans, {
    fields: [executionItems.businessPlanId],
    references: [businessPlans.id],
    relationName: "execution_items_business_plan_id",
  }),
  assigneeUser: one(users, {
    fields: [executionItems.assigneeUserId],
    references: [users.id],
    relationName: "execution_items_assignee_user_id",
  }),
  updatedBy: one(users, {
    fields: [executionItems.updatedById],
    references: [users.id],
    relationName: "execution_items_updated_by_id",
  }),
}));

export const decisionLogEntriesRelations = relations(
  decisionLogEntries,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [decisionLogEntries.workspaceId],
      references: [workspaces.id],
      relationName: "decision_log_entries_workspace_id",
    }),
    idea: one(ideas, {
      fields: [decisionLogEntries.ideaId],
      references: [ideas.id],
      relationName: "decision_log_entries_idea_id",
    }),
    businessPlan: one(businessPlans, {
      fields: [decisionLogEntries.businessPlanId],
      references: [businessPlans.id],
      relationName: "decision_log_entries_business_plan_id",
    }),
    planVersion: one(planVersions, {
      fields: [decisionLogEntries.planVersionId],
      references: [planVersions.id],
      relationName: "decision_log_entries_plan_version_id",
    }),
    recordedBy: one(users, {
      fields: [decisionLogEntries.recordedById],
      references: [users.id],
      relationName: "decision_log_entries_recorded_by_id",
    }),
    businessPlansAsCreatedFromDecision: many(businessPlans, {
      relationName: "business_plans_created_from_decision_id",
    }),
    notifications: many(notifications, {
      relationName: "notifications_decision_log_entry_id",
    }),
  }),
);

export const commentsRelations = relations(comments, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [comments.workspaceId],
    references: [workspaces.id],
    relationName: "comments_workspace_id",
  }),
  parent: one(comments, {
    fields: [comments.parentId],
    references: [comments.id],
    relationName: "comments_parent_id",
  }),
  author: one(users, {
    fields: [comments.authorId],
    references: [users.id],
    relationName: "comments_author_id",
  }),
  resolvedBy: one(users, {
    fields: [comments.resolvedById],
    references: [users.id],
    relationName: "comments_resolved_by_id",
  }),
  commentsAsParent: many(comments, { relationName: "comments_parent_id" }),
  commentMentions: many(commentMentions, {
    relationName: "comment_mentions_comment_id",
  }),
  notifications: many(notifications, {
    relationName: "notifications_comment_id",
  }),
}));

export const commentMentionsRelations = relations(
  commentMentions,
  ({ one }) => ({
    comment: one(comments, {
      fields: [commentMentions.commentId],
      references: [comments.id],
      relationName: "comment_mentions_comment_id",
    }),
    user: one(users, {
      fields: [commentMentions.userId],
      references: [users.id],
      relationName: "comment_mentions_user_id",
    }),
  }),
);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
    relationName: "notifications_user_id",
  }),
  workspace: one(workspaces, {
    fields: [notifications.workspaceId],
    references: [workspaces.id],
    relationName: "notifications_workspace_id",
  }),
  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: "notifications_actor_id",
  }),
  comment: one(comments, {
    fields: [notifications.commentId],
    references: [comments.id],
    relationName: "notifications_comment_id",
  }),
  decisionLogEntry: one(decisionLogEntries, {
    fields: [notifications.decisionLogEntryId],
    references: [decisionLogEntries.id],
    relationName: "notifications_decision_log_entry_id",
  }),
}));

export const changeHistoryRelations = relations(
  changeHistory,
  ({ one, many }) => ({
    workspace: one(workspaces, {
      fields: [changeHistory.workspaceId],
      references: [workspaces.id],
      relationName: "change_history_workspace_id",
    }),
    ownerUser: one(users, {
      fields: [changeHistory.ownerUserId],
      references: [users.id],
      relationName: "change_history_owner_user_id",
    }),
    revertedFrom: one(changeHistory, {
      fields: [changeHistory.revertedFromId],
      references: [changeHistory.id],
      relationName: "change_history_reverted_from_id",
    }),
    changedBy: one(users, {
      fields: [changeHistory.changedById],
      references: [users.id],
      relationName: "change_history_changed_by_id",
    }),
    changeHistoryAsRevertedFrom: many(changeHistory, {
      relationName: "change_history_reverted_from_id",
    }),
  }),
);
