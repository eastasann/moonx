import { isDeepStrictEqual } from "node:util";
import { schema } from "@moonx/db";
import type { HistorySource, TargetType } from "@moonx/schemas";
import type { ClientKind } from "../lib/client";
import type { Tx } from "../lib/db";

/** Who changed what, and how: the part of a history row that does not depend on the item. */
export interface HistoryActor {
  userId: string;
  client: ClientKind;
  source: HistorySource;
  /** Groups the rows of one operation (AI import, migration, plan draft, duplicate). */
  batchId?: string | null;
}

/** Where a change happened and who made it: the part of a history row that is not the before/after content. */
export interface HistoryMeta {
  container: { type: "self_analysis" | "validation" | "business_plan" | "idea"; id: string };
  /** null for self-analysis history, which only its owner reads. */
  workspaceId: string | null;
  ownerUserId?: string | null;
  sectionKey?: string | null;
  target: { type: TargetType; id: string; key?: string | null };
  actor: HistoryActor;
  /** Defaults to create (no `before`), delete (no `after`) or update. */
  action?: "create" | "update" | "delete" | "restore";
  revertedFromId?: string | null;
}

/** What a `withHistory` callback returns: the handler result and the item before and after the change. */
export interface Mutation<T> {
  result: T;
  /** The item as `history/snapshots.ts` describes it before and after; null when absent. */
  before: unknown | null;
  after: unknown | null;
}

/**
 * Runs `mutate` and writes its change to `change_history` in the same transaction (ADR-020).
 * Every update of a history-tracked table goes through here, so a change cannot be saved without
 * its record. An update that changes nothing writes no row.
 */
export async function withHistory<T>(
  tx: Tx,
  meta: HistoryMeta,
  mutate: () => Promise<Mutation<T>>,
): Promise<T> {
  const { result, before, after } = await mutate();
  const action = meta.action ?? (before == null ? "create" : after == null ? "delete" : "update");
  if (action === "update" && isDeepStrictEqual(before, after)) return result;
  await tx.insert(schema.changeHistory).values({
    workspaceId: meta.workspaceId,
    ownerUserId: meta.ownerUserId ?? null,
    containerType: meta.container.type,
    containerId: meta.container.id,
    sectionKey: meta.sectionKey ?? null,
    targetType: meta.target.type,
    targetId: meta.target.id,
    targetKey: meta.target.key ?? null,
    action,
    before: before ?? null,
    after: after ?? null,
    source: meta.actor.source,
    batchId: meta.actor.batchId ?? null,
    client: meta.actor.client,
    revertedFromId: meta.revertedFromId ?? null,
    changedById: meta.actor.userId,
  });
  return result;
}
