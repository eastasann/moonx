import { schema } from "@moonx/db";
import type {
  Assumption,
  Classification,
  Competitor,
  Confidence,
  Risk,
  UserRef,
  Versioned,
} from "@moonx/schemas";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Executor, Tx } from "./db";
import { UNSAVED, versionedOf } from "./dto";
import { checkLock, type LockedRow, type LockInput } from "./lock";
import type { Scope } from "./scope";
import { loadUserRefs } from "./users";
import {
  type AnswerRow,
  type AssumptionRow,
  buildClassification,
  type CompetitorRow,
  evidenceFor,
  hasText,
  type RiskRow,
  toEvidence,
  type ValidationData,
} from "./validation-data";
import { touchValidationActivity } from "./validation-write";

type CommentTarget = (typeof schema.comments.$inferSelect)["targetType"];

/**
 * Counts the comments of rows that are not deleted, replies included (design-spec 6.0.4). The
 * count is bounded by the workspace, like every other read of workspace data.
 */
export async function commentCountsById(
  db: Executor,
  workspaceId: string,
  type: CommentTarget,
  ids: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await db
    .select({ targetId: schema.comments.targetId, n: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        eq(schema.comments.targetType, type),
        inArray(schema.comments.targetId, ids),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetId);
  for (const row of rows) counts.set(row.targetId, row.n);
  return counts;
}

/** Comment counts of the keyed items of one validation (answers and economics inputs). */
export async function commentCountsByKey(
  db: Executor,
  workspaceId: string,
  type: "validation_answer" | "economics_input",
  validationId: string,
  keys: string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (keys.length === 0) return counts;
  const rows = await db
    .select({ targetKey: schema.comments.targetKey, n: sql<number>`count(*)::int` })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        eq(schema.comments.targetType, type),
        eq(schema.comments.targetId, validationId),
        inArray(schema.comments.targetKey, keys),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetKey);
  for (const row of rows) if (row.targetKey) counts.set(row.targetKey, row.n);
  return counts;
}

/** Loads the editors of the given rows as UserRefs. */
export async function userRefsOf(
  db: Executor,
  workspaceId: string,
  rows: { updatedById: string | null }[],
): Promise<Map<string, UserRef>> {
  return loadUserRefs(
    db,
    rows.map((r) => r.updatedById),
    workspaceId,
  );
}

/** The data a row is mapped with: the validation's rows, the editors and the comment counts. */
export interface DtoContext {
  data: ValidationData;
  refs: Map<string, UserRef>;
  comments: Map<string, number>;
}

/** Maps a competitor row to the Competitor of SDD 5.7. */
export function toCompetitor(c: DtoContext, row: CompetitorRow): Competitor {
  return {
    ...versionedOf(row, c.refs),
    id: row.id,
    name: row.name,
    type: row.type,
    targetCustomer: row.targetCustomer,
    offering: row.offering,
    typicalPrice: row.typicalPrice,
    priceNote: row.priceNote,
    strength: row.strength,
    weakness: row.weakness,
    whyChosen: row.whyChosen,
    whySurvive: row.whySurvive,
    evidence: evidenceFor(c.data, { type: "competitor", id: row.id, key: null }).map((l) =>
      toEvidence(c.data, l),
    ),
    sortOrder: row.sortOrder,
    commentCount: c.comments.get(row.id) ?? 0,
  };
}

/** Maps an assumption row to the Assumption of SDD 5.7. */
export function toAssumption(c: DtoContext, row: AssumptionRow): Assumption {
  return {
    ...versionedOf(row, c.refs),
    id: row.id,
    statement: row.statement,
    whyBelieve: row.whyBelieve,
    evidence: evidenceFor(c.data, { type: "assumption", id: row.id, key: null }).map((l) =>
      toEvidence(c.data, l),
    ),
    evidenceNote: row.evidenceNote,
    confidence: row.confidence,
    disproveCondition: row.disproveCondition,
    nextCheck: row.nextCheck,
    sortOrder: row.sortOrder,
    commentCount: c.comments.get(row.id) ?? 0,
  };
}

/** Maps a risk row to the Risk of SDD 5.7. */
export function toRisk(c: DtoContext, row: RiskRow): Risk {
  return {
    ...versionedOf(row, c.refs),
    id: row.id,
    statement: row.statement,
    probability: row.probability,
    impact: row.impact,
    whyMatters: row.whyMatters,
    mitigation: row.mitigation,
    howToValidate: row.howToValidate,
    sortOrder: row.sortOrder,
    commentCount: c.comments.get(row.id) ?? 0,
  };
}

const LEVEL_RANK: Record<Confidence, number> = { high: 3, medium: 2, low: 1 };
const rank = (level: Confidence | null) => (level ? LEVEL_RANK[level] : 0);

