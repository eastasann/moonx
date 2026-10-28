import type { HistorySource } from "@moonx/schemas";
import type { DatabaseTransaction } from "../client";
import { type HistoryMergeFacts, mergesIntoLatest } from "../history-merge";
import type { changeHistory } from "../schema";
import type { SeedClock } from "./clock";
import { seedId } from "./ids";
import type { SeededTemplates } from "./templates";

/** The demo users of design-spec 8.1. */
export type UserKey = "admin" | "ana" | "kenji" | "paolo" | "grace";

export const userId = (key: UserKey) => seedId("user", key);

/** The BCDX workspace (design-spec 8.1). */
export const BCDX_WORKSPACE_ID = seedId("workspace", "bcdx");
export const personalWorkspaceId = (key: UserKey) =>
  seedId("workspace", "personal", key);

/** The BCDX members other than Admin, who does not belong to it. */
export const BCDX_MEMBERS = ["ana", "kenji", "paolo", "grace"] as const;

type ClientKind = (typeof changeHistory.$inferInsert)["client"];

/** Which screen's history a row belongs to (SDD 6.3「change_history の列の決め方」). */
export interface HistoryContainer {
  type: "self_analysis" | "validation" | "business_plan" | "idea";
  id: string;
  /** Null for self-analysis history. */
  workspaceId: string | null;
  /** The owner of self-analysis history; null otherwise. */
  ownerUserId: string | null;
}

export interface HistoryInput {
  container: HistoryContainer;
  sectionKey: string | null;
  target: { type: string; id: string; key?: string | null };
  action: "create" | "update" | "delete" | "restore";
  before: unknown;
  after: unknown;
  source: HistorySource;
  /** Names one operation; every row with the same name shares a batch id. */
  batch?: string;
  revertedFromId?: string;
  by: UserKey;
  at: Date;
  client?: ClientKind;
}

type HistoryRow = typeof changeHistory.$inferInsert;

/** Collects change_history rows as the seed writes the rows they describe. */
export class HistoryLog {
  readonly rows: HistoryRow[] = [];
  private readonly counts = new Map<string, number>();
  /** Each item's rows so far, oldest first, as the API's merge rule reads them. */
  private readonly byItem = new Map<string, HistoryMergeFacts[]>();

  /**
   * Adds a row and returns its id, for a later revert to point at. The id names the row
   * by its target and its place among that target's rows.
   *
   * @throws when the API would have merged the row with the one before or after it in
   *   time (ADR-020): the demo's history keeps the shape the API writes.
   */
  add(input: HistoryInput): string {
    const target = [
      input.container.id,
      input.target.type,
      input.target.id,
      input.target.key ?? "",
    ].join("/");
    const index = this.counts.get(target) ?? 0;
    this.counts.set(target, index + 1);
    const id = seedId("history", target, index);
    const row: HistoryRow = {
      id,
      workspaceId: input.container.workspaceId,
      ownerUserId: input.container.ownerUserId,
      containerType: input.container.type,
      containerId: input.container.id,
      sectionKey: input.sectionKey,
      targetType: input.target.type,
      targetId: input.target.id,
      targetKey: input.target.key ?? null,
      action: input.action,
      before: input.before ?? null,
      after: input.after ?? null,
      source: input.source,
      batchId: input.batch === undefined ? null : seedId("batch", input.batch),
      client: input.client ?? "web",
      revertedFromId: input.revertedFromId ?? null,
      changedById: userId(input.by),
      changedAt: input.at,
    };
    const itemKey = [
      input.target.type,
      input.target.id,
      input.target.key ?? "",
    ].join("/");
    const item = [
      ...(this.byItem.get(itemKey) ?? []),
      {
        action: input.action,
        source: input.source,
        batchId: row.batchId ?? null,
        changedById: row.changedById,
        changedAt: input.at,
      },
    ].sort((a, b) => a.changedAt.getTime() - b.changedAt.getTime());
    item.forEach((later, place) => {
      const earlier = item[place - 1];
      if (earlier !== undefined && mergesIntoLatest(earlier, later)) {
        throw new Error(
          `The API would merge two history rows of ${itemKey} (ADR-020)`,
        );
      }
    });
    this.byItem.set(itemKey, item);
    this.rows.push(row);
    return id;
  }
}

/** The latest moment something happened in each idea and workspace. */
export class ActivityLog {
  readonly ideas = new Map<string, Date>();
  readonly workspaces = new Map<string, Date>();

  touch(workspaceId: string, ideaId: string | null, at: Date) {
    const later = (map: Map<string, Date>, key: string) => {
      const known = map.get(key);
      if (known === undefined || known < at) map.set(key, at);
    };
    later(this.workspaces, workspaceId);
    if (ideaId !== null) later(this.ideas, ideaId);
  }
}

/** What every part of the seed writes with. */
export interface SeedContext {
  tx: DatabaseTransaction;
  clock: SeedClock;
  templates: SeededTemplates;
  history: HistoryLog;
  activity: ActivityLog;
}
