import { isDeepStrictEqual } from "node:util";
import { schema } from "@moonx/db";
import type {
  CreateExecutionItemBody,
  ExecutionStatus,
  ExecutionType,
  LaunchTiming,
  UpdateExecutionItemBody,
  UserRef,
  Versioned,
} from "@moonx/schemas";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { executionItemSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import { assertSameIds } from "./cost-order";
import type { Executor, Tx } from "./db";
import { isoOrNull, versionedOf } from "./dto";
import { checkLock } from "./lock";
import { EXECUTION_ITEM_NO, type ExecutionRow, itemKey } from "./plan-context";
import { touchPlanActivity } from "./plan-write";
import { loadUserRefs } from "./users";

/** SDD 5.9 ExecutionItem. */
export interface ExecutionItem extends Versioned {
  id: string;
  type: ExecutionType;
  title: string;
  assignee: { user: UserRef } | { name: string } | null;
  dueDate: string | null;
  status: ExecutionStatus | null;
  overdue: boolean;
  goal: string | null;
  exitCondition: string | null;
  launchTiming: LaunchTiming | null;
  actions: string | null;
  completionCriteria: string | null;
  kpiArea: string | null;
  kpiTarget: string | null;
  kpiReviewFrequency: string | null;
  kpiActual: string | null;
  kpiActualUpdatedAt: string | null;
  whyItMatters: string | null;
  answer: string | null;
  fromPreset: boolean;
  completedAt: string | null;
  sortOrder: number;
  commentCount: number;
}

const FINISHED = new Set<string>(["done", "resolved"]);

/** Statuses each type may use (SDD 5.9 P9). KPI rows have none. */
const STATUSES: Record<ExecutionType, readonly ExecutionStatus[]> = {
  milestone: ["todo", "doing", "done"],
  launch: ["todo", "doing", "done"],
  kpi: [],
  open_question: ["open", "resolved"],
  next_action: ["todo", "doing", "done"],
};

const DEFAULT_STATUS: Record<ExecutionType, ExecutionStatus | null> = {
  milestone: "todo",
  launch: "todo",
  kpi: null,
  open_question: "open",
  next_action: "todo",
};

type TypeField = keyof Omit<
  UpdateExecutionItemBody,
  "lockVersion" | "force" | "title" | "assigneeUserId" | "assigneeName"
>;

/** The columns of the original tables (design-spec 6.13): a type refuses the other types' columns. */
const TYPE_FIELDS: Record<ExecutionType, readonly TypeField[]> = {
  milestone: ["goal", "exitCondition", "dueDate", "status"],
  launch: ["launchTiming", "actions", "completionCriteria", "dueDate", "status"],
  kpi: ["kpiArea", "kpiTarget", "kpiReviewFrequency", "kpiActual", "status"],
  open_question: ["whyItMatters", "answer", "dueDate", "status"],
  next_action: ["dueDate", "status"],
};

const ALL_TYPE_FIELDS: TypeField[] = [
  "goal",
  "exitCondition",
  "launchTiming",
  "actions",
  "completionCriteria",
  "kpiArea",
  "kpiTarget",
  "kpiReviewFrequency",
  "kpiActual",
  "whyItMatters",
  "answer",
  "dueDate",
  "status",
];

/** 422 for a column the type does not have, so a milestone never carries a KPI target. */
function assertFieldsFit(type: ExecutionType, body: Partial<Record<TypeField, unknown>>): void {
  const refused = ALL_TYPE_FIELDS.filter(
    (field) => body[field] != null && !TYPE_FIELDS[type].includes(field),
  );
  if (refused.length > 0) {
    throw validationFailed(
      refused.map((path) => ({
        path,
        code: "invalid",
        message: `${type} items have no ${path}`,
      })),
    );
  }
}

const sameNull = <T>(value: T | null | undefined): T | null => value ?? null;

/** Execution items of one plan as the screens show them, in the given order. */
export async function buildExecutionItems(
  db: Executor,
  p: { workspaceId: string; today: string },
  rows: ExecutionRow[],
): Promise<ExecutionItem[]> {
  if (rows.length === 0) return [];
  const [refs, comments] = await Promise.all([
    loadUserRefs(
      db,
      rows.flatMap((r) => [r.assigneeUserId, r.updatedById]),
      p.workspaceId,
    ),
    db
      .select({ id: schema.comments.targetId, n: count() })
      .from(schema.comments)
      .where(
        and(
          eq(schema.comments.workspaceId, p.workspaceId),
          eq(schema.comments.targetType, "execution_item"),
          inArray(
            schema.comments.targetId,
            rows.map((r) => r.id),
          ),
          isNull(schema.comments.deletedAt),
        ),
      )
      .groupBy(schema.comments.targetId),
  ]);
  const countOf = new Map(comments.map((c) => [c.id, c.n]));
  return rows.map((row) => {
    const user = row.assigneeUserId ? refs.get(row.assigneeUserId) : undefined;
    const finished = row.status != null && FINISHED.has(row.status);
    return {
      ...versionedOf(row, refs),
      id: row.id,
      type: row.type,
      title: row.title,
      assignee: user ? { user } : row.assigneeName ? { name: row.assigneeName } : null,
      dueDate: row.dueDate ?? null,
      status: row.status ?? null,
      overdue: row.dueDate != null && !finished && row.dueDate < p.today,
      goal: row.goal,
      exitCondition: row.exitCondition,
      launchTiming: row.launchTiming,
      actions: row.actions,
      completionCriteria: row.completionCriteria,
      kpiArea: row.kpiArea,
      kpiTarget: row.kpiTarget,
      kpiReviewFrequency: row.kpiReviewFrequency,
      kpiActual: row.kpiActual,
      kpiActualUpdatedAt: isoOrNull(row.kpiActualUpdatedAt),
      whyItMatters: row.whyItMatters,
      answer: row.answer,
      fromPreset: row.fromPreset,
      completedAt: isoOrNull(row.completedAt),
      sortOrder: row.sortOrder,
      commentCount: countOf.get(row.id) ?? 0,
    };
  });
}

const LAUNCH_ORDER: LaunchTiming[] = [
  "t_minus_30",
  "t_minus_7",
  "launch_day",
  "first_30",
  "days_31_90",
  "other",
];
const TYPE_ORDER: ExecutionType[] = ["milestone", "launch", "kpi", "open_question", "next_action"];

/**
 * The display order of P9: by type, then Next Actions by due date (undated last), launch rows by
 * time bucket, KPIs by Area in the order the Areas first appear; everything else keeps its order.
 */
export function sortExecutionItems<T extends ExecutionRow | ExecutionItem>(items: T[]): T[] {
  const areaOrder = new Map<string, number>();
  for (const item of [...items].sort((a, b) => a.sortOrder - b.sortOrder)) {
    if (item.type === "kpi" && item.kpiArea != null && !areaOrder.has(item.kpiArea)) {
      areaOrder.set(item.kpiArea, areaOrder.size);
    }
  }
  const rank = (item: T): [number, number, number] => {
    const typeRank = TYPE_ORDER.indexOf(item.type);
    if (item.type === "next_action") {
      return [
        typeRank,
        item.dueDate ? Date.parse(item.dueDate) : Number.MAX_SAFE_INTEGER,
        item.sortOrder,
      ];
    }
    if (item.type === "launch") {
      return [typeRank, LAUNCH_ORDER.indexOf(item.launchTiming ?? "other"), item.sortOrder];
    }
    if (item.type === "kpi") {
      return [
        typeRank,
        areaOrder.get(item.kpiArea ?? "") ?? Number.MAX_SAFE_INTEGER,
        item.sortOrder,
      ];
    }
    return [typeRank, 0, item.sortOrder];
  };
  return [...items].sort((a, b) => {
    const [a0, a1, a2] = rank(a);
    const [b0, b1, b2] = rank(b);
    return a0 - b0 || a1 - b1 || a2 - b2;
  });
}

/** Where and by whom an execution item is written. */
export interface ExecutionContext {
  workspaceId: string;
  ideaId: string;
  planId: string;
  actor: HistoryActor;
  now: Date;
  today: string;
}

const historyMeta = (ctx: ExecutionContext, row: Pick<ExecutionRow, "id" | "type">) => ({
  container: { type: "business_plan" as const, id: ctx.planId },
  workspaceId: ctx.workspaceId,
  sectionKey: itemKey(EXECUTION_ITEM_NO[row.type]),
  target: { type: "execution_item" as const, id: row.id },
  actor: ctx.actor,
});

/** `assigneeUserId` must be an Owner or Member of the plan's workspace (SDD 5.9 P9). */
async function assertAssignable(tx: Tx, workspaceId: string, userId: string): Promise<void> {
  const [member] = await tx
    .select({ role: schema.memberships.role })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        eq(schema.memberships.userId, userId),
        inArray(schema.memberships.role, ["owner", "member"]),
        eq(schema.users.status, "active"),
      ),
    );
  if (!member) {
    throw new ApiError(
      "INVALID_ASSIGNEE",
      "The assignee must be an Owner or Member of this workspace",
    );
  }
}

