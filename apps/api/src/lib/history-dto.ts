import type { schema } from "@moonx/db";
import type { HistoryEntry, TargetType } from "@moonx/schemas";
import { labelOf, resolveTargets, type Target } from "./dashboard-activity";
import type { Executor } from "./db";
import { iso } from "./dto";
import { canRevert, type HistoryAccess } from "./history-target";
import { i18n } from "./i18n";
import { loadUserRefs } from "./users";

export type HistoryRow = typeof schema.changeHistory.$inferSelect;

/**
 * Targets whose history can be shown but not restored one entry at a time: a Pitch Deck slide has
 * no stored content, and a template version moves only as a whole batch (H3).
 */
const NOT_RESTORABLE = new Set<TargetType>(["pitch_slide", "template_version"]);

const versionNumberOf = (row: HistoryRow): number | null => {
  const state = (row.after ?? row.before) as { versionNumber?: number } | null;
  return state?.versionNumber ?? null;
};

/** The label of a self-analysis answer such as "WHY 1" (key `SA.WHY.1`). */
function selfAnalysisLabel(key: string | null): string {
  const [, section, ...rest] = (key ?? "").split(".");
  return [section, rest.join(".")].filter(Boolean).join(" ");
}

/** SDD 5.11 HistoryEntry for each row, in the order given. */
export async function toHistoryEntries(
  db: Executor,
  access: HistoryAccess,
  rows: HistoryRow[],
): Promise<HistoryEntry[]> {
  if (rows.length === 0) return [];
  const refs = await loadUserRefs(
    db,
    rows.map((r) => r.changedById),
    access.workspaceId,
  );
  const targets: Target[] = rows.map((r) => ({
    type: r.targetType as TargetType,
    id: r.targetId,
    key: r.targetKey,
  }));
  const resolved =
    access.workspaceId == null ? new Map() : await resolveTargets(db, access.workspaceId, targets);
  const mayRevert = canRevert(access);
  return rows.map((row, index) => {
    const target = targets[index] as Target;
    let label: string;
    if (target.type === "template_version") {
      label = i18n.t("common:history.templateUpdated", { version: versionNumberOf(row) ?? "" });
    } else if (target.type === "self_analysis_answer") {
      label = selfAnalysisLabel(target.key);
    } else {
      label = labelOf(
        target,
        resolved.get(`${target.type}:${target.id}:${target.key ?? ""}`) ?? {
          idea: null,
          plan: null,
          name: null,
        },
      );
    }
    return {
      id: row.id,
      batchId: row.batchId,
      target: { type: target.type, id: target.id, key: target.key },
      label,
      action: row.action,
      source: row.source,
      before: row.before ?? null,
      after: row.after ?? null,
      changedBy: refs.get(row.changedById) as NonNullable<ReturnType<typeof refs.get>>,
      changedAt: iso(row.changedAt),
      revertible: mayRevert && !NOT_RESTORABLE.has(target.type),
    };
  });
}
