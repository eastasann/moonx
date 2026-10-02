import { schema } from "@moonx/db";
import { decideStage } from "@moonx/domain";
import type { GoNoGoValue, Stage } from "@moonx/schemas";
import { and, desc, eq } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor, Tx } from "./db";
import { loadDecisionSummaries } from "./decision-log";
import { type DecisionLogEntry, loadDecisionEntry } from "./decision-record";
import { notifyDecisionRecorded } from "./notify";
import { buildPlanSnapshot, loadPlanBundle, type PlanBundle } from "./plan-context";
import { buildVersionSummaries, type PlanVersionSummary } from "./plan-view";
import { touchPlanActivity } from "./plan-write";
import { loadPlanSummaries } from "./plans";
import { hasText } from "./validation-data";

/** The three conditions of item 24 (design-spec 6.12, M4): sub-items 24.1 to 24.3. */
export function goNoGoConditions(bundle: Pick<PlanBundle, "answers">) {
  const text = (key: string) => {
    const value = bundle.answers.find((a) => a.questionKey === key)?.text;
    return hasText(value) ? (value as string) : null;
  };
  return { launchIf: text("P.24.1"), delayIf: text("P.24.2"), stopIf: text("P.24.3") };
}

/** What a recording writes besides its own row: who, where, when. */
export interface RecordContext {
  workspaceId: string;
  ideaId: string;
  planId: string;
  user: { id: string };
  now: Date;
}

async function lockPlan(tx: Tx, planId: string) {
  const [plan] = await tx
    .select()
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.id, planId))
    .for("update");
  if (!plan) throw new ApiError("NOT_FOUND", "Resource not found");
  if (plan.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  return plan;
}

/** `decision_log_entries.snapshot` shared by versions and Go / No-Go: what the validation showed. */
function stateSnapshot(bundle: PlanBundle) {
  const { state } = bundle.validation;
  return {
    missingChecks: state.checks.filter((c) => c.state !== "done"),
    keyMetrics: state.keyMetrics,
    fau: state.fau,
  };
}

/**
 * P6 POST (M3). Saves the plan as it is now as the next numbered version, records `version_saved`
 * in the decision log and tells the workspace. The plan row is locked, so two saves at once get
 * two numbers.
 */
export async function savePlanVersion(
  tx: Tx,
  ctx: RecordContext,
  name: string,
): Promise<PlanVersionSummary> {
  await lockPlan(tx, ctx.planId);
  const bundle = await loadPlanBundle(tx, ctx.planId);
  const [latest] = await tx
    .select({ n: schema.planVersions.versionNumber })
    .from(schema.planVersions)
    .where(eq(schema.planVersions.businessPlanId, ctx.planId))
    .orderBy(desc(schema.planVersions.versionNumber))
    .limit(1);
  const [version] = await tx
    .insert(schema.planVersions)
    .values({
      businessPlanId: ctx.planId,
      versionNumber: (latest?.n ?? 0) + 1,
      name,
      snapshot: buildPlanSnapshot(bundle),
      savedById: ctx.user.id,
      savedAt: ctx.now,
    })
    .returning();
  const saved = version as NonNullable<typeof version>;
  const [entry] = await tx
    .insert(schema.decisionLogEntries)
    .values({
      workspaceId: ctx.workspaceId,
      ideaId: ctx.ideaId,
      businessPlanId: ctx.planId,
      planVersionId: saved.id,
      kind: "version_saved",
      value: null,
      reason: null,
      snapshot: { ...stateSnapshot(bundle), planVersion: { id: saved.id, name } },
      recordedById: ctx.user.id,
      recordedAt: ctx.now,
    })
    .returning({ id: schema.decisionLogEntries.id });
  await notifyDecisionRecorded(tx, {
    workspaceId: ctx.workspaceId,
    recorderId: ctx.user.id,
    entryId: (entry as { id: string }).id,
    link: { screen: 20, workspaceId: ctx.workspaceId, ideaId: ctx.ideaId, planId: ctx.planId },
  });
  await touchPlanActivity(tx, ctx, ctx.now);
  const fresh = await loadPlanBundle(tx, ctx.planId);
  const summaries = await buildVersionSummaries(tx, fresh);
  return summaries.find((v) => v.id === saved.id) as PlanVersionSummary;
}

