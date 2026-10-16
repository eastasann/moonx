import { type Database, type DatabaseTransaction, users } from "@moonx/db";
import { eq, sql } from "drizzle-orm";
import { ApiError } from "./errors";
import { loadUserRefs } from "./user-refs";

/** An item under the optimistic lock as it is stored now (ADR-019). */
export interface LockedItem {
  /** What 409 CONFLICT shows the other person's version as (`current.value`). */
  value: unknown;
  lockVersion: number;
  updatedAt: Date;
  updatedById: string | null;
}

/** What a save sends about the version it read (SDD 5.1「同時編集」). */
export interface LockClaim {
  lockVersion: number;
  /** "Overwrite with mine": save over a newer version. */
  force?: boolean;
}

/**
 * The 409 CONFLICT of a save that lost to another (SDD 8.1), carrying the stored
 * version as `current` (5.2 ConflictCurrent). `workspaceId` decides whether its author
 * shows as a former member; null for a self-analysis.
 */
export async function conflictError(
  db: Database | DatabaseTransaction,
  current: LockedItem,
  workspaceId: string | null,
): Promise<ApiError> {
  const authors = await loadUserRefs(
    db,
    current.updatedById === null ? [] : [current.updatedById],
    workspaceId,
  );
  return new ApiError("CONFLICT", "Someone else saved this item first", {
    current: {
      value: current.value,
      lockVersion: current.lockVersion,
      updatedAt: current.updatedAt.toISOString(),
      updatedBy:
        current.updatedById === null
          ? null
          : (authors.get(current.updatedById) ?? null),
    },
  });
}

/**
 * Lets a save through when it read the stored version, or overwrites on purpose with
 * `force` (ADR-019). Read `current` with `FOR UPDATE` in the saving transaction, so no
 * other save slips in between. An item not stored yet (an unanswered question) has
 * nothing to lose and lets every save through; two first saves of the same keyed item
 * race at the insert instead ({@link createKeyedItem}).
 *
 * @throws {ApiError} CONFLICT
 */
export async function checkLockVersion(
  db: Database | DatabaseTransaction,
  current: LockedItem | null,
  claim: LockClaim,
  workspaceId: string | null,
): Promise<void> {
  if (
    current === null ||
    claim.force === true ||
    claim.lockVersion === current.lockVersion
  ) {
    return;
  }
  throw await conflictError(db, current, workspaceId);
}

/**
 * {@link checkLockVersion} for a keyed item (an answer, a number). A save that claims
 * version 0 never saw the stored row: another request made it first, and the writes in
 * an idea run one at a time, so this save reads that row instead of meeting it at the
 * insert. It lost the race to create the item and gets 409 CONFLICT even with `force`
 * (SDD 5.1「同時編集」), as {@link createKeyedItem} answers a save that does meet it.
 *
 * @throws {ApiError} CONFLICT
 */
export async function checkKeyedLockVersion(
  db: Database | DatabaseTransaction,
  current: LockedItem | null,
  claim: LockClaim,
  workspaceId: string | null,
): Promise<void> {
  if (current !== null && claim.lockVersion === 0) {
    throw await conflictError(db, current, workspaceId);
  }
  await checkLockVersion(db, current, claim, workspaceId);
}

/**
 * Creates a keyed item (an answer, a number) on its first save, or refuses the save that
 * lost the race to create it: two first saves both read nothing, and the second insert
 * meets the first one's row. The loser gets 409 CONFLICT with the winner's version even
 * with `force`, since it never read that version (SDD 5.1「同時編集」).
 *
 * @param insert Inserts the row with `onConflictDoNothing()` on the item's key and
 * returns it, or undefined when the key was taken. PostgreSQL makes it wait for a
 * concurrent insert of the key to commit first.
 * @param readCurrent Reads the stored item, once the key was taken.
 * @throws {ApiError} CONFLICT
 */
export async function createKeyedItem<T>(
  db: Database | DatabaseTransaction,
  insert: () => Promise<T | undefined>,
  readCurrent: () => Promise<LockedItem>,
  workspaceId: string | null,
): Promise<T> {
  const created = await insert();
  if (created !== undefined) return created;
  throw await conflictError(db, await readCurrent(), workspaceId);
}

/**
 * Holds the transaction-scoped advisory lock named `key` until `tx` ends: serializes
 * the transactions that take the same key without locking any row, so the writes that
 * need the rows go on meanwhile. Keys are namespaced (`moonx:<what>:<id>`); two keys
 * hashing alike only make their transactions wait for each other. A shared hold only
 * waits for, and holds off, exclusive ones.
 */
export async function advisoryLock(
  tx: DatabaseTransaction,
  key: string,
  mode: "exclusive" | "shared" = "exclusive",
): Promise<void> {
  await tx.execute(
    mode === "shared"
      ? sql`select pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`
      : sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
  );
}

/** The advisory lock of `userId`'s account, which {@link lockActiveCaller} takes. */
export const userLockKey = (userId: string) => `moonx:user:${userId}`;

/**
 * Serializes the caller's own writes that leave something of theirs behind (a
 * membership, an invitation they send, their profile, photo, password or
 * self-analysis) with the deletion of their account (U7) and its suspension (AD8),
 * which hold the same lock exclusively: each runs whole before the other starts. A
 * write that waited for U7 then finds the account gone and is refused, as a request of
 * a deleted user is (SDD 7.1「停止・削除したユーザー」); one that ran first leaves what
 * U7 then deletes or revokes. Writes hold it shared, so they do not wait for each
 * other, except those that must also run one at a time per user (U8). Take it before
 * any other lock.
 *
 * @throws {ApiError} UNAUTHENTICATED when the account is no longer active
 */
export async function lockActiveCaller(
  tx: DatabaseTransaction,
  userId: string,
  mode: "exclusive" | "shared" = "shared",
): Promise<void> {
  await advisoryLock(tx, userLockKey(userId), mode);
  const [user] = await tx
    .select({ status: users.status })
    .from(users)
    .where(eq(users.id, userId));
  if (user?.status !== "active") {
    throw new ApiError("UNAUTHENTICATED", "The account is no longer active");
  }
}

/**
 * Serializes the invitations to `workspaceId`, or to no workspace for null, until the
 * transaction ends: W4, W5, AD9 and `make admin-create` check for another valid
 * invitation to the address under it, so two cannot both pass. Not the workspace row:
 * these transactions wait for Resend, and the writes inside the workspace update that
 * row (SDD 5.5).
 */
export const lockInvitations = (
  tx: DatabaseTransaction,
  workspaceId: string | null,
) => advisoryLock(tx, `moonx:invitations:${workspaceId ?? "none"}`);
