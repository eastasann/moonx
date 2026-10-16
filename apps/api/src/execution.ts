import {
  type Database,
  type DatabaseTransaction,
  executionItemContent,
  executionItems,
  memberships,
} from "@moonx/db";
import {
  EXECUTION_COLUMNS,
  EXECUTION_STATUSES,
  type ExecutionColumn,
  type ExecutionItemCreate,
  type ExecutionItemUpdate,
  type ExecutionStatus,
  type ExecutionType,
  errorBodySchema,
  executionItemCreateSchema,
  executionItemSchema,
  executionItemUpdateSchema,
  executionListQuerySchema,
  executionListSchema,
  executionOrderSchema,
  ORDERED_EXECUTION_TYPES,
  uuidSchema,
} from "@moonx/schemas";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin, ScopeLocator } from "./access";
import { dueWindow } from "./due";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { type HistoryOperation, withHistory } from "./history";
import { checkLockVersion } from "./lock";
import { lockMembers } from "./membership";
import {
  type ExecutionRow,
  executionItemViews,
  planContentTime,
  storedExecutionRow,
} from "./plan-views";
import { recordChange, type Scope, writeInScope } from "./scope";
import { invalid, sameContent } from "./validation-writes";

const noContent = z.undefined().meta({ description: "No content" });

/** The columns of 22 a type may lack, each a field of {@link ExecutionItemCreate}. */
const ALL_COLUMNS = [
  ...new Set(Object.values(EXECUTION_COLUMNS).flat()),
] as ExecutionColumn[];

/**
 * Refuses the columns `type` lacks and the statuses it does not take (SDD 5.9 P9, P10).
 * A column sent as null counts as sent: it is refused, not dropped.
 *
 * @throws {ApiError} VALIDATION_FAILED or INVALID_STATUS
 */
function checkTypeFields(
  type: ExecutionType,
  body: Partial<Record<ExecutionColumn, unknown>> & {
    status?: ExecutionStatus | null;
  },
): void {
  const own = new Set(EXECUTION_COLUMNS[type]);
  const foreign = ALL_COLUMNS.find(
    (column) => !own.has(column) && body[column] !== undefined,
  );
  if (foreign !== undefined) {
    throw invalid(
      foreign,
      "unrecognized_keys",
      `A ${type} item has no ${foreign}`,
    );
  }
  if (body.status === undefined) return;
  const allowed = EXECUTION_STATUSES[type];
  const valid =
    body.status === null ? allowed.length === 0 : allowed.includes(body.status);
  if (!valid) {
    throw new ApiError(
      "INVALID_STATUS",
      allowed.length === 0
        ? `A ${type} item has no status`
        : `A ${type} item is ${allowed.join(", ")}`,
    );
  }
}

/**
 * Refuses an assignee who is not an Owner or Member of the workspace (SDD 5.9 P9). Run
 * it under the members lock (membership.ts `lockMembers`, shared), so they stay one
 * until the save commits.
 *
 * @throws {ApiError} INVALID_ASSIGNEE
 */
async function checkAssignee(
  tx: DatabaseTransaction,
  workspaceId: string,
  userId: string,
): Promise<void> {
  const [member] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        eq(memberships.userId, userId),
        inArray(memberships.role, ["owner", "member"]),
      ),
    );
  if (member === undefined) {
    throw new ApiError(
      "INVALID_ASSIGNEE",
      "Only an Owner or Member of the workspace can be the assignee",
    );
  }
}

/**
 * The assignee after a save: one of a member and a name (design-spec 6.13). Naming one
 * clears the other; sending both is refused.
 *
 * @throws {ApiError} VALIDATION_FAILED
 */
function assigneeAfter(
  current: { assigneeUserId: string | null; assigneeName: string | null },
  body: { assigneeUserId?: string | null; assigneeName?: string | null },
) {
  const userId = body.assigneeUserId;
  const name = body.assigneeName;
  if (userId != null && name != null) {
    throw invalid(
      "assigneeName",
      "invalid_value",
      "Send a member or a name as the assignee, not both",
    );
  }
  if (userId != null) return { assigneeUserId: userId, assigneeName: null };
  if (name != null) return { assigneeUserId: null, assigneeName: name };
  return {
    assigneeUserId:
      userId === undefined ? current.assigneeUserId : (userId ?? null),
    assigneeName: name === undefined ? current.assigneeName : (name ?? null),
  };
}

