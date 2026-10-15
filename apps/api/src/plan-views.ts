import {
  businessPlans,
  type Database,
  type DatabaseTransaction,
  executionItemContent,
  executionItems,
  loadTemplateSections,
  planAnswers,
  planVersions,
  templateQuestions,
} from "@moonx/db";
import {
  type PlanAnswerContent,
  type PlanQuestion,
  planItemMarks,
  planItemProgress,
} from "@moonx/domain";
import {
  type ExecutionItem,
  type ExecutionType,
  executionTypeSchema,
  type PlanAnswer,
  type PlanHome,
  type PlanSummary,
  type PlanVersionSnapshot,
  type PlanVersionSummary,
  planCopySourceSchema,
  planReferenceSpecSchema,
  planVersionSnapshotSchema,
  type TemplateSection,
  type UserRef,
} from "@moonx/schemas";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DueWindow } from "./due";
import { ApiError } from "./errors";
import {
  findIdea,
  ideaKeyMetrics,
  loadIdeaContexts,
  loadPlans,
  planSummaries,
  templateRef,
} from "./idea-views";
import type { Scope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { type ItemRef, loadCommentCounts } from "./validation-items";

// What the plan routes (P1–P11) read and show: the plan template with what plans add to
// it, the plan, its answers, versions and execution items, and the plan home of 20.

type Executor = Database | DatabaseTransaction;

export type PlanRow = typeof businessPlans.$inferSelect;
export type ExecutionRow = typeof executionItems.$inferSelect;
export type PlanAnswerRow = typeof planAnswers.$inferSelect;

/** A plan item: a section of the plan template, its sub-items with what plans add. */
export interface PlanSection extends Omit<TemplateSection, "questions"> {
  itemNo: number;
  questions: PlanQuestion[];
}

const copyFromSchema = z.array(planCopySourceSchema).nullable();
const referenceSchema = z.array(planReferenceSpecSchema).nullable();

/** The items of the plan template version `versionId`, in template order. */
export async function loadPlanTemplate(
  db: Executor,
  versionId: string,
): Promise<PlanSection[]> {
  const sections =
    (await loadTemplateSections(db, [versionId])).get(versionId) ?? [];
  const extras = new Map(
    (
      await db
        .select({
          key: templateQuestions.questionKey,
          copyFrom: templateQuestions.copyFrom,
          reference: templateQuestions.reference,
        })
        .from(templateQuestions)
        .where(eq(templateQuestions.templateVersionId, versionId))
    ).map((row) => [row.key, row]),
  );
  return sections.map((section) => ({
    ...section,
    itemNo: Number(section.key),
    questions: section.questions.map((question) => ({
      ...question,
      copyFrom: copyFromSchema.parse(
        extras.get(question.key)?.copyFrom ?? null,
      ),
      reference: referenceSchema.parse(
        extras.get(question.key)?.reference ?? null,
      ),
    })),
  }));
}

/** A plan sub-item as screens and the domain read it, without what only plans add. */
export const templateQuestionOf = ({
  copyFrom: _copyFrom,
  reference: _reference,
  ...question
}: PlanQuestion) => question;

/** The question `key` of the plan template `sections`, or undefined. */
export const findPlanQuestion = (
  sections: readonly PlanSection[],
  key: string,
) =>
  sections
    .flatMap((section) => section.questions)
    .find((question) => question.key === key);

/** The plan `planId` when it is not deleted (its creation undone), or undefined. */
async function findPlan(
  db: Executor,
  planId: string,
): Promise<PlanRow | undefined> {
  const [row] = await db
    .select()
    .from(businessPlans)
    .where(and(eq(businessPlans.id, planId), isNull(businessPlans.deletedAt)));
  return row;
}

/** {@link findPlan} for a plan the request was let into, which must exist. */
export async function requirePlan(
  db: Executor,
  planId: string,
): Promise<PlanRow> {
  const plan = await findPlan(db, planId);
  if (plan === undefined) throw new ApiError("NOT_FOUND", "No such plan");
  return plan;
}

/** The answers of `planId` by question key. */
export async function loadPlanAnswers(
  db: Executor,
  planId: string,
): Promise<Map<string, PlanAnswerRow>> {
  const rows = await db
    .select()
    .from(planAnswers)
    .where(eq(planAnswers.businessPlanId, planId));
  return new Map(rows.map((row) => [row.questionKey, row]));
}

/** Every execution item of `planId`, deleted ones included. */
export const loadExecutionRows = (db: Executor, planId: string) =>
  db
    .select()
    .from(executionItems)
    .where(eq(executionItems.businessPlanId, planId));

/** A plan version, which must belong to `planId`. */
export async function findVersion(
  db: Executor,
  planId: string,
  versionId: string,
) {
  const [row] = await db
    .select()
    .from(planVersions)
    .where(
      and(
        eq(planVersions.id, versionId),
        eq(planVersions.businessPlanId, planId),
      ),
    );
  if (row === undefined) {
    throw new ApiError("NOT_FOUND", "No such version of this plan");
  }
  return { row, snapshot: planVersionSnapshotSchema.parse(row.snapshot) };
}

/** The versions of `planId`, newest first (SDD 5.9 PlanVersionSummary). */
export async function versionSummaries(
  db: Executor,
  workspaceId: string,
  planId: string,
): Promise<PlanVersionSummary[]> {
  const rows = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.businessPlanId, planId))
    .orderBy(desc(planVersions.versionNumber));
  const refs = await loadUserRefs(
    db,
    rows.map((row) => row.savedById),
    workspaceId,
  );
  return rows.map((row) => {
    const savedBy = refs.get(row.savedById);
    if (savedBy === undefined) throw new Error(`No user ${row.savedById}`);
    return {
      id: row.id,
      versionNumber: row.versionNumber,
      name: row.name,
      savedBy,
      savedAt: row.savedAt.toISOString(),
    };
  });
}

