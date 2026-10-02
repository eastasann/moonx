import type { HistoryEntry } from "@moonx/schemas";

/** One field of an item that a history entry changed. `undefined` means the field was not there. */
export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isBlank = (value: unknown) =>
  value === null || value === undefined || (Array.isArray(value) && value.length === 0);

/**
 * The fields an entry changed (SDD 5.11: `before` and `after` are the item's snapshot). A created
 * or restored-from-nothing item lists what it holds, a deleted one what it held, and an update
 * only the fields whose value differs. The order is the snapshot's own.
 */
export function changedFields(
  entry: Pick<HistoryEntry, "action" | "before" | "after">,
): FieldChange[] {
  const before = isRecord(entry.before) ? entry.before : {};
  const after = isRecord(entry.after) ? entry.after : {};
  const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  const onlyOneSide = entry.action === "create" || entry.action === "delete";
  return fields
    .map((field) => ({ field, before: before[field], after: after[field] }))
    .filter((change) =>
      onlyOneSide
        ? !isBlank(entry.action === "create" ? change.after : change.before)
        : JSON.stringify(change.before ?? null) !== JSON.stringify(change.after ?? null),
    );
}
