import { schema } from "@moonx/db";
import type { ConflictCurrent } from "@moonx/schemas";
import { and, eq, isNull, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor, Tx } from "./db";
import { checkLock, type LockedRow, type LockInput } from "./lock";
import { loadUserRefs, userRefOrNull } from "./users";

/**
 * Marks the idea and its workspace as active: workspace content changed (SDD 6.3). It is the last
 * step of every content write, and it refuses an archived idea: the update waits for a concurrent
 * archive to commit and then finds no row, so a write can never land on an idea archived between
 * the permission check and the commit (409 ARCHIVED, design-spec 6.8).
 * `updated_at` is kept as it is: it belongs to the summary's own editor (`updated_by_id`).
 */
export async function touchValidationActivity(
  tx: Tx,
  ids: { workspaceId: string; ideaId: string },
  now: Date,
): Promise<void> {
  const touched = await tx
    .update(schema.ideas)
    .set({ lastActivityAt: now, updatedAt: sql`${schema.ideas.updatedAt}` })
    .where(and(eq(schema.ideas.id, ids.ideaId), isNull(schema.ideas.archivedAt)))
    .returning({ id: schema.ideas.id });
  if (touched.length === 0) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  await tx
    .update(schema.workspaces)
    .set({ lastActiveAt: now, updatedAt: sql`${schema.workspaces.updatedAt}` })
    .where(eq(schema.workspaces.id, ids.workspaceId));
}

/**
 * `checkLock` for items whose current content takes queries to build: the content is only built
 * when the lock does not match.
 */
export async function checkLockLazily(
  db: Executor,
  opts: {
    workspaceId: string | null;
    row: LockedRow | null;
    sent: LockInput;
    currentValue: () => Promise<unknown>;
  },
): Promise<number> {
  const mismatch = opts.sent.lockVersion !== (opts.row?.lockVersion ?? 0) && !opts.sent.force;
  const value = mismatch ? await opts.currentValue() : undefined;
  return checkLock(db, { ...opts, currentValue: () => value });
}

/**
 * A keyed item (answer, number) that had no row when read got one from someone else before this
 * request could insert it. The request was based on version 0, so it is a conflict even with
 * `force`: the caller has not seen what is there now.
 */
export async function lostInsertRace(
  db: Executor,
  opts: {
    workspaceId: string | null;
    row: LockedRow | null;
    currentValue: () => Promise<unknown>;
  },
): Promise<never> {
  const refs = await loadUserRefs(db, [opts.row?.updatedById], opts.workspaceId);
  const current: ConflictCurrent = {
    value: await opts.currentValue(),
    lockVersion: opts.row?.lockVersion ?? 0,
    updatedAt: (opts.row?.updatedAt ?? new Date()).toISOString(),
    updatedBy: userRefOrNull(refs, opts.row?.updatedById),
  };
  throw new ApiError("CONFLICT", "The item was changed by someone else", { current });
}
