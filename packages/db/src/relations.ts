import { relations } from "drizzle-orm";
import * as t from "./schema";

export const usersRelations = relations(t.users, ({ one, many }) => ({
  lastWorkspace: one(t.workspaces, {
    fields: [t.users.lastWorkspaceId],
    references: [t.workspaces.id],
    relationName: "lastWorkspace",
  }),
  sessions: many(t.sessions),
  accounts: many(t.accounts),
  memberships: many(t.memberships),
  selfAnalysis: one(t.selfAnalyses),
  notifications: many(t.notifications, { relationName: "recipient" }),
}));

export const sessionsRelations = relations(t.sessions, ({ one }) => ({
  user: one(t.users, { fields: [t.sessions.userId], references: [t.users.id] }),
}));

export const accountsRelations = relations(t.accounts, ({ one }) => ({
  user: one(t.users, { fields: [t.accounts.userId], references: [t.users.id] }),
}));

export const workspacesRelations = relations(t.workspaces, ({ one, many }) => ({
  createdBy: one(t.users, { fields: [t.workspaces.createdById], references: [t.users.id] }),
  memberships: many(t.memberships),
  invitations: many(t.invitations),
  ideas: many(t.ideas),
  decisionLogEntries: many(t.decisionLogEntries),
  comments: many(t.comments),
  changeHistory: many(t.changeHistory),
  selfAnalysisShares: many(t.selfAnalysisShares),
}));

export const membershipsRelations = relations(t.memberships, ({ one }) => ({
  workspace: one(t.workspaces, {
    fields: [t.memberships.workspaceId],
    references: [t.workspaces.id],
  }),
  user: one(t.users, { fields: [t.memberships.userId], references: [t.users.id] }),
}));

export const invitationsRelations = relations(t.invitations, ({ one }) => ({
  workspace: one(t.workspaces, {
    fields: [t.invitations.workspaceId],
    references: [t.workspaces.id],
  }),
  invitedBy: one(t.users, {
    fields: [t.invitations.invitedById],
    references: [t.users.id],
    relationName: "invitedBy",
  }),
  acceptedBy: one(t.users, {
    fields: [t.invitations.acceptedById],
    references: [t.users.id],
    relationName: "acceptedBy",
  }),
}));

export const templatesRelations = relations(t.templates, ({ many }) => ({
  versions: many(t.templateVersions),
}));

export const templateVersionsRelations = relations(t.templateVersions, ({ one, many }) => ({
  template: one(t.templates, {
    fields: [t.templateVersions.templateId],
    references: [t.templates.id],
  }),
  publishedBy: one(t.users, {
    fields: [t.templateVersions.publishedById],
    references: [t.users.id],
  }),
  sections: many(t.templateSections),
  questions: many(t.templateQuestions),
  costDefaults: many(t.templateCostDefaults),
  checkRules: many(t.templateCheckRules),
  executionPresets: many(t.templateExecutionPresets),
}));

export const templateSectionsRelations = relations(t.templateSections, ({ one, many }) => ({
  templateVersion: one(t.templateVersions, {
    fields: [t.templateSections.templateVersionId],
    references: [t.templateVersions.id],
  }),
  questions: many(t.templateQuestions),
}));

export const templateQuestionsRelations = relations(t.templateQuestions, ({ one }) => ({
  templateVersion: one(t.templateVersions, {
    fields: [t.templateQuestions.templateVersionId],
    references: [t.templateVersions.id],
  }),
  templateSection: one(t.templateSections, {
    fields: [t.templateQuestions.templateSectionId],
    references: [t.templateSections.id],
  }),
}));

export const templateCostDefaultsRelations = relations(t.templateCostDefaults, ({ one }) => ({
  templateVersion: one(t.templateVersions, {
    fields: [t.templateCostDefaults.templateVersionId],
    references: [t.templateVersions.id],
  }),
}));

export const templateCheckRulesRelations = relations(t.templateCheckRules, ({ one }) => ({
  templateVersion: one(t.templateVersions, {
    fields: [t.templateCheckRules.templateVersionId],
    references: [t.templateVersions.id],
  }),
}));

export const templateExecutionPresetsRelations = relations(
  t.templateExecutionPresets,
  ({ one }) => ({
    templateVersion: one(t.templateVersions, {
      fields: [t.templateExecutionPresets.templateVersionId],
      references: [t.templateVersions.id],
    }),
  }),
);

export const selfAnalysesRelations = relations(t.selfAnalyses, ({ one, many }) => ({
  user: one(t.users, { fields: [t.selfAnalyses.userId], references: [t.users.id] }),
  templateVersion: one(t.templateVersions, {
    fields: [t.selfAnalyses.templateVersionId],
    references: [t.templateVersions.id],
  }),
  answers: many(t.selfAnalysisAnswers),
  shares: many(t.selfAnalysisShares),
}));

