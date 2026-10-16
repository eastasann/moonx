import {
  businessPlans,
  type Database,
  type DatabaseTransaction,
  ideas,
  memberships,
  validations,
  workspaces,
} from "@moonx/db";
import { type Role, uuidSchema } from "@moonx/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { ApiError } from "./errors";

/**
 * What a scoped route acts on, by the id of one of the resources that carry a
 * workspace (SDD 7.1「実装」). A row inside them (a competitor, a cost item) is reached
 * through its validation or plan.
 */
export type ScopeRef =
  | { workspaceId: string }
  | { ideaId: string }
  | { validationId: string }
  | { planId: string };

/** The path parameter names a route may give as its scope (SDD 5.3). */
export type ScopeParam = "workspaceId" | "ideaId" | "validationId" | "planId";

/**
 * What a route needs of the caller's role in the scope (SDD 7.1). Archive checks come
 * first, so a Viewer editing an archived idea gets 409 ARCHIVED, not 403.
 *
 * - `read`: any role.
 * - `comment`: any role, and neither the idea nor the plan archived: writing comments,
 *   which Viewers may do but nobody may on archived content. A comment on a shared
 *   self-analysis also needs Owner or Member (SDD 7.1), which its route checks.
 * - `write`: Owner or Member, archived or not (duplicating, archiving and restoring an
 *   idea).
 * - `writeUnarchived`: Owner or Member, and neither the idea nor the plan archived (any
 *   change to their content, reverts included).
 * - `writeIdeaUnarchived`: Owner or Member, and the idea not archived. Only archiving and
 *   restoring a plan (P3), which must work on an archived plan.
 * - `owner`: Owner.
 */
export type Need =
  | "read"
  | "comment"
  | "write"
  | "writeUnarchived"
  | "writeIdeaUnarchived"
  | "owner";

/** Whether `need` refuses an archived idea, and an archived plan. */
const archiveRule = (need: Need) => ({
  idea:
    need === "comment" ||
    need === "writeUnarchived" ||
    need === "writeIdeaUnarchived",
  plan: need === "comment" || need === "writeUnarchived",
});

/** The workspace a resource belongs to and the caller's place in it. */
export interface ResolvedScope {
  workspaceId: string;
  /** Null when the caller is not a member of the workspace. */
  role: Role | null;
  /** Set when the resource is an idea or lies inside one. */
  ideaId: string | null;
  /** Set when the resource is a plan or lies inside one. */
  planId: string | null;
  ideaArchived: boolean;
  planArchived: boolean;
}

/** A scope the caller was let into: the route's handler receives it as `scope`. */
export interface Scope extends ResolvedScope {
  role: Role;
  /** What the route needed, which {@link finishWrite} checks again. */
  need: Need;
}

const isUuid = (value: string) => uuidSchema.safeParse(value).success;

/** The caller's membership of the workspace in `workspaceId`, for a left join. */
const membershipOf = (workspaceId: AnyPgColumn, userId: string) =>
  and(eq(memberships.workspaceId, workspaceId), eq(memberships.userId, userId));

/**
 * The workspace and role behind `ref` for `userId` (SDD 7.1 `resolveScope`), or null
 * when the resource does not exist. Ideas and plans whose creation was undone count as
 * missing (SDD 5.11), and so does an id that is not a UUID, which could exist nowhere.
 * The ids it answers are the stored ones, lowercase whatever case the request wrote a
 * UUID in, so the keys of advisory locks and maps built from them agree.
 */
export async function resolveScope(
  db: Database | DatabaseTransaction,
  ref: ScopeRef,
  userId: string,
): Promise<ResolvedScope | null> {
  const id = Object.values(ref)[0] as string;
  if (!isUuid(id)) return null;
  if ("workspaceId" in ref) {
    const [row] = await db
      .select({ id: workspaces.id, role: memberships.role })
      .from(workspaces)
      .leftJoin(memberships, membershipOf(workspaces.id, userId))
      .where(eq(workspaces.id, id));
    return row === undefined
      ? null
      : {
          workspaceId: row.id,
          role: row.role,
          ideaId: null,
          planId: null,
          ideaArchived: false,
          planArchived: false,
        };
  }
  const ideaFields = {
    workspaceId: ideas.workspaceId,
    ideaId: ideas.id,
    role: memberships.role,
    ideaArchived: sql<boolean>`${ideas.archivedAt} is not null`,
  };
  if ("planId" in ref) {
    const [row] = await db
      .select({
        ...ideaFields,
        planId: businessPlans.id,
        planArchived: sql<boolean>`${businessPlans.archivedAt} is not null`,
      })
      .from(businessPlans)
      .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
      .leftJoin(memberships, membershipOf(ideas.workspaceId, userId))
      .where(
        and(
          eq(businessPlans.id, id),
          isNull(businessPlans.deletedAt),
          isNull(ideas.deletedAt),
        ),
      );
    return row === undefined ? null : row;
  }
  const [row] =
    "ideaId" in ref
      ? await db
          .select(ideaFields)
          .from(ideas)
          .leftJoin(memberships, membershipOf(ideas.workspaceId, userId))
          .where(and(eq(ideas.id, id), isNull(ideas.deletedAt)))
      : await db
          .select(ideaFields)
          .from(validations)
          .innerJoin(ideas, eq(ideas.id, validations.ideaId))
          .leftJoin(memberships, membershipOf(ideas.workspaceId, userId))
          .where(and(eq(validations.id, id), isNull(ideas.deletedAt)));
  return row === undefined
    ? null
    : { ...row, planId: null, planArchived: false };
}

