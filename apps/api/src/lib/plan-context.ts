import { schema } from "@moonx/db";
import type { KeyMetrics, ScenarioColumn } from "@moonx/schemas";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import { executionItemSnapshot } from "../history/snapshots";
import type { Executor } from "./db";
import { loadTemplateSections, type TemplateQuestionRow } from "./template";
import {
  computeValidationState,
  loadValidationData,
  type ValidationData,
  type ValidationState,
} from "./validation-data";

export type PlanRow = typeof schema.businessPlans.$inferSelect;
export type PlanAnswerRow = typeof schema.planAnswers.$inferSelect;
export type ExecutionRow = typeof schema.executionItems.$inferSelect;
export type PlanVersionRow = typeof schema.planVersions.$inferSelect;

/** The plan items are numbered 1 to 30; their template sections are keyed `01` to `30`. */
export const itemKey = (itemNo: number) => String(itemNo).padStart(2, "0");

/** The template items that hold each execution type (design-spec 6.12). */
export const EXECUTION_ITEM_NO = {
  milestone: 23,
  launch: 25,
  kpi: 26,
  open_question: 28,
  next_action: 29,
} as const;

/** One execution item as `plan_versions.snapshot` keeps it (SDD 6.3). */
export type SnapshotExecutionItem = ReturnType<typeof executionItemSnapshot> & {
  id?: string;
  sortOrder?: number;
  fromPreset?: boolean;
  completedAt?: string | null;
  kpiActualUpdatedAt?: string | null;
};

/** `plan_versions.snapshot` (SDD 6.3): the plan as it was when the version was saved. */
export interface PlanSnapshot {
  header: { name: string; businessName: string; preparedBy: string };
  answers: { questionKey: string; text: string | null; rows: unknown[] | null }[];
  keyMetrics: KeyMetrics;
  scenarios: ScenarioColumn[];
  execution: SnapshotExecutionItem[];
  competitors: {
    name: string;
    type: string | null;
    typicalPrice: number | null;
    strength: string | null;
    weakness: string | null;
  }[];
}

/** Everything about one plan that its screens and exports read, as stored now. */
export interface PlanBundle {
  plan: PlanRow;
  workspaceId: string;
  workspace: { name: string; currency: string };
  idea: typeof schema.ideas.$inferSelect;
  validationId: string;
  sections: Awaited<ReturnType<typeof loadTemplateSections>>;
  questions: Map<string, TemplateQuestionRow>;
  answers: PlanAnswerRow[];
  execution: ExecutionRow[];
  versions: Omit<PlanVersionRow, "snapshot">[];
  validation: { data: ValidationData; state: ValidationState };
}

/** Reads the plan with its template, answers, execution items, versions and the validation state. */
export async function loadPlanBundle(db: Executor, planId: string): Promise<PlanBundle> {
  const [row] = await db
    .select({
      plan: schema.businessPlans,
      idea: schema.ideas,
      workspaceName: schema.workspaces.name,
      currency: schema.workspaces.currency,
    })
    .from(schema.businessPlans)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.ideas.workspaceId))
    .where(eq(schema.businessPlans.id, planId));
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  const [validation] = await db
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, row.idea.id));
  if (!validation) throw new ApiError("NOT_FOUND", "Resource not found");

  const [sections, answers, execution, versions, validationData] = await Promise.all([
    loadTemplateSections(db, row.plan.templateVersionId),
    db.select().from(schema.planAnswers).where(eq(schema.planAnswers.businessPlanId, planId)),
    db
      .select()
      .from(schema.executionItems)
      .where(
        and(
          eq(schema.executionItems.businessPlanId, planId),
          isNull(schema.executionItems.deletedAt),
        ),
      )
      .orderBy(asc(schema.executionItems.sortOrder), asc(schema.executionItems.createdAt)),
    db
      .select({
        id: schema.planVersions.id,
        businessPlanId: schema.planVersions.businessPlanId,
        versionNumber: schema.planVersions.versionNumber,
        name: schema.planVersions.name,
        savedById: schema.planVersions.savedById,
        savedAt: schema.planVersions.savedAt,
        createdAt: schema.planVersions.createdAt,
        updatedAt: schema.planVersions.updatedAt,
      })
      .from(schema.planVersions)
      .where(eq(schema.planVersions.businessPlanId, planId))
      .orderBy(desc(schema.planVersions.versionNumber)),
    loadValidationData(db, [validation.id]),
  ]);
  const data = validationData.get(validation.id) as ValidationData;
  const questions = new Map(sections.flatMap(({ rows }) => rows.map((q) => [q.key, q] as const)));
  return {
    plan: row.plan,
    workspaceId: row.idea.workspaceId,
    workspace: { name: row.workspaceName, currency: row.currency },
    idea: row.idea,
    validationId: validation.id,
    sections,
    questions,
    answers,
    execution,
    versions,
    validation: {
      data,
      state: computeValidationState(data, {
        workspaceId: row.idea.workspaceId,
        ideaId: row.idea.id,
      }),
    },
  };
}

/** A saved version of this plan with its snapshot; 404 for a version of another plan. */
export async function loadPlanVersion(
  db: Executor,
  planId: string,
  versionId: string,
): Promise<PlanVersionRow & { snapshot: PlanSnapshot }> {
  const [row] = await db
    .select()
    .from(schema.planVersions)
    .where(
      and(eq(schema.planVersions.id, versionId), eq(schema.planVersions.businessPlanId, planId)),
    );
  if (!row) throw new ApiError("NOT_FOUND", "Version not found");
  return row as PlanVersionRow & { snapshot: PlanSnapshot };
}

const ISO = (date: Date | null | undefined) => (date ? date.toISOString() : null);

/** The snapshot of the plan as it is now (SDD 6.3), written when a version is saved. */
export function buildPlanSnapshot(bundle: PlanBundle): PlanSnapshot {
  const { plan, validation } = bundle;
  return {
    header: { name: plan.name, businessName: plan.businessName, preparedBy: plan.preparedBy },
    answers: bundle.answers.map((a) => ({
      questionKey: a.questionKey,
      text: a.text ?? null,
      rows: (a.rows as unknown[] | null) ?? null,
    })),
    keyMetrics: validation.state.keyMetrics,
    scenarios: validation.state.economics.scenarios,
    execution: bundle.execution.map((e) => ({
      ...executionItemSnapshot(e),
      id: e.id,
      sortOrder: e.sortOrder,
      fromPreset: e.fromPreset,
      completedAt: ISO(e.completedAt),
      kpiActualUpdatedAt: ISO(e.kpiActualUpdatedAt),
    })),
    competitors: validation.data.competitors.slice(0, 5).map((c) => ({
      name: c.name,
      type: c.type ?? null,
      typicalPrice: c.typicalPrice ?? null,
      strength: c.strength ?? null,
      weakness: c.weakness ?? null,
    })),
  };
}
