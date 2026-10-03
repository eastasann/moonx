import { schema } from "@moonx/db";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Db, Executor, Tx } from "./db";
import { reportable } from "./error-report";
import { touchWorkspace } from "./idea-write";
import { touchValidationActivity } from "./validation-write";

type HistoryRow = typeof schema.changeHistory.$inferSelect;

/** The sources whose H3 takes back a creation by deleting what it made (SDD 5.11). */
export const CREATION_SOURCES = new Set<string>(["duplicate", "plan_draft"]);

const notFound = () => new ApiError("NOT_FOUND", "Resource not found");
const somethingAdded = () =>
  new ApiError("CONFLICT", "Something was added after this was created, so it cannot be undone");

/**
 * Whether anything besides the operation itself touched these containers: history rows of
 * another operation, or of no operation at all (a manual edit).
 */
async function hasOtherHistory(
  tx: Executor,
  batchId: string,
  containers: { type: HistoryRow["containerType"]; id: string }[],
): Promise<boolean> {
  const h = schema.changeHistory;
  const [row] = await tx
    .select({ id: h.id })
    .from(h)
    .where(
      and(
        or(...containers.map((c) => and(eq(h.containerType, c.type), eq(h.containerId, c.id)))),
        or(isNull(h.batchId), ne(h.batchId, batchId)),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/** Comments, deleted ones included: a deleted comment still points at the target. */
async function hasComments(tx: Executor, workspaceId: string, targetIds: string[]) {
  const [row] = await tx
    .select({ id: schema.comments.id })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        inArray(schema.comments.targetId, targetIds),
      ),
    )
    .limit(1);
  return row !== undefined;
}

/**
 * H3 on a `duplicate` or `plan_draft` batch: deletes the idea (or the plan draft) the operation
 * made, together with the batch's history rows, in one transaction. It refuses with
 * `409 CONFLICT` when anything was added to the created records afterwards, so that later work
 * is never taken along (SDD 5.11 "作成の取り消し"). There is no revert history: the records and the
 * screen it would belong to are gone.
 */
export async function undoCreation(
  db: Db,
  p: { batchId: string; now: Date },
): Promise<{ reverted: number; batchId: string }> {
  const { batchId } = p;
  return attempt(() =>
    db.transaction(async (tx) => {
      // Same key as the other H3 paths: a repeated or concurrent request waits and then finds
      // no rows.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${batchId}::text, 0))`);
      // For the one wait NOWAIT does not cover: the delete waits for a write that inserted a row
      // under the parent. Shorter than `deadlock_timeout` (1 s), so the undo gives up first.
      await tx.execute(sql`set local lock_timeout = '500ms'`);
      const rows = await tx
        .select()
        .from(schema.changeHistory)
        .where(eq(schema.changeHistory.batchId, batchId));
      const first = rows[0];
      if (!first) throw notFound();
      const source = first.source;
      const workspaceId = first.workspaceId as string;
      const targetIds = [...new Set(rows.map((r) => r.targetId))];
      if (source === "duplicate") {
        await undoDuplicate(tx, { rows, batchId, workspaceId, targetIds, now: p.now });
      } else {
        await undoPlanDraft(tx, { rows, batchId, workspaceId, targetIds, now: p.now });
      }
      await tx.delete(schema.changeHistory).where(eq(schema.changeHistory.batchId, batchId));
      return { reverted: rows.length, batchId };
    }),
  );
}

/** A lock the undo could not get in time means a write is in progress, which is also "something was added". */
async function attempt<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const { code } = reportable(error);
    if (code === "55P03" || code === "40P01") {
      throw new ApiError("CONFLICT", "Something is being changed right now. Try again.");
    }
    throw error;
  }
}

interface Undo {
  rows: HistoryRow[];
  batchId: string;
  workspaceId: string;
  targetIds: string[];
  now: Date;
}

