import {
  businessPlans,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  executionItems,
  ideas,
  type LoadedValidation,
  loadValidations,
  planAnswers,
  planVersions,
  templates,
  templateVersions,
  validations,
  validationView,
} from "@moonx/db";
import {
  evaluateValidation,
  ideaStage,
  keyMetricOf,
  type ValidationEvaluation,
} from "@moonx/domain";
import {
  type DecisionLogSummary,
  EXCERPT_MAX,
  fitWithSuffix,
  type GoNoGoValue,
  type IdeaDetail,
  type IdeaKeyMetrics,
  type IdeaSummary,
  type KeyMetrics,
  type PlanSummary,
  type Role,
  type Stage,
  type TemplateKind,
  type TemplateRef,
  type UserRef,
} from "@moonx/schemas";
import { and, asc, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { loadUserRefs } from "./user-refs";

type Executor = Database | DatabaseTransaction;

export type IdeaRow = typeof ideas.$inferSelect;

/** A plan of an idea that is not deleted, with what lists show of it. */
export interface PlanState {
  id: string;
  name: string;
  archived: boolean;
  updatedAt: Date;
  latestVersion: { id: string; name: string; savedAt: Date } | null;
  latestGoNoGo: {
    value: GoNoGoValue;
    recordedAt: Date;
    recordedById: string;
  } | null;
}

/** One idea with its validation evaluated and its plans, as the views are built from. */
export interface IdeaContext {
  row: IdeaRow;
  loaded: LoadedValidation;
  evaluation: ValidationEvaluation;
  /** Not deleted, in the order they were made. */
  plans: PlanState[];
}

/** The plans of `ideaIds` not deleted, in the order they were made. */
export async function loadPlans(
  db: Executor,
  ideaIds: readonly string[],
): Promise<Map<string, PlanState[]>> {
  const rows = await db
    .select({
      id: businessPlans.id,
      ideaId: businessPlans.ideaId,
      name: businessPlans.name,
      archivedAt: businessPlans.archivedAt,
      updatedAt: businessPlans.updatedAt,
    })
    .from(businessPlans)
    .where(
      and(
        inArray(businessPlans.ideaId, [...ideaIds]),
        isNull(businessPlans.deletedAt),
      ),
    )
    .orderBy(asc(businessPlans.createdAt), asc(businessPlans.id));
  const planIds = rows.map((row) => row.id);
  const versions =
    planIds.length === 0
      ? []
      : await db
          .selectDistinctOn([planVersions.businessPlanId], {
            planId: planVersions.businessPlanId,
            id: planVersions.id,
            name: planVersions.name,
            savedAt: planVersions.savedAt,
          })
          .from(planVersions)
          .where(inArray(planVersions.businessPlanId, planIds))
          .orderBy(
            asc(planVersions.businessPlanId),
            desc(planVersions.versionNumber),
          );
  const goNoGos =
    planIds.length === 0
      ? []
      : await db
          .selectDistinctOn([decisionLogEntries.businessPlanId], {
            planId: decisionLogEntries.businessPlanId,
            value: decisionLogEntries.value,
            recordedAt: decisionLogEntries.recordedAt,
            recordedById: decisionLogEntries.recordedById,
          })
          .from(decisionLogEntries)
          .where(
            and(
              inArray(decisionLogEntries.businessPlanId, planIds),
              eq(decisionLogEntries.kind, "go_no_go"),
            ),
          )
          .orderBy(
            asc(decisionLogEntries.businessPlanId),
            desc(decisionLogEntries.recordedAt),
            desc(decisionLogEntries.createdAt),
            desc(decisionLogEntries.id),
          );
  const versionOf = new Map(versions.map((v) => [v.planId, v]));
  const goNoGoOf = new Map(goNoGos.map((g) => [g.planId, g]));
  const plans = new Map<string, PlanState[]>();
  for (const row of rows) {
    const version = versionOf.get(row.id);
    const goNoGo = goNoGoOf.get(row.id);
    const list = plans.get(row.ideaId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      archived: row.archivedAt !== null,
      updatedAt: row.updatedAt,
      latestVersion:
        version === undefined
          ? null
          : { id: version.id, name: version.name, savedAt: version.savedAt },
      latestGoNoGo:
        goNoGo === undefined
          ? null
          : {
              value: goNoGo.value as GoNoGoValue,
              recordedAt: goNoGo.recordedAt,
              recordedById: goNoGo.recordedById,
            },
    });
    plans.set(row.ideaId, list);
  }
  return plans;
}

