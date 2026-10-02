import { isDeepStrictEqual } from "node:util";
import type { TargetType } from "@moonx/schemas";
import { ApiError } from "../errors";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Db, Tx } from "./db";
import type { LockedRow, LockInput } from "./lock";
import type { Scope } from "./scope";
import {
  activeEvidenceIds,
  checkItemLock,
  lockValidation,
  touchActivity,
} from "./validation-table-dto";

/** The columns every row of the validation lists carries. */
export interface ItemRow extends LockedRow {
  id: string;
}

/** What every write of the competitors, assumptions and risks tables runs with. */
export interface WriteEnv {
  db: Db;
  now: () => Date;
  scope: Scope;
  actor: HistoryActor;
}

/** How a table's rows are recorded in the history. */
export interface WriteSpec<R extends ItemRow> {
  targetType: TargetType;
  /** `change_history.section_key` (design-spec 6.0.5): "competitors", "costs", ... */
  sectionKey: string;
  /** The evidence target whose links a snapshot lists; null for rows evidence cannot point at. */
  evidenceOf: ((row: R) => { type: "competitor" | "assumption" | "cost_item"; id: string }) | null;
  snapshot: (row: R, evidence: string[]) => unknown;
}

/** The columns every row write stamps: the next lock version, the editor and the time. */
export interface WriteStamp {
  lockVersion: number;
  updatedById: string;
  now: Date;
}

const historyMeta = (env: WriteEnv, spec: WriteSpec<ItemRow>, id: string) => ({
  container: { type: "validation" as const, id: env.scope.validationId as string },
  workspaceId: env.scope.workspaceId,
  sectionKey: spec.sectionKey,
  target: { type: spec.targetType, id },
  actor: env.actor,
});

async function evidenceIdsOf<R extends ItemRow>(tx: Tx, spec: WriteSpec<R>, row: R) {
  const target = spec.evidenceOf?.(row);
  return target ? activeEvidenceIds(tx, { ...target, key: null }) : [];
}

/**
 * Creates one row and its history row in one transaction. The validation row is locked first so
 * two creates cannot take the same `sort_order`.
 */
export async function createItem<R extends ItemRow>(
  env: WriteEnv,
  spec: WriteSpec<R>,
  insert: (tx: Tx, id: string, stamp: WriteStamp) => Promise<R>,
): Promise<R> {
  const id = crypto.randomUUID();
  const now = env.now();
  return env.db.transaction(async (tx) => {
    await lockValidation(tx, env.scope.validationId as string);
    const row = await withHistory(
      tx,
      historyMeta(env, spec as WriteSpec<ItemRow>, id),
      async () => {
        const inserted = await insert(tx, id, {
          lockVersion: 0,
          updatedById: env.actor.userId,
          now,
        });
        return { result: inserted, before: null, after: spec.snapshot(inserted, []) };
      },
    );
    await touchActivity(tx, env.scope, now);
    return row;
  });
}

class NothingChanged extends Error {}

/**
 * Updates one row under its optimistic lock and writes the history row in the same transaction
 * (ADR-019, ADR-020). `apply` decides the new columns and may refuse the request; it runs after
 * the lock check, with the row read `FOR UPDATE`.
 */
export async function updateItem<R extends ItemRow>(
  env: WriteEnv,
  spec: WriteSpec<R>,
  opts: {
    lock: LockInput;
    readRow: (tx: Tx) => Promise<R | undefined>;
    /** Builds the conflict body; it reads through the transaction's own connection. */
    loadCurrent: (tx: Tx) => Promise<unknown>;
    apply: (tx: Tx, row: R, stamp: WriteStamp) => Promise<R>;
  },
): Promise<R> {
  const now = env.now();
  return env.db.transaction(async (tx) => {
    const row = await opts.readRow(tx);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    const lockVersion = await checkItemLock(tx, {
      workspaceId: env.scope.workspaceId,
      row,
      sent: opts.lock,
      loadCurrent: opts.loadCurrent,
    });
    const evidence = await evidenceIdsOf(tx, spec, row);
    const before = spec.snapshot(row, evidence);
    try {
      // A savepoint: a request that changes nothing must leave no trace, neither a history row
      // nor a bumped lock version, so `apply` is undone when the snapshots turn out equal.
      const updated = await tx.transaction((savepoint) =>
        withHistory(savepoint, historyMeta(env, spec as WriteSpec<ItemRow>, row.id), async () => {
          const next = await opts.apply(savepoint, row, {
            lockVersion,
            updatedById: env.actor.userId,
            now,
          });
          const after = spec.snapshot(next, evidence);
          if (isDeepStrictEqual(before, after)) throw new NothingChanged();
          return { result: next, before, after };
        }),
      );
      await touchActivity(tx, env.scope, now);
      return updated;
    } catch (error) {
      if (error instanceof NothingChanged) return row;
      throw error;
    }
  });
}

/** Soft-deletes one row (history action `delete`); restoring it is a history revert (Step 8). */
export async function deleteItem<R extends ItemRow>(
  env: WriteEnv,
  spec: WriteSpec<R>,
  opts: {
    readRow: (tx: Tx) => Promise<R | undefined>;
    markDeleted: (tx: Tx, row: R, stamp: WriteStamp) => Promise<void>;
  },
): Promise<void> {
  const now = env.now();
  await env.db.transaction(async (tx) => {
    const row = await opts.readRow(tx);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    const evidence = await evidenceIdsOf(tx, spec, row);
    await withHistory(tx, historyMeta(env, spec as WriteSpec<ItemRow>, row.id), async () => {
      await opts.markDeleted(tx, row, {
        lockVersion: row.lockVersion + 1,
        updatedById: env.actor.userId,
        now,
      });
      return { result: undefined, before: spec.snapshot(row, evidence), after: null };
    });
    await touchActivity(tx, env.scope, now);
  });
}
