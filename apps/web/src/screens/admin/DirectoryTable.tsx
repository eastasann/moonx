import { TableView, type TableViewColumn, type TableViewRow } from "@moonx/ui-web";
import type { ReactNode } from "react";

/**
 * The list pane of screen 28. The pane is narrow beside the detail, so every row is a card that
 * carries its column labels (design-spec 4.3) instead of a grid that would not fit.
 */
export function DirectoryTable({
  label,
  columns,
  rows,
  selectedId,
  onSelect,
  emptyState,
}: {
  label: string;
  columns: readonly TableViewColumn[];
  rows: readonly TableViewRow[];
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  emptyState?: ReactNode;
}) {
  return (
    <TableView
      aria-label={label}
      columns={columns}
      rows={rows}
      layout="cards"
      selectionMode="single"
      selectedKeys={new Set(selectedId ? [selectedId] : [])}
      // Pressing the chosen row again clears the selection in the grid; the detail stays instead.
      onSelectionChange={(keys) => {
        const [key] = keys === "all" ? [] : keys;
        if (key !== undefined) onSelect(String(key));
      }}
      emptyState={emptyState}
    />
  );
}
