import { schema } from "@moonx/db";
import type { Classification, TemplateKind, TemplateSection, Versioned } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";
import { loadPlanBundle, type PlanBundle } from "./plan-context";
import { buildPlanAnswers } from "./plan-write";
import { buildSelfAnalysisAnswers, ensureSelfAnalysis } from "./self-analysis";
import {
  loadQuestionsFromOtherVersions,
  loadTemplateSections,
  loadTemplateVersionInfo,
  type TemplateQuestionRow,
} from "./template";
import { buildValidationAnswers } from "./validation-answers";
import {
  computeValidationState,
  loadValidationData,
  type ValidationData,
  type ValidationState,
} from "./validation-data";

/** The current content of one question of an AI target. */
export interface TargetAnswer extends Versioned {
  text: string | null;
  amount: number | null;
  /** Validation answers only. */
  classification: Classification | null;
  /** Hidden by a display condition (the OCEAN branch of 02). */
  hidden: boolean;
}

/**
 * What an AI export or import works on: a self analysis, a validation or a plan with its pinned
 * template and the current answer of every question. The kinds differ only in where answers live
 * and who may use them, so X1-X3 read one shape.
 */
export interface AiTarget {
  kind: TemplateKind;
  id: string;
  name: string;
  workspaceId: string | null;
  /** The idea of a validation or plan target. */
  ideaId: string | null;
  /** The idea or plan is archived: the exchange can be read but not applied (design-spec 6.8). */
  archived: boolean;
  templateVersionId: string;
  templateVersionNumber: number;
  aiPrompt: string;
  currency: string | null;
  sections: { section: TemplateSection; rows: TemplateQuestionRow[] }[];
  answers: Map<string, TargetAnswer>;
  /**
   * Answers the pinned version no longer asks for (a template migration hid them): the question
   * as the version that had it defined it, and what is stored. X2 lists them as hidden and X3
   * refuses them; exports skip them.
   */
  migrationHidden: { question: TemplateQuestionRow; answer: TargetAnswer }[];
  /** The validation behind a validation or plan target: what the reference and the F/A/U rules read. */
  validation: { data: ValidationData; state: ValidationState } | null;
  plan: PlanBundle | null;
}

/** Questions the text-based exchange can carry (design-spec 6.6 "取り込める項目"). */
export const IMPORTABLE_TYPES = new Set([
  "long_text",
  "short_text",
  "choice",
  "amount_with_reason",
]);

/** The importable questions that have a stored answer but are not in the pinned version. */
async function loadMigrationHidden(
  db: Executor,
  versionId: string,
  currentKeys: Set<string>,
  storedKeys: string[],
  build: (questions: TemplateQuestionRow[]) => Promise<TargetAnswer[]>,
): Promise<AiTarget["migrationHidden"]> {
  const gone = [...new Set(storedKeys)].filter((key) => !currentKeys.has(key));
  const questions = (await loadQuestionsFromOtherVersions(db, versionId, gone)).filter((q) =>
    IMPORTABLE_TYPES.has(q.answerType),
  );
  if (questions.length === 0) return [];
  const answers = await build(questions);
  // `build` answers in the order of the questions it is given; a mismatch would pair answers with
  // the wrong questions.
  if (answers.length !== questions.length) {
    throw new Error("Answer builder returned a different number of answers than questions");
  }
  return questions.map((question, i) => ({
    question,
    answer: { ...(answers[i] as TargetAnswer), hidden: true },
  }));
}

/** Loads the target of the caller's own self analysis. */
export async function loadSelfAnalysisTarget(db: Executor, userId: string): Promise<AiTarget> {
  const analysis = await ensureSelfAnalysis(db, userId);
  const sections = await loadTemplateSections(db, analysis.templateVersionId);
  const keys = sections.flatMap(({ rows }) => rows.map((q) => q.key));
  const answers = await buildSelfAnalysisAnswers(db, analysis, keys);
  const version = await loadTemplateVersionInfo(db, analysis.templateVersionId);
  const toTarget = (a: Awaited<ReturnType<typeof buildSelfAnalysisAnswers>>[number]) => ({
    lockVersion: a.lockVersion,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    text: a.text,
    amount: a.amount,
    classification: null,
    hidden: false,
  });
  const stored = await db
    .select({ key: schema.selfAnalysisAnswers.questionKey })
    .from(schema.selfAnalysisAnswers)
    .where(eq(schema.selfAnalysisAnswers.selfAnalysisId, analysis.id));
  const migrationHidden = await loadMigrationHidden(
    db,
    analysis.templateVersionId,
    new Set(keys),
    stored.map((r) => r.key),
    async (questions) =>
      (
        await buildSelfAnalysisAnswers(
          db,
          analysis,
          questions.map((q) => q.key),
        )
      ).map(toTarget),
  );
  return {
    kind: "self_analysis",
    id: analysis.id,
    name: "Self analysis",
    workspaceId: null,
    ideaId: null,
    archived: false,
    templateVersionId: analysis.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: analysis.currency,
    sections,
    answers: new Map(answers.map((a) => [a.questionKey, toTarget(a)])),
    migrationHidden,
    validation: null,
    plan: null,
  };
}

