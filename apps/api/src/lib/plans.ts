import { schema } from "@moonx/db";
import type { DecisionValue, GoNoGoValue, UserRef } from "@moonx/schemas";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Executor } from "./db";
import { iso } from "./dto";
import { loadUserRefs } from "./users";

/** SDD 5.9 PlanSummary. */
export interface PlanSummary {
  id: string;
  name: string;
  archived: boolean;
  latestVersion: { id: string; name: string; savedAt: string } | null;
  hasChangesSinceVersion: boolean;
  latestGoNoGo: { value: GoNoGoValue; recordedAt: string; recordedBy: UserRef } | null;
}

const GO_NO_GO = new Set<string>(["launch", "delay", "stop"]);

/**
 * The plans of the given ideas with their latest version and Go / No-Go, in a fixed number of
 * queries. Archived plans are included; callers drop them where the screen does (design-spec 6.1).
 */
export async function loadPlanSummaries(
  db: Executor,
  workspaceId: string,
  ideaIds: string[],
): Promise<Map<string, PlanSummary[]>> {
  const result = new Map<string, PlanSummary[]>();
  if (ideaIds.length === 0) return result;
  const plans = await db
    .select()
    .from(schema.businessPlans)
    .where(inArray(schema.businessPlans.ideaId, ideaIds))
    .orderBy(schema.businessPlans.createdAt);
  if (plans.length === 0) return result;
  const planIds = plans.map((p) => p.id);
  const [versions, entries, answers, items] = await Promise.all([
    db
      .select()
      .from(schema.planVersions)
      .where(inArray(schema.planVersions.businessPlanId, planIds))
      .orderBy(desc(schema.planVersions.versionNumber)),
    db
      .select()
      .from(schema.decisionLogEntries)
      .where(
        and(
          inArray(schema.decisionLogEntries.businessPlanId, planIds),
          eq(schema.decisionLogEntries.kind, "go_no_go"),
        ),
      )
      .orderBy(desc(schema.decisionLogEntries.recordedAt)),
    db
      .select({
        planId: schema.planAnswers.businessPlanId,
        updatedAt: schema.planAnswers.updatedAt,
      })
      .from(schema.planAnswers)
      .where(inArray(schema.planAnswers.businessPlanId, planIds)),
    db
      .select({
        planId: schema.executionItems.businessPlanId,
        updatedAt: schema.executionItems.updatedAt,
      })
      .from(schema.executionItems)
      .where(inArray(schema.executionItems.businessPlanId, planIds)),
  ]);
  const refs = await loadUserRefs(
    db,
    entries.map((e) => e.recordedById),
    workspaceId,
  );
  const latest = <T extends { businessPlanId: string | null }>(rows: T[]) => {
    const map = new Map<string, T>();
    for (const row of rows)
      if (row.businessPlanId && !map.has(row.businessPlanId)) map.set(row.businessPlanId, row);
    return map;
  };
  const latestVersion = latest(versions);
  const latestEntry = latest(entries);
  const lastTouched = new Map<string, number>();
  for (const row of [...answers, ...items]) {
    lastTouched.set(
      row.planId,
      Math.max(lastTouched.get(row.planId) ?? 0, row.updatedAt.getTime()),
    );
  }

  for (const plan of plans) {
    const version = latestVersion.get(plan.id) ?? null;
    const entry = latestEntry.get(plan.id) ?? null;
    const touched = Math.max(plan.updatedAt.getTime(), lastTouched.get(plan.id) ?? 0);
    const summary: PlanSummary = {
      id: plan.id,
      name: plan.name,
      archived: plan.archivedAt != null,
      latestVersion: version
        ? { id: version.id, name: version.name, savedAt: iso(version.savedAt) }
        : null,
      hasChangesSinceVersion: version != null && touched > version.savedAt.getTime(),
      latestGoNoGo:
        entry?.value && GO_NO_GO.has(entry.value) && refs.has(entry.recordedById)
          ? {
              value: entry.value as GoNoGoValue,
              recordedAt: iso(entry.recordedAt),
              recordedBy: refs.get(entry.recordedById) as UserRef,
            }
          : null,
    };
    const list = result.get(plan.ideaId);
    if (list) list.push(summary);
    else result.set(plan.ideaId, [summary]);
  }
  return result;
}

export type { DecisionValue };