export const selfAnalysisAnswersRelations = relations(t.selfAnalysisAnswers, ({ one }) => ({
  selfAnalysis: one(t.selfAnalyses, {
    fields: [t.selfAnalysisAnswers.selfAnalysisId],
    references: [t.selfAnalyses.id],
  }),
  updatedBy: one(t.users, {
    fields: [t.selfAnalysisAnswers.updatedById],
    references: [t.users.id],
  }),
}));

export const selfAnalysisSharesRelations = relations(t.selfAnalysisShares, ({ one }) => ({
  selfAnalysis: one(t.selfAnalyses, {
    fields: [t.selfAnalysisShares.selfAnalysisId],
    references: [t.selfAnalyses.id],
  }),
  workspace: one(t.workspaces, {
    fields: [t.selfAnalysisShares.workspaceId],
    references: [t.workspaces.id],
  }),
}));

export const ideasRelations = relations(t.ideas, ({ one, many }) => ({
  workspace: one(t.workspaces, { fields: [t.ideas.workspaceId], references: [t.workspaces.id] }),
  proposer: one(t.users, { fields: [t.ideas.proposerId], references: [t.users.id] }),
  updatedBy: one(t.users, { fields: [t.ideas.updatedById], references: [t.users.id] }),
  duplicatedFrom: one(t.ideas, {
    fields: [t.ideas.duplicatedFromId],
    references: [t.ideas.id],
    relationName: "duplicate",
  }),
  duplicates: many(t.ideas, { relationName: "duplicate" }),
  validation: one(t.validations),
  businessPlans: many(t.businessPlans),
  decisionLogEntries: many(t.decisionLogEntries),
}));

export const validationsRelations = relations(t.validations, ({ one, many }) => ({
  idea: one(t.ideas, { fields: [t.validations.ideaId], references: [t.ideas.id] }),
  templateVersion: one(t.templateVersions, {
    fields: [t.validations.templateVersionId],
    references: [t.templateVersions.id],
  }),
  answers: many(t.validationAnswers),
  researchLogEntries: many(t.researchLogEntries),
  competitors: many(t.competitors),
  assumptions: many(t.assumptions),
  risks: many(t.risks),
  costItems: many(t.costItems),
  economicsInputs: many(t.economicsInputs),
  evidenceLinks: many(t.evidenceLinks),
}));

export const validationAnswersRelations = relations(t.validationAnswers, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.validationAnswers.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, {
    fields: [t.validationAnswers.updatedById],
    references: [t.users.id],
  }),
}));

export const researchLogEntriesRelations = relations(t.researchLogEntries, ({ one, many }) => ({
  validation: one(t.validations, {
    fields: [t.researchLogEntries.validationId],
    references: [t.validations.id],
  }),
  createdBy: one(t.users, {
    fields: [t.researchLogEntries.createdById],
    references: [t.users.id],
    relationName: "createdBy",
  }),
  updatedBy: one(t.users, {
    fields: [t.researchLogEntries.updatedById],
    references: [t.users.id],
    relationName: "updatedBy",
  }),
  evidenceLinks: many(t.evidenceLinks),
}));

export const competitorsRelations = relations(t.competitors, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.competitors.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, { fields: [t.competitors.updatedById], references: [t.users.id] }),
}));

export const assumptionsRelations = relations(t.assumptions, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.assumptions.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, { fields: [t.assumptions.updatedById], references: [t.users.id] }),
}));

export const risksRelations = relations(t.risks, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.risks.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, { fields: [t.risks.updatedById], references: [t.users.id] }),
}));

export const costItemsRelations = relations(t.costItems, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.costItems.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, { fields: [t.costItems.updatedById], references: [t.users.id] }),
}));

export const economicsInputsRelations = relations(t.economicsInputs, ({ one }) => ({
  validation: one(t.validations, {
    fields: [t.economicsInputs.validationId],
    references: [t.validations.id],
  }),
  updatedBy: one(t.users, {
    fields: [t.economicsInputs.updatedById],
    references: [t.users.id],
  }),
}));

export const evidenceLinksRelations = relations(t.evidenceLinks, ({ one }) => ({
  workspace: one(t.workspaces, {
    fields: [t.evidenceLinks.workspaceId],
    references: [t.workspaces.id],
  }),
  validation: one(t.validations, {
    fields: [t.evidenceLinks.validationId],
    references: [t.validations.id],
  }),
  researchLogEntry: one(t.researchLogEntries, {
    fields: [t.evidenceLinks.researchLogEntryId],
    references: [t.researchLogEntries.id],
  }),
  createdBy: one(t.users, { fields: [t.evidenceLinks.createdById], references: [t.users.id] }),
}));

export const businessPlansRelations = relations(t.businessPlans, ({ one, many }) => ({
  idea: one(t.ideas, { fields: [t.businessPlans.ideaId], references: [t.ideas.id] }),
  templateVersion: one(t.templateVersions, {
    fields: [t.businessPlans.templateVersionId],
    references: [t.templateVersions.id],
  }),
  createdFromDecision: one(t.decisionLogEntries, {
    fields: [t.businessPlans.createdFromDecisionId],
    references: [t.decisionLogEntries.id],
    relationName: "createdFromDecision",
  }),
  createdBy: one(t.users, {
    fields: [t.businessPlans.createdById],
    references: [t.users.id],
    relationName: "createdBy",
  }),
  updatedBy: one(t.users, {
    fields: [t.businessPlans.updatedById],
    references: [t.users.id],
    relationName: "updatedBy",
  }),
  answers: many(t.planAnswers),
  versions: many(t.planVersions),
  executionItems: many(t.executionItems),
  decisionLogEntries: many(t.decisionLogEntries, { relationName: "decisionPlan" }),
}));

