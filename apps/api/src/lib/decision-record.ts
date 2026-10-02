import { schema } from "@moonx/db";
import type { CheckResult, DecisionValue, FauBreakdown, KeyMetrics } from "@moonx/schemas";
import { and, desc, eq, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor, Tx } from "./db";
import { type DecisionLogSummary, loadDecisionSummaries } from "./decision-log";
import { notifyDecisionRecorded } from "./notify";
import type { ValidationState } from "./validation-data";

/** SDD 5.11 DecisionLogEntry. */
export interface DecisionLogEntry extends DecisionLogSummary {
  reason: string | null;
  snapshot: {
    missingChecks: CheckResult[];
    keyMetrics: KeyMetrics;
    fau: FauBreakdown;
  };
}

/** `decision_log_entries.snapshot` of a validation decision: what the decision screen showed. */
export function validationDecisionSnapshot(state: ValidationState): DecisionLogEntry["snapshot"] {
  return {
    missingChecks: state.checks.filter((c) => c.state !== "done"),
    keyMetrics: state.keyMetrics,
    fau: state.fau,
  };
}

const VALIDATION_DECISION = eq(schema.decisionLogEntries.kind, "validation_decision");

/** Newest validation decision of an idea, as the summary the screens show. */
export async function latestValidationDecision(
  db: Executor,
  workspaceId: string,
  ideaId: string,
): Promise<DecisionLogSummary | null> {
  const [summary] = await loadDecisionSummaries(
    db,
    workspaceId,
    and(
      eq(schema.decisionLogEntries.workspaceId, workspaceId),
      eq(schema.decisionLogEntries.ideaId, ideaId),
      VALIDATION_DECISION,
    ),
    1,
  );
  return summary ?? null;
}

/** The V19 request as the recording function needs it. */
export interface RecordDecisionInput {
  workspaceId: string;
  ideaId: string;
  recorder: { id: string };
  value: DecisionValue;
  reason: string;
  basedOnDecisionId: string | null;
  confirmNewer: boolean;
  /** Runs after the idea row is locked, so the snapshot reflects what the recorder's screen could see. */
  snapshot: () => Promise<DecisionLogEntry["snapshot"]>;
  now: Date;
}

/**
 * Appends a validation decision (SDD 5.7 V19). The idea row is locked first, so two people
 * deciding at once are serialized and the second one sees the first as "newer". Decisions live
 * in the append-only decision log and are not in `change_history` (SDD 6.0.5).
 */
export async function recordValidationDecision(
  tx: Tx,
  input: RecordDecisionInput,
): Promise<{ entryId: string }> {
  const { workspaceId, ideaId, recorder, now } = input;
  const [idea] = await tx
    .select({ archivedAt: schema.ideas.archivedAt })
    .from(schema.ideas)
    .where(and(eq(schema.ideas.id, ideaId), eq(schema.ideas.workspaceId, workspaceId)))
    .for("update");
  if (idea?.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");

  const [newest] = await tx
    .select({
      id: schema.decisionLogEntries.id,
      recordedAt: schema.decisionLogEntries.recordedAt,
    })
    .from(schema.decisionLogEntries)
    .where(
      and(
        eq(schema.decisionLogEntries.workspaceId, workspaceId),
        eq(schema.decisionLogEntries.ideaId, ideaId),
        VALIDATION_DECISION,
      ),
    )
    .orderBy(desc(schema.decisionLogEntries.recordedAt), desc(schema.decisionLogEntries.createdAt))
    .limit(1);
  if ((newest?.id ?? null) !== input.basedOnDecisionId && !input.confirmNewer) {
    const latest = await latestValidationDecision(tx, workspaceId, ideaId);
    throw new ApiError("DECISION_CHANGED", "A newer decision was recorded", { latest });
  }

  // `now` was taken before this request waited for the lock; the entry must still sort after the
  // one that was committed meanwhile, or "newest" and `ideas.latest_decision` would disagree.
  const recordedAt = newest
    ? new Date(Math.max(now.getTime(), newest.recordedAt.getTime() + 1))
    : now;
  const [entry] = await tx
    .insert(schema.decisionLogEntries)
    .values({
      workspaceId,
      ideaId,
      kind: "validation_decision",
      value: input.value,
      reason: input.reason,
      snapshot: await input.snapshot(),
      recordedById: recorder.id,
      recordedAt,
    })
    .returning({ id: schema.decisionLogEntries.id });
  const entryId = (entry as { id: string }).id;

  await tx
    .update(schema.ideas)
    .set({
      latestDecision: input.value,
      lastActivityAt: recordedAt,
      updatedAt: sql`${schema.ideas.updatedAt}`,
    })
    .where(eq(schema.ideas.id, ideaId));
  await tx
    .update(schema.workspaces)
    .set({ lastActiveAt: recordedAt, updatedAt: sql`${schema.workspaces.updatedAt}` })
    .where(eq(schema.workspaces.id, workspaceId));

  await notifyDecisionRecorded(tx, {
    workspaceId,
    recorderId: recorder.id,
    entryId,
    link: { screen: 13, workspaceId, ideaId },
  });
  return { entryId };
}

/** The entry as V19 answers it: the summary of the new row plus reason and snapshot. */
export async function loadDecisionEntry(
  db: Executor,
  workspaceId: string,
  entryId: string,
): Promise<DecisionLogEntry> {
  const [summary] = await loadDecisionSummaries(
    db,
    workspaceId,
    and(
      eq(schema.decisionLogEntries.workspaceId, workspaceId),
      eq(schema.decisionLogEntries.id, entryId),
    ),
    1,
  );
  const [row] = await db
    .select({
      reason: schema.decisionLogEntries.reason,
      snapshot: schema.decisionLogEntries.snapshot,
    })
    .from(schema.decisionLogEntries)
    .where(eq(schema.decisionLogEntries.id, entryId));
  if (!summary || !row) throw new ApiError("NOT_FOUND", "Decision not found");
  return {
    ...summary,
    reason: row.reason,
    snapshot: row.snapshot as DecisionLogEntry["snapshot"],
  };
}