/** Loads the target of a validation the caller may reach (the caller resolved the scope). */
export async function loadValidationTarget(
  db: Executor,
  validationId: string,
  workspaceId: string,
): Promise<AiTarget> {
  const data = (await loadValidationData(db, [validationId])).get(validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  const [idea] = await db
    .select({
      ideaId: schema.ideas.id,
      name: schema.ideas.name,
      archivedAt: schema.ideas.archivedAt,
      currency: schema.workspaces.currency,
    })
    .from(schema.validations)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.validations.ideaId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.ideas.workspaceId))
    .where(eq(schema.validations.id, validationId));
  const sections = await loadTemplateSections(db, data.templateVersionId);
  const answers = await buildValidationAnswers(db, workspaceId, data, data.questions);
  const version = await loadTemplateVersionInfo(db, data.templateVersionId);
  const toTarget = (a: Awaited<ReturnType<typeof buildValidationAnswers>>[number]) => ({
    lockVersion: a.lockVersion,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    text: a.text,
    amount: null,
    classification: a.classification,
    hidden: a.hidden,
  });
  const migrationHidden = await loadMigrationHidden(
    db,
    data.templateVersionId,
    new Set(data.questions.map((q) => q.key)),
    data.answers.map((a) => a.questionKey),
    async (questions) =>
      (await buildValidationAnswers(db, workspaceId, data, questions)).map(toTarget),
  );
  return {
    kind: "validation",
    id: validationId,
    name: idea?.name ?? "Validation",
    workspaceId,
    ideaId: idea?.ideaId ?? null,
    archived: idea?.archivedAt != null,
    templateVersionId: data.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: idea?.currency ?? null,
    sections,
    answers: new Map(answers.map((a) => [a.questionKey, toTarget(a)])),
    migrationHidden,
    validation: {
      data,
      state: computeValidationState(data, { workspaceId, ideaId: idea?.ideaId as string }),
    },
    plan: null,
  };
}

/** Loads the target of a plan the caller may reach (the caller resolved the scope). */
export async function loadPlanTarget(db: Executor, planId: string): Promise<AiTarget> {
  const bundle = await loadPlanBundle(db, planId);
  const keys = bundle.sections.flatMap(({ rows }) => rows.map((q) => q.key));
  const answers = await buildPlanAnswers(db, bundle.workspaceId, planId, bundle.answers, keys);
  const version = await loadTemplateVersionInfo(db, bundle.plan.templateVersionId);
  const toTarget = (a: Awaited<ReturnType<typeof buildPlanAnswers>>[number]) => ({
    lockVersion: a.lockVersion,
    updatedAt: a.updatedAt,
    updatedBy: a.updatedBy,
    text: a.text,
    amount: null,
    classification: null,
    hidden: false,
  });
  const migrationHidden = await loadMigrationHidden(
    db,
    bundle.plan.templateVersionId,
    new Set(keys),
    bundle.answers.map((a) => a.questionKey),
    async (questions) =>
      (
        await buildPlanAnswers(
          db,
          bundle.workspaceId,
          planId,
          bundle.answers,
          questions.map((q) => q.key),
        )
      ).map(toTarget),
  );
  return {
    kind: "business_plan",
    id: planId,
    name: bundle.plan.name,
    workspaceId: bundle.workspaceId,
    ideaId: bundle.idea.id,
    archived: bundle.idea.archivedAt != null || bundle.plan.archivedAt != null,
    templateVersionId: bundle.plan.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: bundle.workspace.currency,
    sections: bundle.sections,
    answers: new Map(answers.map((a) => [a.questionKey, toTarget(a)])),
    migrationHidden,
    validation: bundle.validation,
    plan: bundle,
  };
}