/**
 * Reads and evaluates the validations of `rows` and their plans in a fixed number of
 * queries (SDD 7.3), as `role` sees them: the links of the checks and Next steps depend
 * on whether the caller can write.
 */
export async function loadIdeaContexts(
  db: Executor,
  rows: readonly IdeaRow[],
  role: Role,
): Promise<IdeaContext[]> {
  if (rows.length === 0) return [];
  const ideaIds = rows.map((row) => row.id);
  const validationRows = await db
    .select({ id: validations.id, ideaId: validations.ideaId })
    .from(validations)
    .where(inArray(validations.ideaId, ideaIds));
  const validationOf = new Map(validationRows.map((v) => [v.ideaId, v.id]));
  const loaded = await loadValidations(
    db,
    validationRows.map((v) => v.id),
  );
  const plans = await loadPlans(db, ideaIds);
  return rows.map((row) => {
    const validation = loaded.get(validationOf.get(row.id) ?? "");
    if (validation === undefined)
      throw new Error(`Idea ${row.id} has no validation`);
    return {
      row,
      loaded: validation,
      evaluation: evaluateValidation(
        validation.state,
        validationView(validation, role),
      ),
      plans: plans.get(row.id) ?? [],
    };
  });
}

/** The stage of each idea of `ideaIds` (design-spec 6.8), from its plans. */
export async function loadStages(
  db: Executor,
  ideaIds: readonly string[],
): Promise<Map<string, Stage>> {
  const plans = ideaIds.length === 0 ? new Map() : await loadPlans(db, ideaIds);
  return new Map(ideaIds.map((id) => [id, stageOf(plans.get(id) ?? [])]));
}

const stageOf = (plans: readonly PlanState[]) =>
  ideaStage(
    plans.map((plan) => ({
      archived: plan.archived,
      latestGoNoGo: plan.latestGoNoGo?.value ?? null,
    })),
  );

/** The four key metrics of a list of ideas and of 13 (SDD 5.6). */
export const ideaKeyMetrics = (metrics: KeyMetrics): IdeaKeyMetrics => ({
  initial_cost_total: keyMetricOf(metrics, "initial_cost_total"),
  break_even_units_day: keyMetricOf(metrics, "break_even_units_day"),
  expected_operating_profit: keyMetricOf(metrics, "expected_operating_profit"),
  payback_months: keyMetricOf(metrics, "payback_months"),
});

const required = <T>(map: Map<string, T>, id: string, what: string): T => {
  const value = map.get(id);
  if (value === undefined) throw new Error(`No ${what} ${id}`);
  return value;
};

/**
 * The summaries of `contexts` (SDD 5.6 IdeaSummary), all in `workspaceId`, whose
 * people show as members or former members of it.
 */
export async function ideaSummaries(
  db: Executor,
  workspaceId: string,
  contexts: readonly IdeaContext[],
): Promise<IdeaSummary[]> {
  const refs = await loadUserRefs(
    db,
    contexts.map((context) => context.row.proposerId),
    workspaceId,
  );
  return contexts.map((context) => summaryOf(context, refs));
}