/**
 * Risks in screen order (design-spec 6.10): the rows a person has placed (`sortOrder` set) keep
 * their place and come first; the rest follow automatically, Impact then Probability, high
 * first, an unset level last, the older row first on a tie. Once a person reorders, every risk
 * has a `sortOrder`, so the two orders only meet when a restored row has none.
 */
export function orderRisks<
  T extends Pick<RiskRow, "sortOrder" | "impact" | "probability"> & { createdAt: Date },
>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.sortOrder != null && b.sortOrder != null) return a.sortOrder - b.sortOrder;
    if (a.sortOrder != null) return -1;
    if (b.sortOrder != null) return 1;
    return (
      rank(b.impact) - rank(a.impact) ||
      rank(b.probability) - rank(a.probability) ||
      a.createdAt.getTime() - b.createdAt.getTime()
    );
  });
}

/** A ValidationAnswer as the table screens return it. */
export interface TableAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  classification: Classification;
  hidden: boolean;
  commentCount: number;
}

/** One answer of a question the table screens show (V.04 patterns, V.08.WORTH). */
export function toTableAnswer(
  c: DtoContext,
  questionKey: string,
  row: AnswerRow | undefined,
): TableAnswer {
  const links = evidenceFor(c.data, {
    type: "validation_answer",
    id: c.data.validationId,
    key: questionKey,
  });
  return {
    ...(row ? versionedOf(row, c.refs) : UNSAVED),
    questionKey,
    text: row?.text ?? null,
    classification: buildClassification(c.data, {
      hasValue: hasText(row?.text),
      fau: row?.fau ?? null,
      confidence: row?.confidence ?? null,
      links,
    }),
    hidden: false,
    commentCount: c.comments.get(questionKey) ?? 0,
  };
}

/** The evidence links of one target that have not been removed: what a history snapshot lists. */
export async function activeEvidenceIds(
  db: Executor,
  target: {
    type: (typeof schema.evidenceLinks.$inferSelect)["targetType"];
    id: string;
    key: string | null;
  },
): Promise<string[]> {
  const rows = await db
    .select({ id: schema.evidenceLinks.id })
    .from(schema.evidenceLinks)
    .where(
      and(
        eq(schema.evidenceLinks.targetType, target.type),
        eq(schema.evidenceLinks.targetId, target.id),
        target.key == null
          ? isNull(schema.evidenceLinks.targetKey)
          : eq(schema.evidenceLinks.targetKey, target.key),
        isNull(schema.evidenceLinks.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
}

/**
 * How many evidence links of one target count: the ones not removed and not pointing at a deleted
 * research log (design-spec 6.0.3). This is what "Fact needs evidence" is judged on.
 */
export async function activeEvidenceCount(
  db: Executor,
  target: {
    type: (typeof schema.evidenceLinks.$inferSelect)["targetType"];
    id: string;
    key: string | null;
  },
): Promise<number> {
  const rows = await db
    .select({
      logDeletedAt: schema.researchLogEntries.deletedAt,
      logId: schema.evidenceLinks.researchLogEntryId,
    })
    .from(schema.evidenceLinks)
    .leftJoin(
      schema.researchLogEntries,
      eq(schema.researchLogEntries.id, schema.evidenceLinks.researchLogEntryId),
    )
    .where(
      and(
        eq(schema.evidenceLinks.targetType, target.type),
        eq(schema.evidenceLinks.targetId, target.id),
        target.key == null
          ? isNull(schema.evidenceLinks.targetKey)
          : eq(schema.evidenceLinks.targetKey, target.key),
        isNull(schema.evidenceLinks.deletedAt),
      ),
    );
  return rows.filter((r) => r.logId == null || r.logDeletedAt == null).length;
}

/** `touchValidationActivity` for a scope that was resolved from a validation. */
export function touchActivity(tx: Tx, scope: Scope, now: Date): Promise<void> {
  return touchValidationActivity(
    tx,
    { workspaceId: scope.workspaceId, ideaId: scope.ideaId as string },
    now,
  );
}

/**
 * Serializes the writers of one validation's lists. New rows take `max(sort_order) + 1` and
 * keyed items are created by upsert, which two concurrent requests would otherwise both do.
 */
export async function lockValidation(tx: Tx, validationId: string): Promise<void> {
  await tx
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.id, validationId))
    .for("update");
}

/**
 * `checkLock` for items whose conflict body is built from the database: the body is loaded only
 * when the versions differ and the caller did not force.
 */
export async function checkItemLock(
  tx: Tx,
  opts: {
    workspaceId: string;
    row: LockedRow | null;
    sent: LockInput;
    loadCurrent: (tx: Tx) => Promise<unknown>;
  },
): Promise<number> {
  const stale = opts.sent.lockVersion !== (opts.row?.lockVersion ?? 0) && !opts.sent.force;
  const current = stale ? await opts.loadCurrent(tx) : null;
  return checkLock(tx, {
    workspaceId: opts.workspaceId,
    row: opts.row,
    sent: opts.sent,
    currentValue: () => current,
  });
}