/** When a status change stamps `completed_at` (SDD 5.9 P10). */
const completes = (status: ExecutionStatus | null) =>
  status === "done" || status === "resolved";

/** The fields of `body` for the columns of 22, those sent only. */
const sentColumns = (body: ExecutionItemCreate | ExecutionItemUpdate) =>
  Object.fromEntries(
    ALL_COLUMNS.flatMap((column) =>
      body[column] === undefined ? [] : [[column, body[column]]],
    ),
  ) as Partial<Pick<ExecutionRow, ExecutionColumn>>;

/** Finds the plan of the execution item in the path (P10). A deleted item is not found. */
const itemLocator: ScopeLocator = async ({ params, db }) => {
  const id = params.itemId ?? "";
  if (!uuidSchema.safeParse(id).success) return null;
  const [row] = await db
    .select({ planId: executionItems.businessPlanId })
    .from(executionItems)
    .where(and(eq(executionItems.id, id), isNull(executionItems.deletedAt)));
  return row === undefined ? null : { planId: row.planId };
};

/** One manual save on 22, filed under the plan. */
const executionOperation = (
  request: Request,
  scope: Scope,
  userId: string,
  at: Date,
): HistoryOperation => ({
  container: {
    type: "business_plan",
    id: scope.planId as string,
    workspaceId: scope.workspaceId,
  },
  changedById: userId,
  source: "manual",
  batchId: null,
  client: requestContext(request).client,
  at,
});

/**
 * Locks the execution item `id` for a change. It was found when the request was let in,
 * but a write that went before may have deleted it since.
 *
 * @throws {ApiError} NOT_FOUND when it is deleted
 */
async function lockItem(
  tx: DatabaseTransaction,
  id: string,
): Promise<ExecutionRow> {
  const [row] = await tx
    .select()
    .from(executionItems)
    .where(and(eq(executionItems.id, id), isNull(executionItems.deletedAt)))
    .for("update");
  if (row === undefined) throw new ApiError("NOT_FOUND", "No such item");
  return row;
}

/** What the execution routes need from the app. */
export interface ExecutionRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const readErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;
const writeErrors = {
  ...readErrors,
  409: errorBodySchema,
  422: errorBodySchema,
} as const;