export const planAnswersRelations = relations(t.planAnswers, ({ one }) => ({
  businessPlan: one(t.businessPlans, {
    fields: [t.planAnswers.businessPlanId],
    references: [t.businessPlans.id],
  }),
  updatedBy: one(t.users, { fields: [t.planAnswers.updatedById], references: [t.users.id] }),
}));

export const planVersionsRelations = relations(t.planVersions, ({ one }) => ({
  businessPlan: one(t.businessPlans, {
    fields: [t.planVersions.businessPlanId],
    references: [t.businessPlans.id],
  }),
  savedBy: one(t.users, { fields: [t.planVersions.savedById], references: [t.users.id] }),
}));

export const executionItemsRelations = relations(t.executionItems, ({ one }) => ({
  businessPlan: one(t.businessPlans, {
    fields: [t.executionItems.businessPlanId],
    references: [t.businessPlans.id],
  }),
  assigneeUser: one(t.users, {
    fields: [t.executionItems.assigneeUserId],
    references: [t.users.id],
    relationName: "assignee",
  }),
  updatedBy: one(t.users, {
    fields: [t.executionItems.updatedById],
    references: [t.users.id],
    relationName: "updatedBy",
  }),
}));

export const decisionLogEntriesRelations = relations(t.decisionLogEntries, ({ one, many }) => ({
  workspace: one(t.workspaces, {
    fields: [t.decisionLogEntries.workspaceId],
    references: [t.workspaces.id],
  }),
  idea: one(t.ideas, { fields: [t.decisionLogEntries.ideaId], references: [t.ideas.id] }),
  businessPlan: one(t.businessPlans, {
    fields: [t.decisionLogEntries.businessPlanId],
    references: [t.businessPlans.id],
    relationName: "decisionPlan",
  }),
  planVersion: one(t.planVersions, {
    fields: [t.decisionLogEntries.planVersionId],
    references: [t.planVersions.id],
  }),
  recordedBy: one(t.users, {
    fields: [t.decisionLogEntries.recordedById],
    references: [t.users.id],
  }),
  createdPlans: many(t.businessPlans, { relationName: "createdFromDecision" }),
}));

export const commentsRelations = relations(t.comments, ({ one, many }) => ({
  workspace: one(t.workspaces, { fields: [t.comments.workspaceId], references: [t.workspaces.id] }),
  parent: one(t.comments, {
    fields: [t.comments.parentId],
    references: [t.comments.id],
    relationName: "reply",
  }),
  replies: many(t.comments, { relationName: "reply" }),
  author: one(t.users, {
    fields: [t.comments.authorId],
    references: [t.users.id],
    relationName: "author",
  }),
  resolvedBy: one(t.users, {
    fields: [t.comments.resolvedById],
    references: [t.users.id],
    relationName: "resolvedBy",
  }),
  mentions: many(t.commentMentions),
}));

export const commentMentionsRelations = relations(t.commentMentions, ({ one }) => ({
  comment: one(t.comments, {
    fields: [t.commentMentions.commentId],
    references: [t.comments.id],
  }),
  user: one(t.users, { fields: [t.commentMentions.userId], references: [t.users.id] }),
}));

export const notificationsRelations = relations(t.notifications, ({ one }) => ({
  user: one(t.users, {
    fields: [t.notifications.userId],
    references: [t.users.id],
    relationName: "recipient",
  }),
  workspace: one(t.workspaces, {
    fields: [t.notifications.workspaceId],
    references: [t.workspaces.id],
  }),
  actor: one(t.users, {
    fields: [t.notifications.actorId],
    references: [t.users.id],
    relationName: "actor",
  }),
  comment: one(t.comments, {
    fields: [t.notifications.commentId],
    references: [t.comments.id],
  }),
  decisionLogEntry: one(t.decisionLogEntries, {
    fields: [t.notifications.decisionLogEntryId],
    references: [t.decisionLogEntries.id],
  }),
}));

export const changeHistoryRelations = relations(t.changeHistory, ({ one }) => ({
  workspace: one(t.workspaces, {
    fields: [t.changeHistory.workspaceId],
    references: [t.workspaces.id],
  }),
  owner: one(t.users, {
    fields: [t.changeHistory.ownerUserId],
    references: [t.users.id],
    relationName: "owner",
  }),
  changedBy: one(t.users, {
    fields: [t.changeHistory.changedById],
    references: [t.users.id],
    relationName: "changedBy",
  }),
  revertedFrom: one(t.changeHistory, {
    fields: [t.changeHistory.revertedFromId],
    references: [t.changeHistory.id],
  }),
}));