/** The summary of the plan `planId` (SDD 5.9 PlanSummary), as 13 and 20 list it. */
export async function planSummary(
  db: Executor,
  workspaceId: string,
  plan: PlanRow,
): Promise<PlanSummary> {
  const plans = await loadPlans(db, [plan.ideaId]);
  const state = plans
    .get(plan.ideaId)
    ?.find((candidate) => candidate.id === plan.id);
  if (state === undefined) throw new ApiError("NOT_FOUND", "No such plan");
  const [summary] = await planSummaries(db, workspaceId, [state]);
  if (summary === undefined) throw new Error(`No summary of ${plan.id}`);
  return summary;
}

// ---- Execution items ----

/** An execution item as a view is built from: a stored row, or a version's copy of one. */
export interface ExecutionViewRow
  extends ReturnType<typeof executionItemContent> {
  id: string;
  fromPreset: boolean;
  completedAt: Date | null;
  kpiActualUpdatedAt: Date | null;
  sortOrder: number;
  lockVersion: number;
  updatedAt: Date | null;
  updatedById: string | null;
}

/** A stored execution item as {@link executionItemView} reads it. */
export const storedExecutionRow = (row: ExecutionRow): ExecutionViewRow => ({
  ...executionItemContent(row),
  id: row.id,
  fromPreset: row.fromPreset,
  completedAt: row.completedAt,
  kpiActualUpdatedAt: row.kpiActualUpdatedAt,
  sortOrder: row.sortOrder,
  lockVersion: row.lockVersion,
  updatedAt: row.updatedAt,
  updatedById: row.updatedById,
});

/**
 * A version's copy of an execution item as {@link executionItemView} reads it. A version
 * keeps no lock version or author: it is read only.
 */
export const snapshotExecutionRow = (
  item: PlanVersionSnapshot["execution"][number],
): ExecutionViewRow => ({
  ...item,
  completedAt: item.completedAt === null ? null : new Date(item.completedAt),
  kpiActualUpdatedAt:
    item.kpiActualUpdatedAt === null ? null : new Date(item.kpiActualUpdatedAt),
  lockVersion: 0,
  updatedAt: null,
  updatedById: null,
});

const TYPE_ORDER = new Map(
  executionTypeSchema.options.map((type, index) => [type, index]),
);

/**
 * Execution items in the order of SDD 5.9 P9: by type, Next Actions by due date (none
 * last), the others in the order P11 gave them. Ties go by the order made, which
 * `sortOrder` also keeps for Next Actions.
 */
export function sortExecution<
  R extends {
    id: string;
    type: ExecutionType;
    dueDate: string | null;
    sortOrder: number;
  },
>(rows: readonly R[]): R[] {
  return rows.toSorted((a, b) => {
    const byType =
      (TYPE_ORDER.get(a.type) ?? 0) - (TYPE_ORDER.get(b.type) ?? 0);
    if (byType !== 0) return byType;
    if (a.type === "next_action" && a.dueDate !== b.dueDate) {
      if (a.dueDate === null) return 1;
      if (b.dueDate === null) return -1;
      return a.dueDate < b.dueDate ? -1 : 1;
    }
    return a.sortOrder - b.sortOrder || a.id.localeCompare(b.id);
  });
}