/** P9–P11 (SDD 5.9): the execution items of a plan (22, and 21's execution views). */
export function executionRoutes({ access, db, now }: ExecutionRoutesOptions) {
  /** One item as P9 lists it, for the caller. */
  const itemView = async (scope: Scope, callerId: string, id: string) => {
    const [row] = await db
      .select()
      .from(executionItems)
      .where(eq(executionItems.id, id));
    if (row === undefined) throw new Error(`No execution item ${id}`);
    const { today } = await dueWindow(db, callerId, new Date(now()));
    const [view] = await executionItemViews(
      db,
      scope.workspaceId,
      [storedExecutionRow(row)],
      today,
    );
    if (view === undefined) throw new Error(`No view of ${id}`);
    return view;
  };
  /** Holds the members still while a save makes someone the assignee. */
  const membersFirst =
    (scope: Scope, assigneeUserId: string | null | undefined) =>
    async (tx: DatabaseTransaction) => {
      if (assigneeUserId != null)
        await lockMembers(tx, scope.workspaceId, "shared");
    };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/plans/:planId/execution-items",
      async ({ scope, caller, query }) => {
        const assignee = query.assignee === "me" ? caller.id : query.assignee;
        const rows = await db
          .select()
          .from(executionItems)
          .where(
            and(
              eq(executionItems.businessPlanId, scope.planId as string),
              isNull(executionItems.deletedAt),
              query.type === undefined
                ? undefined
                : eq(executionItems.type, query.type),
              assignee === undefined
                ? undefined
                : eq(executionItems.assigneeUserId, assignee),
              query.status === undefined
                ? undefined
                : eq(executionItems.status, query.status),
            ),
          );
        const { today } = await dueWindow(db, caller.id, new Date(now()));
        return {
          items: await executionItemViews(
            db,
            scope.workspaceId,
            rows.map(storedExecutionRow),
            today,
          ),
        };
      },
      {
        scoped: { to: "planId", need: "read" },
        query: executionListQuerySchema,
        response: {
          200: executionListSchema,
          ...readErrors,
          422: errorBodySchema,
        },
        detail: {
          summary: "P9 The execution items of a plan (22)",
          description:
            "By type; Next Actions by due date (none last), the others in their order (P11). assignee is me or a user's id.",
        },
      },
    )
    .post(
      "/api/v1/plans/:planId/execution-items",
      async ({ scope, caller, body, request, status }) => {
        const planId = scope.planId as string;
        const at = new Date(now());
        const id = await writeInScope(
          db,
          scope,
          at,
          async (tx) => {
            const { type } = body;
            checkTypeFields(type, body);
            const when = await planContentTime(tx, planId, at);
            const assignee = assigneeAfter(
              { assigneeUserId: null, assigneeName: null },
              body,
            );
            if (assignee.assigneeUserId !== null) {
              await checkAssignee(
                tx,
                scope.workspaceId,
                assignee.assigneeUserId,
              );
            }
            const itemStatus =
              body.status === undefined
                ? (EXECUTION_STATUSES[type][0] ?? null)
                : body.status;
            const [last] = await tx
              .select({
                max: sql<number | null>`max(${executionItems.sortOrder})`,
              })
              .from(executionItems)
              .where(
                and(
                  eq(executionItems.businessPlanId, planId),
                  eq(executionItems.type, type),
                  isNull(executionItems.deletedAt),
                ),
              );
            const values = {
              businessPlanId: planId,
              type,
              title: body.title,
              ...assignee,
              ...sentColumns(body),
              launchTiming:
                type === "launch" ? (body.launchTiming ?? "other") : null,
              status: itemStatus,
              completedAt: completes(itemStatus) ? when : null,
              kpiActualUpdatedAt: body.kpiActual != null ? when : null,
              fromPreset: false,
              sortOrder: (last?.max ?? -1) + 1,
              updatedById: caller.id,
              createdAt: when,
              updatedAt: when,
            };
            const [created] = await tx
              .insert(executionItems)
              .values(values)
              .returning();
            if (created === undefined) throw new Error("item insert failed");
            await withHistory(
              tx,
              executionOperation(request, scope, caller.id, when),
              async () => ({
                target: { type: "execution_item", id: created.id },
                action: "create",
                before: null,
                after: executionItemContent(created),
              }),
            );
            return created.id;
          },
          membersFirst(scope, body.assigneeUserId),
        );
        return status(201, await itemView(scope, caller.id, id));
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        body: executionItemCreateSchema,
        parse: "json",
        response: { 201: executionItemSchema, ...writeErrors },
        detail: {
          summary: "P9 Add an execution item",
          description:
            "At the end of its type. A column the type lacks is 422 VALIDATION_FAILED (dueDate on a KPI too), a status it does not take 422 INVALID_STATUS, an assignee who is not an Owner or Member 422 INVALID_ASSIGNEE. A launch item goes to Other unless launchTiming says otherwise.",
        },
      },
    )
    .patch(
      "/api/v1/execution-items/:itemId",
      async ({ scope, caller, params, body, request }) => {
        const at = new Date(now());
        await writeInScope(
          db,
          scope,
          at,
          async (tx) => {
            const row = await lockItem(tx, params.itemId);
            const when = await planContentTime(tx, scope.planId as string, at);
            const before = executionItemContent(row);
            const stored = {
              value: before,
              lockVersion: row.lockVersion,
              updatedAt: row.updatedAt,
              updatedById: row.updatedById,
            };
            const claim = { lockVersion: body.lockVersion, force: body.force };
            // An item never changes type, so this is settled by the request alone and
            // answers 422 whatever the version (SDD 5.1「同時編集」).
            checkTypeFields(row.type, body);
            const assignee = assigneeAfter(row, body);
            const itemStatus =
              body.status === undefined ? row.status : body.status;
            const next = {
              ...row,
              title: body.title ?? row.title,
              ...sentColumns(body),
              ...assignee,
              status: itemStatus,
            };
            const after = executionItemContent(next);
            if (sameContent(before, after)) return;
            await checkLockVersion(tx, stored, claim, scope.workspaceId);
            if (
              assignee.assigneeUserId !== null &&
              assignee.assigneeUserId !== row.assigneeUserId
            ) {
              await checkAssignee(
                tx,
                scope.workspaceId,
                assignee.assigneeUserId,
              );
            }
            await tx
              .update(executionItems)
              .set({
                ...after,
                completedAt:
                  itemStatus === row.status
                    ? row.completedAt
                    : completes(itemStatus)
                      ? when
                      : null,
                kpiActualUpdatedAt:
                  after.kpiActual === before.kpiActual
                    ? row.kpiActualUpdatedAt
                    : when,
                lockVersion: row.lockVersion + 1,
                updatedAt: when,
                updatedById: caller.id,
              })
              .where(eq(executionItems.id, row.id));
            await withHistory(
              tx,
              executionOperation(request, scope, caller.id, when),
              async () => ({
                target: { type: "execution_item", id: row.id },
                action: "update",
                before,
                after,
              }),
            );
          },
          membersFirst(scope, body.assigneeUserId),
        );
        return itemView(scope, caller.id, params.itemId);
      },
      {
        scoped: { to: itemLocator, need: "writeUnarchived" },
        body: executionItemUpdateSchema,
        parse: "json",
        response: { 200: executionItemSchema, ...writeErrors },
        detail: {
          summary: "P10 Edit an execution item",
          description:
            "Under the optimistic lock. Done or Resolved stamps completedAt, a new kpiActual stamps kpiActualUpdatedAt. Naming a member or a name as the assignee clears the other.",
        },
      },
    )
    .delete(
      "/api/v1/execution-items/:itemId",
      async ({ scope, caller, params, request, set }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const when = await planContentTime(tx, scope.planId as string, at);
          const row = await lockItem(tx, params.itemId);
          await tx
            .update(executionItems)
            .set({ deletedAt: when })
            .where(eq(executionItems.id, row.id));
          await withHistory(
            tx,
            executionOperation(request, scope, caller.id, when),
            async () => ({
              target: { type: "execution_item", id: row.id },
              action: "delete",
              before: executionItemContent(row),
              after: null,
            }),
          );
        });
        set.status = 204;
      },
      {
        scoped: { to: itemLocator, need: "writeUnarchived" },
        response: { 204: noContent, ...readErrors, 409: errorBodySchema },
        detail: {
          summary: "P10 Delete an execution item",
          description:
            "Deletes it logically, without the lock; the history can restore it.",
        },
      },
    )
    .put(
      "/api/v1/plans/:planId/execution-items/order",
      async ({ scope, body, set }) => {
        const planId = scope.planId as string;
        await writeInScope(db, scope, new Date(now()), async (tx) => {
          if (
            !(ORDERED_EXECUTION_TYPES as readonly string[]).includes(body.type)
          ) {
            throw invalid(
              "type",
              "invalid_value",
              "Next Actions go by their due date",
            );
          }
          const rows = await tx
            .select({
              id: executionItems.id,
              sortOrder: executionItems.sortOrder,
            })
            .from(executionItems)
            .where(
              and(
                eq(executionItems.businessPlanId, planId),
                eq(executionItems.type, body.type),
                isNull(executionItems.deletedAt),
              ),
            )
            .for("update");
          const stored = new Map(rows.map((row) => [row.id, row.sortOrder]));
          if (
            body.ids.length !== rows.length ||
            new Set(body.ids).size !== body.ids.length ||
            body.ids.some((id) => !stored.has(id))
          ) {
            throw invalid(
              "ids",
              "invalid_value",
              "Send every item of the type once, and nothing else",
            );
          }
          let changed = false;
          for (const [index, id] of body.ids.entries()) {
            if (stored.get(id) === index) continue;
            changed = true;
            await tx
              .update(executionItems)
              .set({ sortOrder: index })
              .where(eq(executionItems.id, id));
          }
          // No history, version or updatedAt (SDD 5.9 P11), but the list did change.
          if (changed) recordChange(tx);
        });
        set.status = 204;
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        body: executionOrderSchema,
        parse: "json",
        response: { 204: noContent, ...writeErrors },
        detail: {
          summary: "P11 Order the execution items of a type",
          description:
            "ids is every item of the type not deleted, in the new order. Next Actions go by their due date: 422 for next_action.",
        },
      },
    );
}
