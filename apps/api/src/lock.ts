import type { Database, DatabaseTransaction } from "@moonx/db";
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