function summaryOf(
  { row, evaluation, plans }: IdeaContext,
  refs: Map<string, UserRef>,
): IdeaSummary {
  return {
    id: row.id,
    name: row.name,
    oneLineConcept: row.oneLineConcept,
    proposer: required(refs, row.proposerId, "user"),
    stage: stageOf(plans),
    latestDecision: row.latestDecision,
    archived: row.archivedAt !== null,
    checks: evaluation.checks.map(({ key, state, params }) => ({
      key,
      state,
      params,
    })),
    keyMetrics: ideaKeyMetrics(evaluation.keyMetrics),
    plans: plans
      .filter((plan) => !plan.archived)
      .map((plan) => ({
        id: plan.id,
        name: plan.name,
        latestVersionName: plan.latestVersion?.name ?? null,
        latestGoNoGo: plan.latestGoNoGo?.value ?? null,
      })),
    lastActivityAt: row.lastActivityAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

/** The detail of one idea (SDD 5.6 IdeaDetail), as seen from its workspace. */
export async function ideaDetail(
  db: Executor,
  context: IdeaContext,
): Promise<IdeaDetail> {
  const { row } = context;
  const refs = await loadUserRefs(
    db,
    [row.proposerId, ...(row.updatedById === null ? [] : [row.updatedById])],
    row.workspaceId,
  );
  const [source] =
    row.duplicatedFromId === null
      ? []
      : await db
          .select({ id: ideas.id, name: ideas.name })
          .from(ideas)
          .where(
            and(eq(ideas.id, row.duplicatedFromId), isNull(ideas.deletedAt)),
          );
  return {
    ...summaryOf(context, refs),
    workspaceId: row.workspaceId,
    validationId: context.loaded.validationId,
    proposedSolution: row.proposedSolution,
    duplicatedFrom: source ?? null,
    lockVersion: row.lockVersion,
    updatedAt: row.updatedAt.toISOString(),
    updatedBy:
      row.updatedById === null ? null : (refs.get(row.updatedById) ?? null),
  };
}

/** One idea, not deleted, or undefined. */
export async function findIdea(
  db: Executor,
  ideaId: string,
): Promise<IdeaRow | undefined> {
  const [row] = await db
    .select()
    .from(ideas)
    .where(and(eq(ideas.id, ideaId), isNull(ideas.deletedAt)));
  return row;
}

/** {@link ideaDetail} of the idea `ideaId`, which must exist, as `role` sees it. */
export async function loadIdeaDetail(
  db: Executor,
  ideaId: string,
  role: Role,
): Promise<IdeaDetail> {
  const row = await findIdea(db, ideaId);
  if (row === undefined) throw new Error(`No idea ${ideaId}`);
  const [context] = await loadIdeaContexts(db, [row], role);
  if (context === undefined) throw new Error(`No context for idea ${ideaId}`);
  return ideaDetail(db, context);
}

/**
 * Whether a plan changed after its latest version was saved (SDD 6.3「+ changes」): an
 * answer, the header or an execution item updated, added or deleted since.
 */
async function changedSinceVersion(
  db: Executor,
  plans: readonly PlanState[],
): Promise<Set<string>> {
  const saved = plans.filter((plan) => plan.latestVersion !== null);
  if (saved.length === 0) return new Set();
  const changed = new Set(
    saved
      .filter(
        (plan) =>
          plan.latestVersion !== null &&
          plan.updatedAt > plan.latestVersion.savedAt,
      )
      .map((plan) => plan.id),
  );
  const ids = saved.map((plan) => plan.id);
  const latestOf = async (
    rows: Promise<{ planId: string; at: Date | null }[]>,
  ) => new Map((await rows).map((row) => [row.planId, row.at]));
  const answers = await latestOf(
    db
      .select({
        planId: planAnswers.businessPlanId,
        at: sql<Date | null>`max(${planAnswers.updatedAt})`.mapWith(
          planAnswers.updatedAt,
        ),
      })
      .from(planAnswers)
      .where(inArray(planAnswers.businessPlanId, ids))
      .groupBy(planAnswers.businessPlanId),
  );
  const items = await latestOf(
    db
      .select({
        planId: executionItems.businessPlanId,
        at: sql<Date | null>`max(greatest(${executionItems.updatedAt}, ${executionItems.deletedAt}))`.mapWith(
          executionItems.updatedAt,
        ),
      })
      .from(executionItems)
      .where(inArray(executionItems.businessPlanId, ids))
      .groupBy(executionItems.businessPlanId),
  );
  for (const plan of saved) {
    const since = plan.latestVersion?.savedAt;
    if (since === undefined) continue;
    const after = (at: Date | null | undefined) => at != null && at > since;
    if (after(answers.get(plan.id)) || after(items.get(plan.id)))
      changed.add(plan.id);
  }
  return changed;
}

/** The plans of 13 (SDD 5.9 PlanSummary), in `workspaceId`. */
export async function planSummaries(
  db: Executor,
  workspaceId: string,
  plans: readonly PlanState[],
): Promise<PlanSummary[]> {
  const changed = await changedSinceVersion(db, plans);
  const refs = await loadUserRefs(
    db,
    plans.flatMap((plan) =>
      plan.latestGoNoGo === null ? [] : [plan.latestGoNoGo.recordedById],
    ),
    workspaceId,
  );
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    archived: plan.archived,
    latestVersion:
      plan.latestVersion === null
        ? null
        : {
            id: plan.latestVersion.id,
            name: plan.latestVersion.name,
            savedAt: plan.latestVersion.savedAt.toISOString(),
          },
    hasChangesSinceVersion: changed.has(plan.id),
    latestGoNoGo:
      plan.latestGoNoGo === null
        ? null
        : {
            value: plan.latestGoNoGo.value,
            recordedAt: plan.latestGoNoGo.recordedAt.toISOString(),
            recordedBy: required(refs, plan.latestGoNoGo.recordedById, "user"),
          },
  }));
}

