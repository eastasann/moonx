import { useState } from "react";
import { useDebouncedPatch } from "./admin-templates";

/**
 * The rows of a list a draft saves as a whole (cost rows, execution rows): the editor keeps the
 * rows being typed, and the list goes out once every row is valid. A list with a row the API would
 * refuse stays on screen and is not sent, so the saved list is always the last valid one; `held`
 * tells the editor to say so.
 */
export function useRowList<Row>(
  initial: Row[],
  isValid: (rows: Row[]) => boolean,
  save: (rows: Row[]) => Promise<unknown>,
) {
  const [rows, setRows] = useState(initial);
  const { schedule, flush } = useDebouncedPatch(({ rows: next }: { rows: Row[] }) => save(next));

  const replace = (next: Row[], options: { now?: boolean } = {}) => {
    setRows(next);
    if (!isValid(next)) return;
    schedule({ rows: next });
    if (options.now) flush();
  };

  return {
    rows,
    held: !isValid(rows),
    flush,
    edit: (index: number, patch: Partial<Row>) =>
      replace(rows.map((row, i) => (i === index ? { ...row, ...patch } : row))),
    add: (row: Row) => setRows([...rows, row]),
    remove: (index: number) =>
      replace(
        rows.filter((_, i) => i !== index),
        { now: true },
      ),
    /** Exchanges two rows; the list is sent at once. */
    swap: (a: number, b: number) => {
      const next = [...rows];
      [next[a], next[b]] = [next[b] as Row, next[a] as Row];
      replace(next, { now: true });
    },
  };
}
