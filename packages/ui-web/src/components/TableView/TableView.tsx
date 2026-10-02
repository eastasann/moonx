import type { Density } from "@moonx/ui-tokens";
import { ArrowDown, ArrowUp, Check, Minus } from "lucide-react";
import type { ReactNode } from "react";
import {
  Cell,
  Checkbox,
  Column,
  type ColumnProps,
  type Key,
  Row,
  type Selection,
  type SortDescriptor,
  Table,
  TableBody,
  TableHeader,
} from "react-aria-components";
import { useIsNarrow } from "../ResponsivePopover";
import {
  body,
  cell,
  checkbox,
  checkboxBox,
  checkboxIcon,
  column,
  columnContent,
  empty,
  header,
  row,
  selectionCell,
  sortIcon,
  table,
} from "./TableView.css";

export interface TableViewColumn {
  id: string;
  /** Header text. In the `cards` layout it also labels the value inside each card. */
  label: string;
  isRowHeader?: boolean;
  allowsSorting?: boolean;
  /** Right-aligns the column and sets its figures in tabular numerals so digits line up. */
  isNumeric?: boolean;
  width?: ColumnProps["width"];
}

export interface TableViewRow {
  id: Key;
  /** Cell content keyed by column id. A missing key renders an empty cell. */
  cells: Readonly<Record<string, ReactNode>>;
  /** Used for typeahead and as the accessible name of the row's selection checkbox. */
  textValue?: string;
  isDisabled?: boolean;
}

export interface TableViewProps {
  "aria-label": string;
  columns: readonly TableViewColumn[];
  rows: readonly TableViewRow[];
  /** Row height and cell padding (design-spec 4.4). */
  density?: Density;
  /**
   * `table` is the grid. `cards` draws every row as a card with the column labels inside it
   * (design-spec 4.3). `auto` (default) picks `cards` below `semantic.breakpoint.tablet` and
   * `table` otherwise. The chosen layout is exposed as `data-layout` on the grid.
   */
  layout?: "auto" | "table" | "cards";
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: Selection;
  defaultSelectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  sortDescriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  /** Fires when a row is activated (Enter, double click, tap in `toggle` selection when no selection). */
  onRowAction?: (key: Key) => void;
  /** Content for a table with no rows, such as an IllustratedMessage. */
  emptyState?: ReactNode;
}

const SELECTION_ID = "__selection";

function SelectionBox() {
  return (
    <Checkbox slot="selection" className={checkbox}>
      {({ isSelected, isIndeterminate }) => (
        <span className={checkboxBox}>
          {isIndeterminate ? (
            <Minus className={checkboxIcon} aria-hidden strokeWidth={3} />
          ) : isSelected ? (
            <Check className={checkboxIcon} aria-hidden strokeWidth={3} />
          ) : null}
        </span>
      )}
    </Checkbox>
  );
}

/**
 * Data grid with row selection, sorting and tabular numerals (React Aria Table). Used for costs,
 * the decision log and admin lists. Semantics stay `grid` in the `cards` layout.
 */
export function TableView({
  columns,
  rows,
  density = "regular",
  layout: requestedLayout = "auto",
  selectionMode = "none",
  emptyState,
  ...props
}: TableViewProps) {
  const narrow = useIsNarrow();
  const layout = requestedLayout === "auto" ? (narrow ? "cards" : "table") : requestedLayout;
  const withSelection = selectionMode === "multiple";
  const allColumns: readonly TableViewColumn[] = withSelection
    ? [{ id: SELECTION_ID, label: "" }, ...columns]
    : columns;
  return (
    <Table
      {...props}
      data-layout={layout}
      selectionMode={selectionMode}
      className={table({ layout })}
    >
      <TableHeader columns={allColumns} className={header({ layout })}>
        {(col) =>
          col.id === SELECTION_ID ? (
            <Column
              id={col.id}
              className={column({ density, layout, inCardsVisible: true, selection: true })}
            >
              <SelectionBox />
            </Column>
          ) : (
            <Column
              id={col.id}
              isRowHeader={col.isRowHeader}
              allowsSorting={col.allowsSorting}
              width={col.width}
              textValue={col.label}
              className={column({
                density,
                layout,
                numeric: col.isNumeric ?? false,
                sortable: col.allowsSorting ?? false,
                inCardsVisible: col.allowsSorting ?? false,
              })}
            >
              {({ allowsSorting, sortDirection }) => (
                <span className={columnContent}>
                  {col.label}
                  {allowsSorting ? (
                    sortDirection === "descending" ? (
                      <ArrowDown className={sortIcon({ active: true })} aria-hidden />
                    ) : (
                      <ArrowUp
                        className={sortIcon({ active: sortDirection === "ascending" })}
                        aria-hidden
                      />
                    )
                  ) : null}
                </span>
              )}
            </Column>
          )
        }
      </TableHeader>
      <TableBody
        items={rows}
        className={body({ density, layout })}
        renderEmptyState={emptyState ? () => <div className={empty}>{emptyState}</div> : undefined}
      >
        {(item) => (
          <Row
            id={item.id}
            textValue={item.textValue}
            isDisabled={item.isDisabled}
            className={row({ density, layout })}
          >
            {allColumns.map((col) =>
              col.id === SELECTION_ID ? (
                <Cell
                  key={col.id}
                  className={`${cell({ density, layout })} ${selectionCell({ layout })}`}
                >
                  <SelectionBox />
                </Cell>
              ) : (
                <Cell
                  key={col.id}
                  data-label={col.label}
                  className={cell({ density, layout, numeric: col.isNumeric ?? false })}
                >
                  {item.cells[col.id]}
                </Cell>
              ),
            )}
          </Row>
        )}
      </TableBody>
    </Table>
  );
}