/**
 * The template version a validation, self-analysis or plan pins, and the newest
 * published version of the same template when it is newer (SDD 5.2 TemplateRef).
 */
export async function templateRef(
  db: Executor,
  versionId: string,
): Promise<TemplateRef> {
  const [pinned] = await db
    .select({
      templateId: templateVersions.templateId,
      versionNumber: templateVersions.versionNumber,
    })
    .from(templateVersions)
    .where(eq(templateVersions.id, versionId));
  if (pinned === undefined) throw new Error(`No template version ${versionId}`);
  const [newer] = await db
    .select({
      versionId: templateVersions.id,
      versionNumber: templateVersions.versionNumber,
    })
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, pinned.templateId),
        eq(templateVersions.status, "published"),
        gt(templateVersions.versionNumber, pinned.versionNumber),
      ),
    )
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);
  return {
    versionId,
    versionNumber: pinned.versionNumber,
    newerVersion: newer ?? null,
  };
}

/**
 * The newest published version of the `kind` template, which a new validation,
 * self-analysis or plan pins; undefined before the operator publishes one.
 */
export async function latestTemplateVersion(db: Executor, kind: TemplateKind) {
  const [version] = await db
    .select({ id: templateVersions.id })
    .from(templateVersions)
    .innerJoin(templates, eq(templates.id, templateVersions.templateId))
    .where(
      and(eq(templates.kind, kind), eq(templateVersions.status, "published")),
    )
    .orderBy(desc(templateVersions.versionNumber))
    .limit(1);
  return version;
}

/**
 * The start of a reason, at most {@link EXCERPT_MAX} characters with "…" when cut, for
 * lists that show one or two lines of it (design-spec 6.15).
 */
export const excerpt = (text: string | null): string | null => {
  if (text === null) return null;
  const fitted = fitWithSuffix(text, "", EXCERPT_MAX);
  return fitted === text ? text : fitWithSuffix(text, "…", EXCERPT_MAX);
};

type DecisionRow = typeof decisionLogEntries.$inferSelect;

/**
 * The summaries of decision log entries (SDD 5.11 DecisionLogSummary), in the order
 * given, with their idea, plan and version names, as seen from `workspaceId`.
 */
export async function decisionSummaries(
  db: Executor,
  workspaceId: string,
  entries: readonly DecisionRow[],
): Promise<DecisionLogSummary[]> {
  if (entries.length === 0) return [];
  const names = async (
    table: typeof ideas | typeof businessPlans,
    ids: (string | null)[],
  ) => {
    const present = [...new Set(ids.filter((id) => id !== null))];
    if (present.length === 0) return new Map<string, string>();
    const rows = await db
      .select({ id: table.id, name: table.name })
      .from(table as typeof ideas)
      .where(inArray(table.id, present));
    return new Map(rows.map((row) => [row.id, row.name]));
  };
  const ideaNames = await names(
    ideas,
    entries.map((entry) => entry.ideaId),
  );
  const planNames = await names(
    businessPlans,
    entries.map((entry) => entry.businessPlanId),
  );
  const versionIds = [
    ...new Set(
      entries.flatMap((entry) =>
        entry.planVersionId === null ? [] : [entry.planVersionId],
      ),
    ),
  ];
  const versionNames =
    versionIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db
              .select({ id: planVersions.id, name: planVersions.name })
              .from(planVersions)
              .where(inArray(planVersions.id, versionIds))
          ).map((row) => [row.id, row.name]),
        );
  const refs = await loadUserRefs(
    db,
    entries.map((entry) => entry.recordedById),
    workspaceId,
  );
  return entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    value: entry.value,
    versionName:
      entry.planVersionId === null
        ? null
        : (versionNames.get(entry.planVersionId) ?? null),
    idea: {
      id: entry.ideaId,
      name: required(ideaNames, entry.ideaId, "idea"),
    },
    plan:
      entry.businessPlanId === null
        ? null
        : {
            id: entry.businessPlanId,
            name: required(planNames, entry.businessPlanId, "plan"),
          },
    reasonExcerpt: excerpt(entry.reason),
    recordedBy: required(refs, entry.recordedById, "user"),
    recordedAt: entry.recordedAt.toISOString(),
  }));
}

/** The latest decisions on an idea first: by when they were recorded, then made. */
export const newestDecisionFirst = [
  desc(decisionLogEntries.recordedAt),
  desc(decisionLogEntries.createdAt),
  desc(decisionLogEntries.id),
] as const;
