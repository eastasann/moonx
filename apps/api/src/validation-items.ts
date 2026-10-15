import {
  comments,
  type Database,
  type DatabaseTransaction,
  evidenceLinks,
  type evidenceTargetType,
  researchLogEntries,
} from "@moonx/db";
import { fauState } from "@moonx/domain";
import type {
  Classification,
  Confidence,
  Evidence,
  Fau,
  TargetRef,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";

type Executor = Database | DatabaseTransaction;

/** An item comments, evidence and history point at (SDD 5.1 TargetRef). */
export type ItemRef = Pick<TargetRef, "type" | "id"> & { key?: string | null };

/** The items evidence may be attached to (M2). */
export type EvidenceRef = {
  type: (typeof evidenceTargetType.enumValues)[number];
  id: string;
  key?: string | null;
};

/** One string per item, to key maps by. */
export const itemKey = (ref: ItemRef) =>
  `${ref.type}/${ref.id}/${ref.key ?? ""}`;

/** The evidence attached to an item, oldest first, and how much of it counts. */
export interface ItemEvidence {
  evidence: Evidence[];
  /** Links whose research log is not deleted, and URLs (design-spec 6.0.3). */
  activeCount: number;
}

const NO_EVIDENCE: ItemEvidence = { evidence: [], activeCount: 0 };

/**
 * The evidence attached (not detached) to each item of `refs` in `validationId`, links
 * to deleted research logs included as `deleted` (SDD 5.2 Evidence).
 */
export async function loadEvidence(
  db: Executor,
  validationId: string,
  refs: readonly ItemRef[],
): Promise<(ref: ItemRef) => ItemEvidence> {
  const ids = [...new Set(refs.map((ref) => ref.id))];
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({
            id: evidenceLinks.id,
            targetType: evidenceLinks.targetType,
            targetId: evidenceLinks.targetId,
            targetKey: evidenceLinks.targetKey,
            url: evidenceLinks.url,
            note: evidenceLinks.note,
            logId: researchLogEntries.id,
            observedOn: researchLogEntries.observedOn,
            topic: researchLogEntries.topic,
            sourceType: researchLogEntries.sourceType,
            logDeletedAt: researchLogEntries.deletedAt,
          })
          .from(evidenceLinks)
          .leftJoin(
            researchLogEntries,
            eq(researchLogEntries.id, evidenceLinks.researchLogEntryId),
          )
          .where(
            and(
              eq(evidenceLinks.validationId, validationId),
              inArray(evidenceLinks.targetId, ids),
              isNull(evidenceLinks.deletedAt),
            ),
          )
          .orderBy(asc(evidenceLinks.createdAt), asc(evidenceLinks.id));
  const byItem = new Map<string, ItemEvidence>();
  for (const row of rows) {
    const key = itemKey({
      type: row.targetType,
      id: row.targetId,
      key: row.targetKey,
    });
    const item = byItem.get(key) ?? { evidence: [], activeCount: 0 };
    const deleted = row.logId !== null && row.logDeletedAt !== null;
    item.evidence.push({
      id: row.id,
      kind: row.logId === null ? "url" : "research_log",
      researchLog:
        row.logId === null || row.topic === null
          ? null
          : {
              id: row.logId,
              observedOn: row.observedOn,
              topic: row.topic,
              sourceType: row.sourceType,
              deleted,
            },
      url: row.url,
      note: row.note,
    });
    if (!deleted) item.activeCount += 1;
    byItem.set(key, item);
  }
  return (ref) => byItem.get(itemKey(ref)) ?? NO_EVIDENCE;
}

/** The F/A/U of an item and the evidence behind it (SDD 5.2 Classification). */
export const classificationOf = (
  item: { hasValue: boolean; fau: Fau | null; confidence: Confidence | null },
  { evidence, activeCount }: ItemEvidence,
): Classification => ({
  fau: item.fau,
  confidence: item.confidence,
  state: fauState({
    hasValue: item.hasValue,
    fau: item.fau,
    confidence: item.confidence,
    activeEvidenceCount: activeCount,
  }),
  evidence,
});

/**
 * How many comments each item of `refs` has, replies included and deleted ones left
 * out: the count beside an item (`commentCount`).
 */
export async function loadCommentCounts(
  db: Executor,
  refs: readonly ItemRef[],
): Promise<(ref: ItemRef) => number> {
  const ids = [...new Set(refs.map((ref) => ref.id))];
  const rows =
    ids.length === 0
      ? []
      : await db
          .select({
            targetType: comments.targetType,
            targetId: comments.targetId,
            targetKey: comments.targetKey,
            count: sql<number>`count(*)::int`,
          })
          .from(comments)
          .where(
            and(inArray(comments.targetId, ids), isNull(comments.deletedAt)),
          )
          .groupBy(comments.targetType, comments.targetId, comments.targetKey);
  const counts = new Map(
    rows.map((row) => [
      itemKey({ type: row.targetType, id: row.targetId, key: row.targetKey }),
      row.count,
    ]),
  );
  return (ref) => counts.get(itemKey(ref)) ?? 0;
}

/**
 * The ids of the evidence links attached to one item, oldest first: what its history
 * rows keep as `evidenceIds`.
 */
export async function attachedEvidenceIds(
  db: Executor,
  validationId: string,
  ref: EvidenceRef,
): Promise<string[]> {
  const rows = await db
    .select({ id: evidenceLinks.id })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.validationId, validationId),
        eq(evidenceLinks.targetType, ref.type),
        eq(evidenceLinks.targetId, ref.id),
        ref.key === undefined || ref.key === null
          ? isNull(evidenceLinks.targetKey)
          : eq(evidenceLinks.targetKey, ref.key),
        isNull(evidenceLinks.deletedAt),
      ),
    )
    .orderBy(asc(evidenceLinks.createdAt), asc(evidenceLinks.id));
  return rows.map((row) => row.id);
}

/** How many of the item's attached links count: their log is not deleted, or a URL. */
export async function activeEvidenceCount(
  db: Executor,
  validationId: string,
  ref: EvidenceRef,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(evidenceLinks)
    .leftJoin(
      researchLogEntries,
      eq(researchLogEntries.id, evidenceLinks.researchLogEntryId),
    )
    .where(
      and(
        eq(evidenceLinks.validationId, validationId),
        eq(evidenceLinks.targetType, ref.type),
        eq(evidenceLinks.targetId, ref.id),
        ref.key === undefined || ref.key === null
          ? isNull(evidenceLinks.targetKey)
          : eq(evidenceLinks.targetKey, ref.key),
        isNull(evidenceLinks.deletedAt),
        or(
          isNull(evidenceLinks.researchLogEntryId),
          isNull(researchLogEntries.deletedAt),
        ),
      ),
    );
  return row?.count ?? 0;
}
