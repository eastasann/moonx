import {
  businessPlanContent,
  businessPlans,
  changeHistory,
  comments,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  ideaContent,
  ideas,
  loadTemplateSections,
  planVersions,
  selfAnalyses,
  validations,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  type HistoryEntry,
  type HistoryQuery,
  historyBatchParamsSchema,
  historyBatchRevertResultSchema,
  historyEntryParamsSchema,
  historyPageSchema,
  historyQuerySchema,
  historyRevertResultSchema,
  type TargetRef,
  type UserRef,
  uuidSchema,
} from "@moonx/schemas";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  ne,
  or,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia } from "elysia";
import type { AccessPlugin, Caller, ScopeLocator } from "./access";
import { requestContext } from "./entry";
import { ApiError, isLockNotAvailable } from "./errors";
import {
  type HistoryChange,
  type HistoryContainer,
  type HistoryOperation,
  withHistory,
} from "./history";
import { loadItemLabels } from "./labels";
import { advisoryLock, lockActiveCaller } from "./lock";
import { lockMembers } from "./membership";
import { planContentTime } from "./plan-views";
import { type Restoration, restoreItem, type StoredItem } from "./revert";
import { type Scope, type ScopeRef, writeInScope } from "./scope";
import { inSections } from "./screen-sections";
import { lockSelfAnalysis, startIfAnswered } from "./self-analysis";
import { locateTarget, selfAnalysisOwner } from "./targets";
import { loadUserRefs } from "./user-refs";
import { itemKey } from "./validation-items";
import { invalid } from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type HistoryRow = typeof changeHistory.$inferSelect;

const targetOf = (row: HistoryRow): TargetRef => ({
  type: row.targetType as TargetRef["type"],
  id: row.targetId,
  key: row.targetKey,
});

/**
 * The row undoing a duplicate or a plan draft writes under the idea it came from (SDD
 * 5.11「作成の取り消し」): no revert brings what it removed back.
 */
const undoesCreation = (row: HistoryRow) =>
  row.source === "revert" &&
  row.action === "delete" &&
  row.batchId === null &&
  row.revertedFromId !== null &&
  (row.targetType === "idea" || row.targetType === "business_plan");

/** The scope a container's history is written and read in; null for a self-analysis. */
const containerScope = (
  type: HistoryRow["containerType"],
  id: string,
): ScopeRef | null =>
  type === "validation"
    ? { validationId: id }
    : type === "business_plan"
      ? { planId: id }
      : type === "idea"
        ? { ideaId: id }
        : null;

/**
 * A self-analysis's history is its owner's alone (SDD 7.1).
 *
 * @throws {ApiError} NOT_FOUND when there is no such self-analysis, FORBIDDEN for anyone
 * but its owner
 */
async function admitOwner(
  db: Executor,
  selfAnalysisId: string,
  caller: Caller,
) {
  const owner = await selfAnalysisOwner(db, selfAnalysisId);
  if (owner === null) throw new ApiError("NOT_FOUND", "No such self-analysis");
  if (owner !== caller.id) {
    throw new ApiError(
      "FORBIDDEN",
      "Only its owner sees a self-analysis's history",
    );
  }
}

/** Finds whose history H1 reads: an item's, or a screen's. */
const historyLocator: ScopeLocator = async ({ query, caller, db }) => {
  const q = query as HistoryQuery;
  if (q.targetType !== undefined && q.targetId !== undefined) {
    const place = await locateTarget(db, {
      type: q.targetType,
      id: q.targetId,
      key: q.targetKey,
    });
    if (place === null) throw new ApiError("NOT_FOUND", "No such item");
    if (place.scope === null) {
      await admitOwner(db, place.container.id, caller);
      return null;
    }
    return place.scope;
  }
  const type = q.containerType as HistoryRow["containerType"];
  const id = q.containerId as string;
  const scope = containerScope(type, id);
  if (scope === null) await admitOwner(db, id, caller);
  return scope;
};

