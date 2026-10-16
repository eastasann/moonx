import { isDeepStrictEqual } from "node:util";
import {
  changeHistory,
  type DatabaseTransaction,
  type historyAction,
  type historyContainer,
} from "@moonx/db";
import type { HistorySource, TargetRef, TargetType } from "@moonx/schemas";
import type { ClientKind } from "./entry";
import { recordChange } from "./scope";

export type HistoryAction = (typeof historyAction.enumValues)[number];
export type HistoryContainerType = (typeof historyContainer.enumValues)[number];

/**
 * The screen a change is listed under (SDD 6.3「画面と節の対応」). It decides the
 * workspace or owner of the history row: a self-analysis has no workspace and only its
 * owner sees its history; everything else belongs to a workspace.
 */
export type HistoryContainer =
  | { type: "self_analysis"; id: string; ownerUserId: string }
  | {
      type: Exclude<HistoryContainerType, "self_analysis">;
      id: string;
      workspaceId: string;
    };

/** One operation that changes one or more items (ADR-020). */
export interface HistoryOperation {
  container: HistoryContainer;
  changedById: string;
  source: HistorySource;
  /**
   * Groups the rows of one operation that H3 undoes as a whole: an AI import, a
   * template migration, a duplication, a plan draft, or undoing one of these. Null for
   * a manual save.
   */
  batchId: string | null;
  /** SDD 5.1「クライアントの種類」, from the request context. */
  client: ClientKind;
  at: Date;
}

/** What the change to one item was, as the work of {@link withHistory} reports it. */
export interface HistoryChange {
  target: TargetRef;
  action: HistoryAction;
  /** The item's value before; null when it did not exist. A JSON value. */
  before: unknown;
  /** The item's value after; null when it no longer exists. A JSON value. */
  after: unknown;
  /** Set only by H2 and H3: the row this change undoes. */
  revertedFromId?: string | null;
}

/** The containers a target may be listed under (SDD 5.1 TargetRef, 5.11, 6.3). */
const CONTAINERS: Record<TargetType, readonly HistoryContainerType[]> = {
  self_analysis_answer: ["self_analysis"],
  validation_answer: ["validation"],
  economics_input: ["validation"],
  research_log_entry: ["validation"],
  competitor: ["validation"],
  assumption: ["validation"],
  risk: ["validation"],
  cost_item: ["validation"],
  plan_answer: ["business_plan"],
  execution_item: ["business_plan"],
  // The Pitch Deck takes comments but keeps no history (SDD 6.3, screen 23).
  pitch_slide: [],
  idea: ["idea"],
  // A plan's header, or under its idea the row of an undone plan draft (SDD 5.11).
  business_plan: ["business_plan", "idea"],
  template_version: ["self_analysis", "validation", "business_plan"],
};

/** Targets whose id is that of their container: keyed items, and a pinned template version. */
const ID_IS_CONTAINER = new Set<TargetType>([
  "self_analysis_answer",
  "validation_answer",
  "economics_input",
  "plan_answer",
  "template_version",
]);

/**
 * Refuses a change filed under a screen that cannot show it (SDD 6.3「画面と節の対応」).
 * The rows of a container (a competitor, a cost item) cannot be checked without the
 * database; everything else can. The one row filed away from its own screen is the
 * undoing of a duplicate or a plan draft, under the idea it came from (SDD 5.11).
 */
function checkContainer(change: HistoryChange, container: HistoryContainer) {
  const { type, id } = change.target;
  const sameId = container.id === id;
  const undoesCreation =
    change.action === "delete" && (change.revertedFromId ?? null) !== null;
  const fits =
    CONTAINERS[type].includes(container.type) &&
    (!ID_IS_CONTAINER.has(type) || sameId) &&
    (type !== "idea" || sameId || undoesCreation) &&
    (type !== "business_plan" ||
      (container.type === "business_plan" ? sameId : undoesCreation));
  if (!fits) {
    throw new Error(
      `A ${type} change cannot be listed under ${container.type} ${container.id}`,
    );
  }
}

/** The section of the targets that are rows, not questions (SDD 6.3「画面と節の対応」). */
const ROW_SECTIONS: Partial<Record<TargetType, string>> = {
  economics_input: "economics",
  research_log_entry: "research_log",
  competitor: "competitors",
  assumption: "assumptions_risks",
  risk: "assumptions_risks",
  cost_item: "costs",
  execution_item: "execution",
  pitch_slide: "pitch",
};

/**
 * The `section_key` of a target (SDD 6.3「画面と節の対応」), which H1 and C1 filter a
 * screen by: a question's section from its ID (`V.04.SURVIVOR_PATTERNS` is `04`,
 * `SA.WHY.1` is `WHY`), a row's from its kind, and none for an idea, a plan header or a
 * template version.
 */
export function historySectionKey(target: TargetRef): string | null {
  if (
    target.type === "self_analysis_answer" ||
    target.type === "validation_answer" ||
    target.type === "plan_answer"
  ) {
    const section = target.key?.split(".")[1];
    if (section === undefined || section === "") {
      throw new Error(`${target.type} needs a question key, got ${target.key}`);
    }
    return section;
  }
  return ROW_SECTIONS[target.type] ?? null;
}

/**
 * Runs `work`, which changes items and reports each change, and writes one
 * `change_history` row per change in the same transaction (ADR-020). Every change to
 * what design-spec 6.0.5 records goes through here.
 *
 * `work` must leave an item alone when its value would not change, and report it with
 * equal `before` and `after` or not at all: an update whose values are equal writes no
 * row, as a save that changes nothing raises no version either (SDD 5.1「同時編集」).
 * Creations, deletions and restorations are always written. Writing a row counts as a
 * change for the last activity ({@link recordChange}).
 *
 * @returns The rows written, in the order of the changes.
 */
export async function withHistory(
  tx: DatabaseTransaction,
  operation: HistoryOperation,
  work: () => Promise<HistoryChange | readonly HistoryChange[] | null>,
) {
  const reported = await work();
  const changes = (
    reported === null ? [] : Array.isArray(reported) ? reported : [reported]
  ) as readonly HistoryChange[];
  const { container } = operation;
  const rows = changes
    .filter(
      (change) =>
        change.action !== "update" ||
        !isDeepStrictEqual(change.before, change.after),
    )
    .map((change) => {
      checkContainer(change, container);
      return {
        workspaceId:
          container.type === "self_analysis" ? null : container.workspaceId,
        ownerUserId:
          container.type === "self_analysis" ? container.ownerUserId : null,
        containerType: container.type,
        containerId: container.id,
        sectionKey: historySectionKey(change.target),
        targetType: change.target.type,
        targetId: change.target.id,
        targetKey: change.target.key ?? null,
        action: change.action,
        before: change.before ?? null,
        after: change.after ?? null,
        source: operation.source,
        batchId: operation.batchId,
        client: operation.client,
        revertedFromId: change.revertedFromId ?? null,
        changedById: operation.changedById,
        changedAt: operation.at,
      };
    });
  if (rows.length === 0) return [];
  recordChange(tx);
  return tx.insert(changeHistory).values(rows).returning();
}