/** Whether an item is due before `today` and not Done or Resolved. */
const isOverdue = (
  item: { dueDate: string | null; status: string | null },
  today: string,
) =>
  item.dueDate !== null &&
  item.dueDate < today &&
  item.status !== "done" &&
  item.status !== "resolved";

/** One execution item (SDD 5.9 ExecutionItem). */
function executionItemView(
  row: ExecutionViewRow,
  context: {
    users: ReadonlyMap<string, UserRef>;
    today: string;
    comments: (ref: ItemRef) => number;
  },
): ExecutionItem {
  const user =
    row.assigneeUserId === null
      ? undefined
      : context.users.get(row.assigneeUserId);
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    assignee:
      user !== undefined
        ? { user }
        : row.assigneeName !== null
          ? { name: row.assigneeName }
          : null,
    dueDate: row.dueDate,
    status: row.status,
    overdue: isOverdue(row, context.today),
    goal: row.goal,
    exitCondition: row.exitCondition,
    launchTiming: row.launchTiming,
    actions: row.actions,
    completionCriteria: row.completionCriteria,
    kpiArea: row.kpiArea,
    kpiTarget: row.kpiTarget,
    kpiReviewFrequency: row.kpiReviewFrequency,
    kpiActual: row.kpiActual,
    kpiActualUpdatedAt: row.kpiActualUpdatedAt?.toISOString() ?? null,
    whyItMatters: row.whyItMatters,
    answer: row.answer,
    fromPreset: row.fromPreset,
    completedAt: row.completedAt?.toISOString() ?? null,
    sortOrder: row.sortOrder,
    commentCount: context.comments({ type: "execution_item", id: row.id }),
    lockVersion: row.lockVersion,
    updatedAt: row.updatedAt?.toISOString() ?? null,
    updatedBy:
      row.updatedById === null
        ? null
        : (context.users.get(row.updatedById) ?? null),
  };
}

/** The ids of `ids` whose execution items are not deleted. */
async function liveExecutionIds(
  db: Executor,
  ids: readonly string[],
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: executionItems.id })
    .from(executionItems)
    .where(
      and(
        inArray(executionItems.id, [...ids]),
        isNull(executionItems.deletedAt),
      ),
    );
  return new Set(rows.map((row) => row.id));
}

/**
 * {@link executionItemView} of each of `rows`, in P9's order, as seen from `workspaceId`.
 * Comments count only on items not deleted.
 */
export async function executionItemViews(
  db: Executor,
  workspaceId: string,
  rows: readonly ExecutionViewRow[],
  today: string,
): Promise<ExecutionItem[]> {
  const users = await loadUserRefs(
    db,
    rows.flatMap((row) =>
      [row.assigneeUserId, row.updatedById].filter((id) => id !== null),
    ),
    workspaceId,
  );
  // A version may hold items deleted since, whose comments C1 no longer gives.
  const live = await liveExecutionIds(
    db,
    rows.map((row) => row.id),
  );
  const comments = await loadCommentCounts(
    db,
    rows
      .filter((row) => live.has(row.id))
      .map((row) => ({ type: "execution_item", id: row.id })),
  );
  return sortExecution(rows).map((row) =>
    executionItemView(row, { users, today, comments }),
  );
}

// ---- Plan answers ----

/** A plan answer as a view is built from: a stored row, or a version's copy of one. */
export interface PlanAnswerViewRow extends PlanAnswerContent {
  copiedFrom: PlanAnswer["copiedFrom"];
  lockVersion: number;
  updatedAt: Date | null;
  updatedById: string | null;
}

const copiedFromSchema = z
  .object({ source: z.string(), copiedAt: z.string() })
  .nullable();

/** A stored plan answer as {@link planAnswerView} reads it. */
export const storedAnswerRow = (row: PlanAnswerRow): PlanAnswerViewRow => ({
  text: row.text,
  rows: row.rows as PlanAnswerContent["rows"],
  copiedFrom: copiedFromSchema.parse(row.copiedFrom ?? null),
  lockVersion: row.lockVersion,
  updatedAt: row.updatedAt,
  updatedById: row.updatedById,
});

/** A version's copy of a plan answer: read only, so without a version or author. */
export const snapshotAnswerRow = (
  answer: PlanVersionSnapshot["answers"][number],
): PlanAnswerViewRow => ({
  text: answer.text,
  rows: answer.rows,
  copiedFrom: null,
  lockVersion: 0,
  updatedAt: null,
  updatedById: null,
});