/**
 * Lets the caller into `resolved` for `need`, in the order of SDD 7.1: a non-member gets
 * 403 NO_ACCESS before anything about the resource, then archived content 409 ARCHIVED
 * whatever the role, then too low a role 403 FORBIDDEN.
 *
 * @throws {ApiError} NO_ACCESS, ARCHIVED or FORBIDDEN
 */
export function admitScope(resolved: ResolvedScope, need: Need): Scope {
  const { role } = resolved;
  if (role === null) {
    throw new ApiError("NO_ACCESS", "Not a member of this workspace");
  }
  const refuses = archiveRule(need);
  if (
    (refuses.idea && resolved.ideaArchived) ||
    (refuses.plan && resolved.planArchived)
  ) {
    throw new ApiError("ARCHIVED", "The idea or plan is archived");
  }
  const allowed =
    need === "read" ||
    need === "comment" ||
    (need === "owner" ? role === "owner" : role !== "viewer");
  if (!allowed) {
    throw new ApiError("FORBIDDEN", "The role does not allow this");
  }
  return { ...resolved, role, need };
}

async function refuseStale(
  tx: DatabaseTransaction,
  table: typeof ideas | typeof businessPlans,
  id: string,
): Promise<never> {
  const [row] = await tx
    .select({ deleted: sql<boolean>`${table.deletedAt} is not null` })
    .from(table)
    .where(eq(table.id, id));
  if (row === undefined || row.deleted) {
    throw new ApiError("NOT_FOUND", "The idea or plan no longer exists");
  }
  throw new ApiError("ARCHIVED", "The idea or plan was archived");
}

const changedIn = new WeakSet<DatabaseTransaction>();

/**
 * Notes that the write in `tx` changed something, so {@link finishWrite} moves the last
 * activity. {@link withHistory} notes every change it records; a write without history
 * (a comment, a decision, archiving, a workspace's settings or members) notes its own.
 */
export function recordChange(tx: DatabaseTransaction): void {
  changedIn.add(tx);
}

/**
 * Checks that the idea or plan `table` row `id` still stands: not removed by undoing its
 * creation, and not archived when `guardArchive`. When `touch`, the same statement
 * moves its `last_activity_at` to `at`.
 */
async function checkStanding(
  tx: DatabaseTransaction,
  table: typeof ideas | typeof businessPlans,
  id: string,
  guardArchive: boolean,
  touch: Date | null,
): Promise<void> {
  const where = and(
    eq(table.id, id),
    isNull(table.deletedAt),
    guardArchive ? isNull(table.archivedAt) : undefined,
  );
  const standing =
    touch === null
      ? await tx.select({ id: table.id }).from(table).where(where)
      : await tx
          .update(table)
          .set({ lastActivityAt: touch })
          .where(where)
          .returning({ id: table.id });
  if (standing.length === 0) await refuseStale(tx, table, id);
}

/**
 * Locks the idea, then the plan, of `scope` for the rest of the transaction. Every
 * write takes them first and in this order, the order undoing a plan draft takes them
 * in too, so writes that also lock the plan row (its header, its archiving) cannot
 * deadlock with the others. `NO KEY UPDATE` lets rows that refer to them be inserted
 * meanwhile.
 */
async function lockScope(tx: DatabaseTransaction, scope: Scope): Promise<void> {
  if (scope.ideaId !== null) {
    await tx
      .select({ id: ideas.id })
      .from(ideas)
      .where(eq(ideas.id, scope.ideaId))
      .for("no key update");
  }
  if (scope.planId !== null) {
    await tx
      .select({ id: businessPlans.id })
      .from(businessPlans)
      .where(eq(businessPlans.id, scope.planId))
      .for("no key update");
  }
}

/**
 * The last step of every write in a scope: checks again that the idea and plan are
 * neither archived (as far as `scope.need` cares) nor removed by undoing their
 * creation, and, when the write changed something ({@link recordChange}), moves their
 * `last_activity_at` and the workspace's `last_active_at` (6.3, screen 28) to `at`.
 *
 * Archiving and undoing a creation update the same rows. Under the locks
 * {@link writeInScope} takes first, an archive started meanwhile waits for this write
 * to end, and one that ended before is seen here, so a write never survives an archive
 * it raced with (SDD 7.1「アーカイブ」, 5.11).
 *
 * @throws {ApiError} ARCHIVED or NOT_FOUND, which roll the transaction back.
 */
export async function finishWrite(
  tx: DatabaseTransaction,
  scope: Scope,
  at: Date,
): Promise<void> {
  const touch = changedIn.has(tx) ? at : null;
  const refuses = archiveRule(scope.need);
  if (scope.ideaId !== null) {
    await checkStanding(tx, ideas, scope.ideaId, refuses.idea, touch);
  }
  if (scope.planId !== null) {
    await checkStanding(tx, businessPlans, scope.planId, refuses.plan, touch);
  }
  if (touch !== null) {
    await tx
      .update(workspaces)
      .set({ lastActiveAt: touch })
      .where(eq(workspaces.id, scope.workspaceId));
  }
}

/**
 * Runs `work` in one transaction between the locks of its scope and
 * {@link finishWrite}: the way every write in a workspace goes, so none skips the final
 * archive check or the last activity. Writes to a self-analysis, which has no
 * workspace, open their own transaction.
 *
 * @param lockFirst Takes the locks that must come before the scope's rows, such as the
 * workspace's members lock (membership.ts `lockMembers`).
 */
export function writeInScope<T>(
  db: Database,
  scope: Scope,
  at: Date,
  work: (tx: DatabaseTransaction) => Promise<T>,
  lockFirst?: (tx: DatabaseTransaction) => Promise<void>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await lockFirst?.(tx);
    await lockScope(tx, scope);
    const result = await work(tx);
    await finishWrite(tx, scope, at);
    return result;
  });
}
