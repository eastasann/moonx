import { schema } from "@moonx/db";
import type { DecisionValue, GoNoGoValue, UserRef } from "@moonx/schemas";
import { desc, eq, type SQL } from "drizzle-orm";
import type { Executor } from "./db";
import { iso } from "./dto";
import { loadUserRefs } from "./users";

/** SDD 5.11 DecisionLogSummary. */
export interface DecisionLogSummary {
  id: string;
  kind: "validation_decision" | "go_no_go" | "version_saved";
  value: DecisionValue | GoNoGoValue | null;
  versionName: string | null;
  idea: { id: string; name: string };
  plan: { id: string; name: string } | null;
  reasonExcerpt: string | null;
  recordedBy: UserRef;
  recordedAt: string;
}

const EXCERPT_LENGTH = 140;

/** The one-line preview of a decision reason shown in lists. */
export function excerpt(text: string | null): string | null {
  if (text == null) return null;
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT_LENGTH ? `${flat.slice(0, EXCERPT_LENGTH - 1)}…` : flat;
}

/** The newest entries matching `where`, with the names the summary shows. */
export async function loadDecisionSummaries(
  db: Executor,
  workspaceId: string,
  where: SQL | undefined,
  limit: number,
): Promise<DecisionLogSummary[]> {
  const rows = await db
    .select({
      entry: schema.decisionLogEntries,
      ideaName: schema.ideas.name,
      planName: schema.businessPlans.name,
      versionName: schema.planVersions.name,
    })
    .from(schema.decisionLogEntries)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.decisionLogEntries.ideaId))
    .leftJoin(
      schema.businessPlans,
      eq(schema.businessPlans.id, schema.decisionLogEntries.businessPlanId),
    )
    .leftJoin(
      schema.planVersions,
      eq(schema.planVersions.id, schema.decisionLogEntries.planVersionId),
    )
    .where(where)
    .orderBy(
      desc(schema.decisionLogEntries.recordedAt),
      desc(schema.decisionLogEntries.createdAt),
      desc(schema.decisionLogEntries.id),
    )
    .limit(limit);
  const refs = await loadUserRefs(
    db,
    rows.map((r) => r.entry.recordedById),
    workspaceId,
  );
  return rows.map(({ entry, ideaName, planName, versionName }) => ({
    id: entry.id,
    kind: entry.kind,
    value: entry.value as DecisionLogSummary["value"],
    versionName: entry.kind === "version_saved" ? (versionName ?? null) : null,
    idea: { id: entry.ideaId, name: ideaName },
    plan: entry.businessPlanId && planName ? { id: entry.businessPlanId, name: planName } : null,
    reasonExcerpt: excerpt(entry.reason),
    recordedBy: refs.get(entry.recordedById) as UserRef,
    recordedAt: iso(entry.recordedAt),
  }));
}