/** The history row `id`, or undefined when there is none or `id` is no UUID. */
async function findEntry(
  db: Executor,
  id: string,
): Promise<HistoryRow | undefined> {
  if (!uuidSchema.safeParse(id).success) return undefined;
  const [row] = await db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.id, id));
  return row;
}

/** Finds the container of the history row H2 reverts. */
const entryLocator: ScopeLocator = async ({ params, caller, db }) => {
  const row = await findEntry(db, params.entryId ?? "");
  if (row === undefined) throw new ApiError("NOT_FOUND", "No such change");
  const scope = containerScope(row.containerType, row.containerId);
  if (scope === null) await admitOwner(db, row.containerId, caller);
  return scope;
};

/** The rows of one operation, oldest first. */
async function batchRows(db: Executor, batchId: string): Promise<HistoryRow[]> {
  if (!uuidSchema.safeParse(batchId).success) return [];
  return db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.batchId, batchId))
    .orderBy(asc(changeHistory.changedAt), asc(changeHistory.id));
}

/** What a duplicate or a plan draft made: the row that created it. */
function creationOf(rows: readonly HistoryRow[]): HistoryRow | null {
  const source = rows[0]?.source;
  if (source !== "duplicate" && source !== "plan_draft") return null;
  const type = source === "duplicate" ? "idea" : "business_plan";
  const created = rows.find(
    (row) => row.targetType === type && row.action === "create",
  );
  if (created === undefined) {
    throw new Error(`The ${source} batch has no ${type} it made`);
  }
  return created;
}

/** Whether the creation `created` was undone (SDD 5.11). */
async function creationUndone(
  db: Executor,
  created: HistoryRow,
): Promise<boolean> {
  const rows = await db
    .select()
    .from(changeHistory)
    .where(eq(changeHistory.revertedFromId, created.id));
  return rows.some(undoesCreation);
}

/**
 * Finds the scope of the operation H3 reverts: what a duplicate or plan draft made, its
 * container otherwise. A creation already undone has nothing left to scope it, so the
 * workspace lets its members in to hear 409 ALREADY_REVERTED.
 */
const batchLocator: ScopeLocator = async ({ params, caller, db }) => {
  const rows = await batchRows(db, params.batchId ?? "");
  const first = rows[0];
  if (first === undefined) throw new ApiError("NOT_FOUND", "No such operation");
  const created = creationOf(rows);
  if (created !== null) {
    if (await creationUndone(db, created)) {
      return { workspaceId: first.workspaceId as string };
    }
    return created.targetType === "idea"
      ? { ideaId: created.targetId }
      : { planId: created.targetId };
  }
  const scope = containerScope(first.containerType, first.containerId);
  if (scope === null) await admitOwner(db, first.containerId, caller);
  return scope;
};

/**
 * Whether the operation `batchId` was reverted (H3), and the revert was not reverted in
 * turn: until then it is 409 ALREADY_REVERTED (SDD 5.11).
 */
async function isReverted(tx: Executor, batchId: string): Promise<boolean> {
  const reverted = alias(changeHistory, "reverted");
  const reverters = await tx
    .selectDistinct({ batchId: changeHistory.batchId })
    .from(changeHistory)
    .where(
      and(
        eq(changeHistory.source, "revert"),
        isNotNull(changeHistory.batchId),
        inArray(
          changeHistory.revertedFromId,
          tx
            .select({ id: reverted.id })
            .from(reverted)
            .where(eq(reverted.batchId, batchId)),
        ),
      ),
    );
  for (const { batchId: reverter } of reverters) {
    if (reverter !== null && !(await isReverted(tx, reverter))) return true;
  }
  return false;
}

/**
 * The `HistoryEntry` of each of `rows` (SDD 5.11), as seen from `workspaceId` (null for
 * a self-analysis). `canRevert` says whether the caller may revert in the container.
 * A template migration is revertible only as a whole, so its row only while H3 can
 * still revert it; other rows go by the caller's permission alone.
 */