/** One plan answer (SDD 5.9 PlanAnswer); an unanswered one is empty at version 0. */
export const planAnswerView = (
  planId: string,
  questionKey: string,
  row: PlanAnswerViewRow | undefined,
  context: {
    users: ReadonlyMap<string, UserRef>;
    comments: (ref: ItemRef) => number;
  },
): PlanAnswer => ({
  questionKey,
  text: row?.text ?? null,
  rows: row?.rows ?? null,
  copiedFrom: row?.copiedFrom ?? null,
  commentCount: context.comments({
    type: "plan_answer",
    id: planId,
    key: questionKey,
  }),
  lockVersion: row?.lockVersion ?? 0,
  updatedAt: row?.updatedAt?.toISOString() ?? null,
  updatedBy:
    row?.updatedById == null
      ? null
      : (context.users.get(row.updatedById) ?? null),
});

/** The execution types the execution views of `questions` show. */
export const executionTypesOf = (questions: readonly PlanQuestion[]) =>
  new Set(
    questions.flatMap((question) =>
      question.options?.kind === "execution_view"
        ? [question.options.executionType]
        : [],
    ),
  );

// ---- The order of versions and content changes ("+ changes") ----

const latest = (dates: readonly (Date | null)[]) =>
  dates.reduce<Date | null>(
    (max, date) => (date !== null && (max === null || date > max) ? date : max),
    null,
  );

/** The last change to the plan's header, answers or execution items (deletions too). */
export async function lastContentChange(
  db: Executor,
  plan: PlanRow,
): Promise<Date> {
  const answers = await loadPlanAnswers(db, plan.id);
  const items = await loadExecutionRows(db, plan.id);
  return (
    latest([
      plan.updatedAt,
      ...[...answers.values()].map((row) => row.updatedAt),
      ...items.flatMap((row) => [row.updatedAt, row.deletedAt]),
    ]) ?? plan.updatedAt
  );
}

/**
 * The time a change to the plan's content records (SDD 6.3 末尾「+ changes」): `at`, or
 * just after the plan's latest version when that was saved at `at` or later. A version
 * and a change run one at a time under the plan's lock, but each took its time before
 * waiting for it, perhaps by another instance's clock; a change that commits after a
 * version must read as made after it. Call it under the plan's lock.
 */
export async function planContentTime(
  tx: DatabaseTransaction,
  planId: string,
  at: Date,
): Promise<Date> {
  const [version] = await tx
    .select({ savedAt: planVersions.savedAt })
    .from(planVersions)
    .where(eq(planVersions.businessPlanId, planId))
    .orderBy(desc(planVersions.savedAt))
    .limit(1);
  return version !== undefined && version.savedAt >= at
    ? new Date(version.savedAt.getTime() + 1)
    : at;
}

// ---- 20 Plan home ----

/**
 * Whether the plan is still as the draft made it (SDD 5.9 `draftOnly`): every answer is
 * the draft's copy, never saved since, and every execution item is a starting row never
 * changed, none added or deleted.
 */
const isDraftOnly = (
  answers: Iterable<PlanAnswerRow>,
  execution: readonly ExecutionRow[],
) =>
  [...answers].every(
    (answer) => answer.copiedFrom !== null && answer.lockVersion === 1,
  ) &&
  execution.every(
    (item) =>
      item.fromPreset && item.lockVersion === 0 && item.deletedAt === null,
  );

/**
 * P2 GET: the plan home (SDD 5.9 PlanHome), of a saved version when `versionId` names
 * one. The plan must exist.
 *
 * @throws {ApiError} NOT_FOUND when `versionId` is not a version of the plan
 */
