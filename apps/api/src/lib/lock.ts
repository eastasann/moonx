import type { ConflictCurrent } from "@moonx/schemas";
import { ApiError } from "../errors";
import type { Executor } from "./db";
import { loadUserRefs, userRefOrNull } from "./users";

/** The columns of an item row that the optimistic lock reads. */
export interface LockedRow {
  lockVersion: number;
  updatedAt: Date;
  updatedById: string | null;
}

/** The `lockVersion`/`force` pair every item update carries (ADR-019). */
export interface LockInput {
  lockVersion: number;
  force?: boolean;
}

/**
 * Checks the optimistic lock of one item. `row` is the item as read `FOR UPDATE` in the current
 * transaction, or null when it has no row yet (a keyed item nobody has answered), whose version
 * is 0. A mismatch is a 409 CONFLICT carrying the other person's content, unless `force` says the
 * caller chose to overwrite it. Returns the version the updated row must get.
 */
export async function checkLock(
  db: Executor,
  opts: {
    workspaceId: string | null;
    row: LockedRow | null;
    sent: LockInput;
    /** The item's current content in the response shape of the endpoint. */
    currentValue: () => unknown;
  },
): Promise<number> {
  const current = opts.row?.lockVersion ?? 0;
  if (opts.sent.lockVersion !== current && !opts.sent.force) {
    const refs = await loadUserRefs(db, [opts.row?.updatedById], opts.workspaceId);
    const body: ConflictCurrent = {
      value: opts.currentValue(),
      lockVersion: current,
      updatedAt: (opts.row?.updatedAt ?? new Date()).toISOString(),
      updatedBy: userRefOrNull(refs, opts.row?.updatedById),
    };
    throw new ApiError("CONFLICT", "The item was changed by someone else", { current: body });
  }
  return current + 1;
}