async function entryViews(
  db: Executor,
  rows: readonly HistoryRow[],
  canRevert: boolean,
  workspaceId: string | null,
): Promise<HistoryEntry[]> {
  const migrations = [
    ...new Set(
      rows.flatMap((row) =>
        row.targetType === "template_version" && row.batchId !== null
          ? [row.batchId]
          : [],
      ),
    ),
  ];
  const reverted = new Set<string>();
  for (const batchId of canRevert ? migrations : []) {
    if (await isReverted(db, batchId)) reverted.add(batchId);
  }
  const labelOf = await loadItemLabels(db, rows.map(targetOf));
  const users = await loadUserRefs(
    db,
    rows.map((row) => row.changedById),
    workspaceId,
  );
  return rows.map((row) => {
    const changedBy = users.get(row.changedById);
    if (changedBy === undefined) throw new Error(`No user ${row.changedById}`);
    const target = targetOf(row);
    return {
      id: row.id,
      batchId: row.batchId,
      target,
      label: labelOf(target),
      action: row.action,
      source: row.source,
      before: row.before,
      after: row.after,
      changedBy,
      changedAt: row.changedAt.toISOString(),
      revertible:
        canRevert &&
        !undoesCreation(row) &&
        !(
          row.targetType === "template_version" &&
          row.batchId !== null &&
          reverted.has(row.batchId)
        ),
    };
  });
}

/** Whether the caller may revert in `scope`: Owners and Members, nothing archived. */
const revertsIn = (scope: Scope | null) =>
  scope === null ||
  (scope.role !== "viewer" && !scope.ideaArchived && !scope.planArchived);

/**
 * The condition H1's query selects rows by: the item's, or the screen's in its sections;
 * null when it selects nothing (an item's template version).
 */
async function historyWhere(
  db: Executor,
  query: HistoryQuery,
  scope: Scope | null,
): Promise<SQL | null> {
  if (query.targetType !== undefined && query.targetId !== undefined) {
    // Template versions are listed by screen only (SDD 5.11 H1).
    if (query.targetType === "template_version") return null;
    return and(
      eq(changeHistory.targetType, query.targetType),
      eq(changeHistory.targetId, query.targetId),
      query.targetKey === undefined
        ? isNull(changeHistory.targetKey)
        : eq(changeHistory.targetKey, query.targetKey),
    ) as SQL;
  }
  const type = query.containerType as HistoryRow["containerType"];
  const id = query.containerId as string;
  const screen = and(
    eq(changeHistory.containerType, type),
    eq(changeHistory.containerId, id),
    query.sectionKeys === undefined
      ? undefined
      : inSections(changeHistory, { type, id }, query.sectionKeys),
  ) as SQL;
  if (type !== "idea" || query.sectionKeys !== undefined) return screen;
  // 13 also lists the template migrations of the idea's validation (design-spec 6.0.7).
  const [validation] = await db
    .select({ id: validations.id })
    .from(validations)
    .where(eq(validations.ideaId, scope?.ideaId ?? id));
  return validation === undefined
    ? screen
    : (or(
        screen,
        and(
          eq(changeHistory.containerType, "validation"),
          eq(changeHistory.containerId, validation.id),
          eq(changeHistory.targetType, "template_version"),
        ),
      ) as SQL);
}

/** The container a history row is filed under, as `withHistory` takes it. */
const containerOfRow = (row: HistoryRow): HistoryContainer =>
  row.containerType === "self_analysis"
    ? {
        type: "self_analysis",
        id: row.containerId,
        ownerUserId: row.ownerUserId as string,
      }
    : {
        type: row.containerType,
        id: row.containerId,
        workspaceId: row.workspaceId as string,
      };

/** What the history routes need from the app. */
export interface HistoryRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  422: errorBodySchema,
} as const;