/** P7: what the Go / No-Go dialog shows. */
export async function loadGoNoGoContext(db: Executor, bundle: PlanBundle) {
  const all = await loadPlanSummaries(db, bundle.workspaceId, [bundle.idea.id]);
  const summary = all.get(bundle.idea.id)?.find((p) => p.id === bundle.plan.id);
  const versions = await buildVersionSummaries(db, bundle);
  const history = await loadDecisionSummaries(
    db,
    bundle.workspaceId,
    and(
      eq(schema.decisionLogEntries.businessPlanId, bundle.plan.id),
      eq(schema.decisionLogEntries.kind, "go_no_go"),
    ),
    50,
  );
  return {
    conditions: goNoGoConditions(bundle),
    keyMetrics: bundle.validation.state.keyMetrics,
    currentVersion: versions[0] ?? null,
    hasChangesSinceVersion: summary?.hasChangesSinceVersion ?? false,
    history,
  };
}

/**
 * P8 (M4). Appends a Go / No-Go to the decision log with the latest saved version, the key
 * metrics and the three conditions as they are now. Entries of one plan keep their order even
 * when two are recorded in the same millisecond.
 */
export async function recordGoNoGo(
  tx: Tx,
  ctx: RecordContext,
  input: { value: GoNoGoValue; reason: string },
): Promise<{ entry: DecisionLogEntry; stage: Stage }> {
  await lockPlan(tx, ctx.planId);
  const bundle = await loadPlanBundle(tx, ctx.planId);
  const [newest] = await tx
    .select({ recordedAt: schema.decisionLogEntries.recordedAt })
    .from(schema.decisionLogEntries)
    .where(
      and(
        eq(schema.decisionLogEntries.businessPlanId, ctx.planId),
        eq(schema.decisionLogEntries.kind, "go_no_go"),
      ),
    )
    .orderBy(desc(schema.decisionLogEntries.recordedAt))
    .limit(1);
  const recordedAt = newest
    ? new Date(Math.max(ctx.now.getTime(), newest.recordedAt.getTime() + 1))
    : ctx.now;
  const latest = bundle.versions[0] ?? null;
  const [entry] = await tx
    .insert(schema.decisionLogEntries)
    .values({
      workspaceId: ctx.workspaceId,
      ideaId: ctx.ideaId,
      businessPlanId: ctx.planId,
      planVersionId: latest?.id ?? null,
      kind: "go_no_go",
      value: input.value,
      reason: input.reason,
      snapshot: {
        ...stateSnapshot(bundle),
        conditions: goNoGoConditions(bundle),
        planVersion: latest ? { id: latest.id, name: latest.name } : null,
      },
      recordedById: ctx.user.id,
      recordedAt,
    })
    .returning({ id: schema.decisionLogEntries.id });
  const entryId = (entry as { id: string }).id;
  await notifyDecisionRecorded(tx, {
    workspaceId: ctx.workspaceId,
    recorderId: ctx.user.id,
    entryId,
    link: { screen: 20, workspaceId: ctx.workspaceId, ideaId: ctx.ideaId, planId: ctx.planId },
  });
  await touchPlanActivity(tx, ctx, recordedAt);
  const plans = (await loadPlanSummaries(tx, ctx.workspaceId, [ctx.ideaId])).get(ctx.ideaId) ?? [];
  const stage = decideStage(
    plans.map((p) => ({ archived: p.archived, latestGoNoGo: p.latestGoNoGo?.value ?? null })),
  );
  return { entry: await loadDecisionEntry(tx, ctx.workspaceId, entryId), stage };
}