function assertStatus(type: ExecutionType, status: ExecutionStatus | null | undefined): void {
  if (status == null) return;
  if (!STATUSES[type].includes(status)) {
    throw new ApiError("INVALID_STATUS", `${status} is not a status of ${type} items`);
  }
}

function assertOneAssignee(body: { assigneeUserId?: string | null; assigneeName?: string | null }) {
  if (body.assigneeUserId != null && body.assigneeName != null) {
    throw validationFailed([
      {
        path: "assigneeName",
        code: "invalid",
        message: "Give either assigneeUserId or assigneeName, not both",
      },
    ]);
  }
}

async function nextSortOrder(tx: Tx, planId: string, type: ExecutionType): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${schema.executionItems.sortOrder})` })
    .from(schema.executionItems)
    .where(
      and(
        eq(schema.executionItems.businessPlanId, planId),
        eq(schema.executionItems.type, type),
        isNull(schema.executionItems.deletedAt),
      ),
    );
  return (row?.max ?? -1) + 1;
}

async function viewOf(tx: Tx, ctx: ExecutionContext, id: string): Promise<ExecutionItem> {
  const [row] = await tx
    .select()
    .from(schema.executionItems)
    .where(eq(schema.executionItems.id, id));
  const [item] = await buildExecutionItems(
    tx,
    { workspaceId: ctx.workspaceId, today: ctx.today },
    row ? [row] : [],
  );
  return item as ExecutionItem;
}

/** P9 POST. */
export async function createExecutionItem(
  tx: Tx,
  ctx: ExecutionContext,
  body: CreateExecutionItemBody,
): Promise<ExecutionItem> {
  const { type } = body;
  assertOneAssignee(body);
  assertFieldsFit(type, body);
  assertStatus(type, body.status);
  if (body.assigneeUserId) await assertAssignable(tx, ctx.workspaceId, body.assigneeUserId);
  const status = body.status === undefined ? DEFAULT_STATUS[type] : (body.status ?? null);
  const finished = status != null && FINISHED.has(status);
  await lockPlan(tx, ctx.planId);
  const sortOrder = await nextSortOrder(tx, ctx.planId, type);
  const id = crypto.randomUUID();
  await withHistory(tx, historyMeta(ctx, { id, type }), async () => {
    const [row] = await tx
      .insert(schema.executionItems)
      .values({
        id,
        businessPlanId: ctx.planId,
        type,
        title: body.title,
        assigneeUserId: body.assigneeUserId ?? null,
        assigneeName: body.assigneeName ?? null,
        dueDate: body.dueDate ?? null,
        status,
        goal: sameNull(body.goal),
        exitCondition: sameNull(body.exitCondition),
        launchTiming: type === "launch" ? (body.launchTiming ?? "other") : null,
        actions: sameNull(body.actions),
        completionCriteria: sameNull(body.completionCriteria),
        kpiArea: sameNull(body.kpiArea),
        kpiTarget: sameNull(body.kpiTarget),
        kpiReviewFrequency: sameNull(body.kpiReviewFrequency),
        kpiActual: sameNull(body.kpiActual),
        kpiActualUpdatedAt: body.kpiActual ? ctx.now : null,
        whyItMatters: sameNull(body.whyItMatters),
        answer: sameNull(body.answer),
        fromPreset: false,
        completedAt: finished ? ctx.now : null,
        sortOrder,
        lockVersion: 0,
        updatedById: ctx.actor.userId,
      })
      .returning();
    return { result: undefined, before: null, after: executionItemSnapshot(row as ExecutionRow) };
  });
  await touchPlanActivity(tx, ctx, ctx.now);
  return viewOf(tx, ctx, id);
}

/** Locks the plan row: creates and reorders of one plan run one at a time. */
async function lockPlan(tx: Tx, planId: string): Promise<void> {
  await tx
    .select({ id: schema.businessPlans.id })
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.id, planId))
    .for("update");
}

/** The archive re-check for a write that does not touch the plan's activity (design-spec 6.8). */
async function assertPlanWritable(tx: Tx, planId: string): Promise<void> {
  const [row] = await tx
    .select({
      planArchivedAt: schema.businessPlans.archivedAt,
      ideaArchivedAt: schema.ideas.archivedAt,
    })
    .from(schema.businessPlans)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .where(eq(schema.businessPlans.id, planId));
  if (row?.planArchivedAt || row?.ideaArchivedAt) {
    throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  }
}

async function lockItem(tx: Tx, ctx: ExecutionContext, id: string): Promise<ExecutionRow> {
  const [row] = await tx
    .select()
    .from(schema.executionItems)
    .where(
      and(
        eq(schema.executionItems.id, id),
        eq(schema.executionItems.businessPlanId, ctx.planId),
        isNull(schema.executionItems.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  return row;
}

/** P10 PATCH. A request that changes nothing keeps the lock version and writes no history. */
export async function updateExecutionItem(
  tx: Tx,
  ctx: ExecutionContext,
  id: string,
  body: UpdateExecutionItemBody,
): Promise<ExecutionItem> {
  const row = await lockItem(tx, ctx, id);
  assertOneAssignee(body);
  assertFieldsFit(row.type, body);
  assertStatus(row.type, body.status);
  const mismatch = body.lockVersion !== row.lockVersion && !body.force;
  const current = mismatch ? await viewOf(tx, ctx, id) : null;
  const lockVersion = await checkLock(tx, {
    workspaceId: ctx.workspaceId,
    row,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: () => current,
  });
  if (body.assigneeUserId) await assertAssignable(tx, ctx.workspaceId, body.assigneeUserId);

  const pick = <K extends keyof ExecutionRow>(key: K, sent: ExecutionRow[K] | undefined) =>
    sent === undefined ? row[key] : sent;
  // Naming one kind of assignee clears the other; null clears the one named.
  const assigneeUserId =
    body.assigneeUserId !== undefined
      ? body.assigneeUserId
      : body.assigneeName != null
        ? null
        : row.assigneeUserId;
  const assigneeName =
    body.assigneeName !== undefined
      ? body.assigneeName
      : body.assigneeUserId != null
        ? null
        : row.assigneeName;
  const status = pick("status", body.status);
  const wasFinished = row.status != null && FINISHED.has(row.status);
  const isFinished = status != null && FINISHED.has(status);
  const kpiActual = pick("kpiActual", body.kpiActual);
  const next = {
    title: body.title ?? row.title,
    assigneeUserId,
    assigneeName,
    dueDate: pick("dueDate", body.dueDate),
    status,
    goal: pick("goal", body.goal),
    exitCondition: pick("exitCondition", body.exitCondition),
    launchTiming: pick("launchTiming", body.launchTiming),
    actions: pick("actions", body.actions),
    completionCriteria: pick("completionCriteria", body.completionCriteria),
    kpiArea: pick("kpiArea", body.kpiArea),
    kpiTarget: pick("kpiTarget", body.kpiTarget),
    kpiReviewFrequency: pick("kpiReviewFrequency", body.kpiReviewFrequency),
    kpiActual,
    whyItMatters: pick("whyItMatters", body.whyItMatters),
    answer: pick("answer", body.answer),
  };
  const before = executionItemSnapshot(row);
  const after = executionItemSnapshot({ ...row, ...next });
  if (isDeepStrictEqual(before, after)) return viewOf(tx, ctx, id);

  await withHistory(tx, historyMeta(ctx, row), async () => {
    await tx
      .update(schema.executionItems)
      .set({
        ...next,
        kpiActualUpdatedAt:
          kpiActual === row.kpiActual ? row.kpiActualUpdatedAt : kpiActual ? ctx.now : null,
        completedAt: isFinished ? (wasFinished ? row.completedAt : ctx.now) : null,
        lockVersion,
        updatedById: ctx.actor.userId,
        updatedAt: ctx.now,
      })
      .where(eq(schema.executionItems.id, id));
    return { result: undefined, before, after };
  });
  await touchPlanActivity(tx, ctx, ctx.now);
  return viewOf(tx, ctx, id);
}

/** P10 DELETE: a soft delete, so the history can bring the row back. It takes no lock (SDD 5.9). */
export async function deleteExecutionItem(
  tx: Tx,
  ctx: ExecutionContext,
  id: string,
): Promise<void> {
  const row = await lockItem(tx, ctx, id);
  await withHistory(tx, historyMeta(ctx, row), async () => {
    await tx
      .update(schema.executionItems)
      .set({
        deletedAt: ctx.now,
        lockVersion: row.lockVersion + 1,
        updatedById: ctx.actor.userId,
        updatedAt: ctx.now,
      })
      .where(eq(schema.executionItems.id, id));
    return { result: undefined, before: executionItemSnapshot(row), after: null };
  });
  await touchPlanActivity(tx, ctx, ctx.now);
}

/**
 * P11. Rewrites `sort_order` of one type. Like the validation tables' reorder it leaves
 * `lockVersion` and `updated_at` alone and writes no history: moving a row is not editing it, so
 * it does not add "+ changes" to the plan either.
 */
export async function reorderExecutionItems(
  tx: Tx,
  ctx: ExecutionContext,
  type: ExecutionType,
  ids: string[],
): Promise<void> {
  await lockPlan(tx, ctx.planId);
  await assertPlanWritable(tx, ctx.planId);
  const rows = await tx
    .select({ id: schema.executionItems.id })
    .from(schema.executionItems)
    .where(
      and(
        eq(schema.executionItems.businessPlanId, ctx.planId),
        eq(schema.executionItems.type, type),
        isNull(schema.executionItems.deletedAt),
      ),
    );
  assertSameIds(
    rows.map((r) => r.id),
    ids,
  );
  for (const [index, id] of ids.entries()) {
    await tx
      .update(schema.executionItems)
      .set({ sortOrder: index, updatedAt: sql`${schema.executionItems.updatedAt}` })
      .where(eq(schema.executionItems.id, id));
  }
}