export async function loadPlanHome(
  db: Executor,
  options: {
    scope: Scope;
    planId: string;
    versionId: string | undefined;
    due: DueWindow;
  },
): Promise<PlanHome> {
  const { scope, planId, due } = options;
  const plan = await requirePlan(db, planId);
  const idea = await findIdea(db, plan.ideaId);
  if (idea === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [idea], scope.role);
  const state = context?.plans.find((candidate) => candidate.id === plan.id);
  if (context === undefined || state === undefined) {
    throw new ApiError("NOT_FOUND", "No such plan");
  }
  const [summary] = await planSummaries(db, scope.workspaceId, [state]);
  if (summary === undefined) throw new Error(`No summary of ${planId}`);
  const version =
    options.versionId === undefined
      ? null
      : await findVersion(db, planId, options.versionId);
  const sections = await loadPlanTemplate(db, plan.templateVersionId);
  const answers = await loadPlanAnswers(db, planId);
  const allExecution = await loadExecutionRows(db, planId);
  const liveExecution = allExecution.filter((row) => row.deletedAt === null);

  const shownAnswers = new Map<string, PlanAnswerContent>(
    version === null
      ? [...answers].map(([key, row]) => [key, storedAnswerRow(row)])
      : version.snapshot.answers.map((answer) => [answer.questionKey, answer]),
  );
  const shownTypes =
    version === null
      ? liveExecution.map((row) => row.type)
      : version.snapshot.execution.map((item) => item.type);
  const executionCounts = new Map<ExecutionType, number>();
  for (const type of shownTypes) {
    executionCounts.set(type, (executionCounts.get(type) ?? 0) + 1);
  }

  // The items shown, and of a version only those not deleted since: C1 gives no
  // comments on deleted rows.
  const liveIds = new Set(liveExecution.map((row) => row.id));
  const countedExecution =
    version === null
      ? liveExecution
      : version.snapshot.execution.filter((item) => liveIds.has(item.id));
  const comments = await loadCommentCounts(db, [
    ...sections.flatMap((section) =>
      section.questions.map(
        (question): ItemRef => ({
          type: "plan_answer",
          id: planId,
          key: question.key,
        }),
      ),
    ),
    ...countedExecution.map(
      (row): ItemRef => ({
        type: "execution_item",
        id: row.id,
      }),
    ),
  ]);
  const itemComments = (section: PlanSection) => {
    const types = executionTypesOf(section.questions);
    return (
      section.questions.reduce(
        (sum, question) =>
          sum +
          comments({ type: "plan_answer", id: planId, key: question.key }),
        0,
      ) +
      countedExecution
        .filter((row) => types.has(row.type))
        .reduce(
          (sum, row) => sum + comments({ type: "execution_item", id: row.id }),
          0,
        )
    );
  };

  const parts = (["a", "b"] as const).map((part) => {
    const items = sections
      .filter((section) => section.part === part)
      .map((section) => {
        const { filled, total } = planItemProgress(section.questions, {
          answers: shownAnswers,
          executionCounts,
        });
        return {
          itemNo: section.itemNo,
          title: section.title,
          // A Viewer gets no self-analysis reference (design-spec 6.12), so no [S].
          marks: planItemMarks(section.questions).filter(
            (mark) => mark !== "S" || scope.role !== "viewer",
          ),
          filled,
          total,
          commentCount: itemComments(section),
        };
      });
    return {
      part,
      completeItems: items.filter((item) => item.filled === item.total).length,
      totalItems: items.length,
      items,
    };
  });

  const open = liveExecution.filter(
    (row) =>
      row.dueDate !== null &&
      row.status !== "done" &&
      row.status !== "resolved",
  );
  const refs = await loadUserRefs(
    db,
    plan.updatedById === null ? [] : [plan.updatedById],
    scope.workspaceId,
  );
  const header = version?.snapshot.header ?? plan;
  const lastChange = await lastContentChange(db, plan);
  return {
    ...summary,
    lockVersion: plan.lockVersion,
    updatedAt: plan.updatedAt.toISOString(),
    updatedBy:
      plan.updatedById === null ? null : (refs.get(plan.updatedById) ?? null),
    ideaId: plan.ideaId,
    workspaceId: scope.workspaceId,
    template: await templateRef(db, plan.templateVersionId),
    businessName: header.businessName,
    preparedBy: header.preparedBy,
    date: (version?.row.savedAt ?? lastChange).toISOString(),
    latestDecision: idea.latestDecision,
    ideaArchived: idea.archivedAt !== null,
    draftOnly: isDraftOnly(answers.values(), allExecution),
    viewingVersion:
      version === null
        ? null
        : {
            id: version.row.id,
            name: version.row.name,
            savedAt: version.row.savedAt.toISOString(),
          },
    keyMetrics: ideaKeyMetrics(
      version?.snapshot.keyMetrics ?? context.evaluation.keyMetrics,
    ),
    versions: await versionSummaries(db, scope.workspaceId, planId),
    execution: {
      dueSoon: open.filter(
        (row) =>
          (row.dueDate as string) >= due.today &&
          (row.dueDate as string) <= due.until,
      ).length,
      overdue: open.filter((row) => (row.dueDate as string) < due.today).length,
    },
    parts,
  };
}
