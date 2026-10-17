import { createContext, useContext } from "react";

/** Where a part sits when a TableView cell holds it (design-spec 4.5). */
export interface TableCellState {
  /** The column holds amounts or counts: a NumberField aligns its digits to the end. */
  isNumeric: boolean;
  /** The row shows its inputs: a FauPicker shows the ▾ that opens it. */
  isEditing: boolean;
}

export const TableCellContext = createContext<TableCellState | null>(null);

/** The cell a part is in, or null outside a TableView. */
export function useTableCell(): TableCellState | null {
  return useContext(TableCellContext);
}