async function undoDuplicate(tx: Tx, u: Undo): Promise<void> {
  const ideaRow = u.rows.find((r) => r.targetType === "idea");
  if (!ideaRow) throw notFound();
  const ideaId = ideaRow.targetId;
  const [validation] = await tx
    .select({ id: schema.validations.id })
    .from(schema.validations)
    .where(eq(schema.validations.ideaId, ideaId));
  if (!validation) throw notFound();
  const validationId = validation.id;
  // NOWAIT: the undo never waits for a lock while it holds others, so a write in progress is never
  // made the victim of a deadlock. It answers 409 and the person tries again.
  for (const [table, column] of [
    [schema.validationAnswers, schema.validationAnswers.validationId],
    [schema.economicsInputs, schema.economicsInputs.validationId],
    [schema.researchLogEntries, schema.researchLogEntries.validationId],
    [schema.competitors, schema.competitors.validationId],
    [schema.assumptions, schema.assumptions.validationId],
    [schema.risks, schema.risks.validationId],
    [schema.costItems, schema.costItems.validationId],
    [schema.evidenceLinks, schema.evidenceLinks.validationId],
  ] as const) {
    await tx.select().from(table).where(eq(column, validationId)).for("update", { noWait: true });
  }
  const [idea] = await tx
    .select({ archivedAt: schema.ideas.archivedAt })
    .from(schema.ideas)
    .where(and(eq(schema.ideas.id, ideaId), eq(schema.ideas.workspaceId, u.workspaceId)))
    .for("update", { noWait: true });
  if (!idea) throw notFound();
  if (idea.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");

  const [plan] = await tx
    .select({ id: schema.businessPlans.id })
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.ideaId, ideaId))
    .limit(1);
  const [decision] = await tx
    .select({ id: schema.decisionLogEntries.id })
    .from(schema.decisionLogEntries)
    .where(eq(schema.decisionLogEntries.ideaId, ideaId))
    .limit(1);
  const [copy] = await tx
    .select({ id: schema.ideas.id })
    .from(schema.ideas)
    .where(eq(schema.ideas.duplicatedFromId, ideaId))
    .limit(1);
  if (
    plan ||
    decision ||
    copy ||
    (await hasOtherHistory(tx, u.batchId, [
      { type: "idea", id: ideaId },
      { type: "validation", id: validationId },
    ])) ||
    (await hasComments(tx, u.workspaceId, [...new Set([ideaId, validationId, ...u.targetIds])]))
  ) {
    throw somethingAdded();
  }

  await tx.delete(schema.ideas).where(eq(schema.ideas.id, ideaId));
  await touchWorkspace(tx, u.workspaceId, u.now);
}

async function undoPlanDraft(tx: Tx, u: Undo): Promise<void> {
  const planRow = u.rows.find((r) => r.targetType === "business_plan");
  if (!planRow) throw notFound();
  const planId = planRow.targetId;
  const [found] = await tx
    .select({ ideaId: schema.businessPlans.ideaId })
    .from(schema.businessPlans)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .where(and(eq(schema.businessPlans.id, planId), eq(schema.ideas.workspaceId, u.workspaceId)));
  if (!found) throw notFound();
  const { ideaId } = found;
  // NOWAIT, for the reason given in `undoDuplicate`.
  await tx
    .select()
    .from(schema.planAnswers)
    .where(eq(schema.planAnswers.businessPlanId, planId))
    .for("update", { noWait: true });
  await tx
    .select()
    .from(schema.executionItems)
    .where(eq(schema.executionItems.businessPlanId, planId))
    .for("update", { noWait: true });
  const [plan] = await tx
    .select({ archivedAt: schema.businessPlans.archivedAt })
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.id, planId))
    .for("update", { noWait: true });
  const [idea] = await tx
    .select({ archivedAt: schema.ideas.archivedAt })
    .from(schema.ideas)
    .where(eq(schema.ideas.id, ideaId))
    .for("update", { noWait: true });
  if (!idea || !plan) throw notFound();
  if (idea.archivedAt || plan.archivedAt) {
    throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  }

  const [version] = await tx
    .select({ id: schema.planVersions.id })
    .from(schema.planVersions)
    .where(eq(schema.planVersions.businessPlanId, planId))
    .limit(1);
  const [decision] = await tx
    .select({ id: schema.decisionLogEntries.id })
    .from(schema.decisionLogEntries)
    .where(eq(schema.decisionLogEntries.businessPlanId, planId))
    .limit(1);
  if (
    version ||
    decision ||
    (await hasOtherHistory(tx, u.batchId, [{ type: "business_plan", id: planId }])) ||
    (await hasComments(tx, u.workspaceId, [...new Set([planId, ...u.targetIds])]))
  ) {
    throw somethingAdded();
  }

  await tx.delete(schema.businessPlans).where(eq(schema.businessPlans.id, planId));
  await touchValidationActivity(tx, { workspaceId: u.workspaceId, ideaId }, u.now);
}