/** H1–H3 (SDD 5.11): the history panel PNL-2, reverting and undoing a creation. */
export function historyRoutes({ access, db, now }: HistoryRoutesOptions) {
  /**
   * Runs `work` as a revert in the container of `rows`: under the scope's locks, or for
   * a self-analysis after the caller and the self-analysis (SDD 5.8), moving it to in
   * progress when it gains an answer. `work` gets the time to stamp changes with.
   */
  const revertIn = async <T>(
    scope: Scope | null,
    caller: Caller,
    container: HistoryContainer,
    at: Date,
    work: (tx: DatabaseTransaction, when: Date) => Promise<T>,
  ): Promise<T> => {
    if (container.type === "self_analysis") {
      return db.transaction(async (tx) => {
        await lockActiveCaller(tx, caller.id);
        const analysis = await lockSelfAnalysis(tx, caller.id);
        if (analysis.id !== container.id) {
          throw new ApiError("NOT_FOUND", "No such self-analysis");
        }
        const result = await work(tx, at);
        // A migration's undo may have pinned another version (SDD 5.12 T2).
        const [current] = await tx
          .select()
          .from(selfAnalyses)
          .where(eq(selfAnalyses.id, analysis.id));
        if (current === undefined)
          throw new Error("The self-analysis went away");
        const sections =
          (await loadTemplateSections(tx, [current.templateVersionId])).get(
            current.templateVersionId,
          ) ?? [];
        await startIfAnswered(tx, current, sections, at);
        return result;
      });
    }
    if (scope === null) throw new Error("A workspace container needs a scope");
    return writeInScope(
      db,
      scope,
      at,
      async (tx) =>
        work(
          tx,
          container.type === "business_plan"
            ? await planContentTime(tx, container.id, at)
            : at,
        ),
      // An execution item's assignee is checked against the members (P10).
      container.type === "business_plan"
        ? (tx) => lockMembers(tx, container.workspaceId, "shared")
        : undefined,
    );
  };

  const itemView = async (item: StoredItem, workspaceId: string | null) => {
    let updatedBy: UserRef | null = null;
    if (item.updatedById !== null) {
      const users = await loadUserRefs(db, [item.updatedById], workspaceId);
      updatedBy = users.get(item.updatedById) ?? null;
      if (updatedBy === null) throw new Error(`No user ${item.updatedById}`);
    }
    return {
      value: item.value,
      deleted: item.deleted,
      lockVersion: item.lockVersion,
      updatedAt: item.updatedAt?.toISOString() ?? null,
      updatedBy,
    };
  };

  /**
   * H3 of a duplicate or a plan draft (SDD 5.11「作成の取り消し」): removes what it
   * made, if nothing was added since. Takes no lock it would wait for while holding
   * another, so no write in progress dies of a deadlock: a held idea or plan is 409
   * BUSY at once.
   */
  const undoCreation = async (
    caller: Caller,
    rows: readonly HistoryRow[],
    created: HistoryRow,
    request: Request,
  ) => {
    const batchId = created.batchId as string;
    const workspaceId = created.workspaceId as string;
    const at = new Date(now());
    await db.transaction(async (tx) => {
      await advisoryLock(tx, `moonx:batch:${batchId}`);
      if (await creationUndone(tx, created)) {
        throw new ApiError("ALREADY_REVERTED", "This was already undone");
      }
      const plan = created.targetType === "business_plan";
      const lockNow = async <T>(lock: () => Promise<T>): Promise<T> => {
        try {
          return await lock();
        } catch (error) {
          if (isLockNotAvailable(error)) {
            throw new ApiError(
              "BUSY",
              "Something is being changed right now",
              {},
              { cause: error },
            );
          }
          throw error;
        }
      };
      let planRow: typeof businessPlans.$inferSelect | undefined;
      if (plan) {
        [planRow] = await tx
          .select()
          .from(businessPlans)
          .where(eq(businessPlans.id, created.targetId));
      }
      const ideaId = planRow?.ideaId ?? created.targetId;
      const [idea] = await lockNow(() =>
        tx
          .select()
          .from(ideas)
          .where(eq(ideas.id, ideaId))
          .for("update", { noWait: true }),
      );
      if (plan) {
        [planRow] = await lockNow(() =>
          tx
            .select()
            .from(businessPlans)
            .where(eq(businessPlans.id, created.targetId))
            .for("update", { noWait: true }),
        );
      }
      if (idea === undefined || (plan && planRow === undefined)) {
        throw new Error("What the operation made is gone");
      }
      // The undo is written to the idea it came from, whose last activity moves with
      // it (SDD 7.1「実装」): a plan's idea, held above, or a copy's source, held here.
      const sourceIdeaId = plan ? idea.id : idea.duplicatedFromId;
      if (sourceIdeaId === null) {
        throw new Error(`Idea ${idea.id} records no idea it was copied from`);
      }
      if (!plan) {
        await lockNow(() =>
          tx
            .select({ id: ideas.id })
            .from(ideas)
            .where(eq(ideas.id, sourceIdeaId))
            .for("no key update", { noWait: true }),
        );
      }
      if (idea.archivedAt !== null || (planRow?.archivedAt ?? null) !== null) {
        throw new ApiError("ARCHIVED", "The idea or plan is archived");
      }
      if (idea.deletedAt !== null) {
        throw new ApiError("NOT_FOUND", "The idea no longer exists");
      }
      if (await addedSince(tx, created, idea.id)) {
        throw new ApiError(
          "UNDO_BLOCKED",
          "Something was added after this was created",
        );
      }
      if (planRow !== undefined) {
        await tx
          .update(businessPlans)
          .set({ deletedAt: at })
          .where(eq(businessPlans.id, planRow.id));
      } else {
        await tx
          .update(ideas)
          .set({ deletedAt: at })
          .where(eq(ideas.id, idea.id));
      }
      await withHistory(
        tx,
        {
          container: { type: "idea", id: sourceIdeaId, workspaceId },
          changedById: caller.id,
          source: "revert",
          batchId: null,
          client: requestContext(request).client,
          at,
        },
        async () => ({
          target: {
            type: plan ? "business_plan" : "idea",
            id: created.targetId,
          },
          action: "delete",
          before:
            planRow === undefined
              ? ideaContent(idea)
              : businessPlanContent(planRow),
          after: null,
          revertedFromId: created.id,
        }),
      );
      await tx
        .update(ideas)
        .set({ lastActivityAt: at })
        .where(eq(ideas.id, sourceIdeaId));
      await tx
        .update(workspaces)
        .set({ lastActiveAt: at })
        .where(eq(workspaces.id, workspaceId));
    });
    return { reverted: rows.length, batchId };
  };

  /**
   * Whether anything was added to what `created` made since (SDD 5.11「作成の取り消し」
   * (1)–(5)): other history, comments (deleted ones too), decisions, plans or versions,
   * and copies of the copy.
   */
  const addedSince = async (
    tx: DatabaseTransaction,
    created: HistoryRow,
    ideaId: string,
  ): Promise<boolean> => {
    const exists = async (query: Promise<unknown[]>) =>
      (await query).length > 0;
    const otherOperation = or(
      isNull(changeHistory.batchId),
      ne(changeHistory.batchId, created.batchId as string),
    );
    if (created.targetType === "business_plan") {
      const planId = created.targetId;
      return (
        (await exists(
          tx
            .select({ id: changeHistory.id })
            .from(changeHistory)
            .where(
              and(
                eq(changeHistory.containerType, "business_plan"),
                eq(changeHistory.containerId, planId),
                otherOperation,
              ),
            )
            .limit(1),
        )) ||
        (await exists(
          tx
            .select({ id: comments.id })
            .from(comments)
            .where(
              and(
                eq(comments.containerType, "business_plan"),
                eq(comments.containerId, planId),
              ),
            )
            .limit(1),
        )) ||
        (await exists(
          tx
            .select({ id: decisionLogEntries.id })
            .from(decisionLogEntries)
            .where(eq(decisionLogEntries.businessPlanId, planId))
            .limit(1),
        )) ||
        (await exists(
          tx
            .select({ id: planVersions.id })
            .from(planVersions)
            .where(eq(planVersions.businessPlanId, planId))
            .limit(1),
        ))
      );
    }
    const [validation] = await tx
      .select({ id: validations.id })
      .from(validations)
      .where(eq(validations.ideaId, ideaId));
    if (validation === undefined)
      throw new Error(`Idea ${ideaId} has no validation`);
    const screens = (table: typeof changeHistory | typeof comments): SQL =>
      or(
        and(eq(table.containerType, "idea"), eq(table.containerId, ideaId)),
        and(
          eq(table.containerType, "validation"),
          eq(table.containerId, validation.id),
        ),
      ) as SQL;
    return (
      (await exists(
        tx
          .select({ id: changeHistory.id })
          .from(changeHistory)
          .where(and(screens(changeHistory), otherOperation))
          .limit(1),
      )) ||
      (await exists(
        tx
          .select({ id: comments.id })
          .from(comments)
          .where(screens(comments))
          .limit(1),
      )) ||
      (await exists(
        tx
          .select({ id: decisionLogEntries.id })
          .from(decisionLogEntries)
          .where(eq(decisionLogEntries.ideaId, ideaId))
          .limit(1),
      )) ||
      (await exists(
        tx
          .select({ id: businessPlans.id })
          .from(businessPlans)
          .where(eq(businessPlans.ideaId, ideaId))
          .limit(1),
      )) ||
      (await exists(
        tx
          .select({ id: ideas.id })
          .from(ideas)
          .where(eq(ideas.duplicatedFromId, ideaId))
          .limit(1),
      ))
    );
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/history",
      async ({ scope, query }) => {
        const where = await historyWhere(db, query, scope);
        if (where === null) return { items: [], nextCursor: null };
        const offset = query.cursor ?? 0;
        const rows = await db
          .select()
          .from(changeHistory)
          .where(where)
          .orderBy(desc(changeHistory.changedAt), desc(changeHistory.id))
          .limit(query.limit + 1)
          .offset(offset);
        const page = rows.slice(0, query.limit);
        return {
          items: await entryViews(
            db,
            page,
            revertsIn(scope),
            scope?.workspaceId ?? null,
          ),
          nextCursor:
            rows.length > query.limit ? String(offset + query.limit) : null,
        };
      },
      {
        located: { to: historyLocator, need: "read" },
        query: historyQuerySchema,
        response: { 200: historyPageSchema, ...errors },
        detail: {
          summary: "H1 The history of an item or a screen (PNL-2)",
          description:
            "One item (targetType, targetId, targetKey), deleted rows included, or one screen (containerType, containerId, sectionKeys; on a plan, execution:{type} is its execution items of that type), newest first. The idea's screen (13) adds the template migrations of its validation and the undone creations. A self-analysis's history is its owner's only (403 FORBIDDEN).",
        },
      },
    )
    .post(
      "/api/v1/history/:entryId/revert",
      async ({ caller, scope, params, request }) => {
        const entry = await findEntry(db, params.entryId);
        if (entry === undefined)
          throw new ApiError("NOT_FOUND", "No such change");
        if (entry.targetType === "template_version") {
          throw invalid(
            "entryId",
            "invalid_value",
            "A template migration is undone as a whole (H3)",
          );
        }
        if (undoesCreation(entry)) {
          throw invalid(
            "entryId",
            "invalid_value",
            "What an undone creation removed does not come back",
          );
        }
        const restoration: Restoration =
          entry.action === "delete"
            ? { kind: "undelete" }
            : { kind: "content", content: entry.after };
        const container = containerOfRow(entry);
        const workspaceId = entry.workspaceId;
        const at = new Date(now());
        const { written, item } = await revertIn(
          scope,
          caller,
          container,
          at,
          async (tx, when) => {
            const { change, item } = await restoreItem(
              {
                tx,
                at: when,
                userId: caller.id,
                containerId: container.id,
                workspaceId,
              },
              targetOf(entry),
              restoration,
            );
            const written =
              change === null
                ? []
                : await withHistory(
                    tx,
                    {
                      container,
                      changedById: caller.id,
                      source: "revert",
                      batchId: null,
                      client: requestContext(request).client,
                      at: when,
                    },
                    async () => ({ ...change, revertedFromId: entry.id }),
                  );
            return { written, item };
          },
        );
        const [view] = await entryViews(
          db,
          written,
          revertsIn(scope),
          workspaceId,
        );
        return {
          entry: view ?? null,
          target: await itemView(item, workspaceId),
        };
      },
      {
        located: { to: entryLocator, need: "writeUnarchived" },
        params: historyEntryParamsSchema,
        response: {
          200: historyRevertResultSchema,
          ...errors,
          409: errorBodySchema,
        },
        detail: {
          summary: "H2 Revert an item to just after a change (PNL-2)",
          description:
            "Puts the item's text, numbers, F/A/U, confidence and evidence as the change left them; a deletion is undone. No version is compared. Writes a revert row, or nothing (entry null) when the item already is so. 422 VALIDATION_FAILED for a template migration (H3 undoes it) and for an undone creation; 409 NAME_TAKEN when a plan's old name is taken now. A self-analysis is its owner's only.",
        },
      },
    )
    .post(
      "/api/v1/history/batches/:batchId/revert",
      async ({ caller, scope, params, request }) => {
        const rows = await batchRows(db, params.batchId);
        const first = rows[0];
        if (first === undefined) {
          throw new ApiError("NOT_FOUND", "No such operation");
        }
        const created = creationOf(rows);
        if (created !== null) {
          return undoCreation(caller, rows, created, request);
        }
        const container = containerOfRow(first);
        if (
          rows.some(
            (row) =>
              row.containerType !== container.type ||
              row.containerId !== container.id,
          )
        ) {
          throw new Error(`Operation ${params.batchId} spans containers`);
        }
        const batchId = crypto.randomUUID();
        const at = new Date(now());
        const reverted = await revertIn(
          scope,
          caller,
          container,
          at,
          async (tx, when) => {
            await advisoryLock(tx, `moonx:batch:${params.batchId}`);
            if (await isReverted(tx, first.batchId as string)) {
              throw new ApiError("ALREADY_REVERTED", "This was already undone");
            }
            // Each item goes back to what the operation found: its first row's before.
            const firsts = new Map<string, HistoryRow>();
            for (const row of rows) {
              const key = itemKey(targetOf(row));
              if (!firsts.has(key)) firsts.set(key, row);
            }
            const changes: HistoryChange[] = [];
            for (const row of firsts.values()) {
              const { change } = await restoreItem(
                {
                  tx,
                  at: when,
                  userId: caller.id,
                  containerId: container.id,
                  workspaceId: first.workspaceId,
                },
                targetOf(row),
                row.before === null
                  ? { kind: "absent" }
                  : { kind: "content", content: row.before },
              );
              if (change !== null) {
                changes.push({ ...change, revertedFromId: row.id });
              }
            }
            const operation: HistoryOperation = {
              container,
              changedById: caller.id,
              source: "revert",
              batchId,
              client: requestContext(request).client,
              at: when,
            };
            const written = await withHistory(
              tx,
              operation,
              async () => changes,
            );
            return written.length;
          },
        );
        return { reverted, batchId };
      },
      {
        located: { to: batchLocator, need: "writeUnarchived" },
        params: historyBatchParamsSchema,
        response: {
          200: historyBatchRevertResultSchema,
          ...errors,
          409: errorBodySchema,
        },
        detail: {
          summary: "H3 Undo a whole operation (PNL-2, M8)",
          description:
            "An AI import, a template migration or a revert: every item back to what the operation found, as one revert operation (batchId; H3 can undo it in turn). 409 ALREADY_REVERTED until that revert is itself undone. A duplicate or a plan draft is not reverted but removed (undoing a creation): 409 UNDO_BLOCKED when anything was added since, 409 BUSY when another write holds it, 409 ALREADY_REVERTED the second time; reverted counts the operation's rows and batchId is its own.",
        },
      },
    );
}
