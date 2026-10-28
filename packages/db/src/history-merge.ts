import type { HistorySource } from "@moonx/schemas";

/**
 * How long after a person's manual change of an item their next manual change of it
 * still updates the same history row, measured from that row's time (ADR-020, design-spec
 * 6.0.5; the user's decision of 2026-10-29). Autosave saves each time typing stops, so a
 * row per save buried the history under one person's typing.
 */
export const HISTORY_MERGE_WINDOW_MS = 10 * 60 * 1000;

/** What decides whether a change merges into a history row. */
export interface HistoryMergeFacts {
  action: "create" | "update" | "delete" | "restore";
  source: HistorySource;
  batchId: string | null;
  changedById: string;
  changedAt: Date;
}

/**
 * Whether `change` updates `latest`, the latest history row of the same item, instead of
 * adding a row (ADR-020): `change` is a manual update (`manual`, in no batch) and
 * `latest` the same person's manual addition or update of the item, `change` at most
 * {@link HISTORY_MERGE_WINDOW_MS} after `latest`. An addition folds in the edits that
 * follow it, so a new answer typed in several saves is one Added. Deleting and restoring
 * a row never merge, nor does anything after a revert, an AI import, a template
 * migration, a duplicate or a plan draft. A `change` dated before `latest` (the clocks
 * of two instances) counts as within the window.
 */
export function mergesIntoLatest(
  latest: HistoryMergeFacts,
  change: HistoryMergeFacts,
): boolean {
  const byHand = (row: HistoryMergeFacts) =>
    row.source === "manual" && row.batchId === null;
  return (
    (latest.action === "create" || latest.action === "update") &&
    change.action === "update" &&
    byHand(latest) &&
    byHand(change) &&
    latest.changedById === change.changedById &&
    change.changedAt.getTime() - latest.changedAt.getTime() <=
      HISTORY_MERGE_WINDOW_MS
  );
}
