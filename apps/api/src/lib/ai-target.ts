import { schema } from "@moonx/db";
import type { Classification, TemplateKind, TemplateSection, Versioned } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";
import { loadPlanBundle, type PlanBundle } from "./plan-context";
import { buildPlanAnswers } from "./plan-write";
import { buildSelfAnalysisAnswers, ensureSelfAnalysis } from "./self-analysis";
import {
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
  templateVersionId: string;
  templateVersionNumber: number;
  aiPrompt: string;
  currency: string | null;
  sections: { section: TemplateSection; rows: TemplateQuestionRow[] }[];
  answers: Map<string, TargetAnswer>;
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

/** Loads the target of the caller's own self analysis. */
export async function loadSelfAnalysisTarget(db: Executor, userId: string): Promise<AiTarget> {
  const analysis = await ensureSelfAnalysis(db, userId);
  const sections = await loadTemplateSections(db, analysis.templateVersionId);
  const keys = sections.flatMap(({ rows }) => rows.map((q) => q.key));
  const answers = await buildSelfAnalysisAnswers(db, analysis, keys);
  const version = await loadTemplateVersionInfo(db, analysis.templateVersionId);
  return {
    kind: "self_analysis",
    id: analysis.id,
    name: "Self analysis",
    workspaceId: null,
    ideaId: null,
    templateVersionId: analysis.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: analysis.currency,
    sections,
    answers: new Map(
      answers.map((a) => [
        a.questionKey,
        {
          lockVersion: a.lockVersion,
          updatedAt: a.updatedAt,
          updatedBy: a.updatedBy,
          text: a.text,
          amount: a.amount,
          classification: null,
          hidden: false,
        },
      ]),
    ),
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
      currency: schema.workspaces.currency,
    })
    .from(schema.validations)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.validations.ideaId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.ideas.workspaceId))
    .where(eq(schema.validations.id, validationId));
  const sections = await loadTemplateSections(db, data.templateVersionId);
  const answers = await buildValidationAnswers(db, workspaceId, data, data.questions);
  const version = await loadTemplateVersionInfo(db, data.templateVersionId);
  return {
    kind: "validation",
    id: validationId,
    name: idea?.name ?? "Validation",
    workspaceId,
    ideaId: idea?.ideaId ?? null,
    templateVersionId: data.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: idea?.currency ?? null,
    sections,
    answers: new Map(
      answers.map((a) => [
        a.questionKey,
        {
          lockVersion: a.lockVersion,
          updatedAt: a.updatedAt,
          updatedBy: a.updatedBy,
          text: a.text,
          amount: null,
          classification: a.classification,
          hidden: a.hidden,
        },
      ]),
    ),
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
  return {
    kind: "business_plan",
    id: planId,
    name: bundle.plan.name,
    workspaceId: bundle.workspaceId,
    ideaId: bundle.idea.id,
    templateVersionId: bundle.plan.templateVersionId,
    templateVersionNumber: version.versionNumber,
    aiPrompt: version.aiPrompt,
    currency: bundle.workspace.currency,
    sections: bundle.sections,
    answers: new Map(
      answers.map((a) => [
        a.questionKey,
        {
          lockVersion: a.lockVersion,
          updatedAt: a.updatedAt,
          updatedBy: a.updatedBy,
          text: a.text,
          amount: null,
          classification: null,
          hidden: false,
        },
      ]),
    ),
    validation: bundle.validation,
    plan: bundle,
  };
}
