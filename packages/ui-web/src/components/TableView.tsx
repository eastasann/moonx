import type { Density, TableLayout } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Table as AriaTable,
  Cell,
  Column,
  GridList,
  GridListItem,
  type Key,
  Row,
  type Selection,
  TableBody,
  TableHeader,
  TableStateContext,
  VisuallyHidden,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { TableCellContext } from "../internal/tableCell";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./TableView.css";

export interface TableColumn {
  id: string;
  /**
   * The header's text; on a phone, each value's label in the row when the row shows more
   * than one value beside its name. The mark and ⋯ columns keep it for screen readers only.
   */
  name: string;
  /** The column that names the row: its value is the row's name on a phone, in the label's weight. */
  isRowHeader?: boolean;
  /** Amounts and counts: the monospaced face, aligned right (design-spec 4.4). */
  numeric?: boolean;
  /**
   * The column's width, in px or as a share of the table ("31%"). Columns without one
   * share what is left. The table's layout is fixed, so editing a row never moves them.
   */
  width?: number | `${number}%`;
  /**
   * The row's mark (a MoonGlyph) at the start of the row, in a narrow column with no
   * header text; on a phone, at the start of the line (17, design-spec 4.5).
   */
  isMark?: boolean;
  /**
   * The row's ⋯ (an ActionMenu), in a narrow column at the end: with a mouse it shows on
   * the row under the pointer or with focus, on touch always. A phone's row leaves it out,
   * as the row presses as a whole and holds no buttons.
   */
  isRowActions?: boolean;
  /**
   * Leaves the column out of a phone's rows (17's notes and Can reduce?): the sheet the
   * row's press opens edits it there (design-spec 4.5).
   */
  isHiddenOnPhone?: boolean;
  /** On a phone, under the row's name in the caption's size (17's F/A/U label). */
  isBelowName?: boolean;
}

export interface TableViewProps<T extends { id: Key }> {
  columns: readonly TableColumn[];
  items: readonly T[];
  /**
   * A cell's content: the value as text, or, while its row is edited, the input that
   * edits it (design-spec 4.5: only the touched row shows inputs).
   */
  renderCell: (
    item: T,
    columnId: string,
    state: {
      isEditing: boolean;
      /**
       * A phone's row, which presses as a whole: the cell shows its value only, with no
       * button of its own (design-spec 4.5).
       */
      isCard: boolean;
    },
  ) => ReactNode;
  /** The row's text for screen readers and typing to find it; by default its header cell's text. */
  textValue?: (item: T) => string;
  /**
   * Rows whose values can be edited in place. Pressing such a row, or Enter on one of its
   * cells, turns its cells into inputs; Escape, or moving out of the row, turns them back.
   * On a phone the row calls `onRowAction`, for the screen's sheet.
   */
  isRowEditable?: (item: T) => boolean;
  /** Pressing a row (that is not edited in place): open it, or its sheet on a phone. */
  onRowAction?: (key: Key) => void;
  /** `single` keeps one row chosen, as a list beside its detail does (pattern D). */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  /**
   * Puts a row in view with focus in it, once the row is listed: in the input of
   * `columnId` while the row can be edited in place, else on that cell (17's "+ Add row"
   * and Rename, a link to a row). A new object for each request. A phone's rows are left
   * to the screen, which opens its sheet.
   */
  editRequest?: { key: Key; columnId: string } | null;
  /**
   * The request was met: the screen sets `editRequest` back to null, so the table drawn
   * again (a tablet turned, a window narrowed and widened) does not meet it a second time.
   */
  onEditRequestMet?: () => void;
  /** Shown in place of the rows when there are none. */
  renderEmptyState?: () => ReactNode;
  /** @default "regular" */
  density?: Density;
  /**
   * `auto`: a table on tablet and wider, lined rows on a phone. `cards` shows the phone's
   * rows at every width. A phone always shows its rows (design-spec 4.5).
   * @default "auto"
   */
  layout?: TableLayout;
  /**
   * Under the rows, at the start: the table's "+ Add row" (a quiet Button). On a phone it
   * takes a whole row of its own (s17-costs.html .cards .add).
   */
  footerAction?: ReactNode;
  /**
   * Under the rows, at the end: the table's figure ("Subtotal ₱145,000+ · 3 Unknown, 1
   * Empty"). Not on a phone, where the worksheet's summary bar holds the totals (6.3).
   */
  footerTotal?: ReactNode;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]';

const toSet = (selection: Selection): Set<Key> =>
  selection === "all" ? new Set() : new Set(selection);

/**
 * Rows of values in columns (17・18・7・28・15・21, design-spec 4.5): arrow keys move from
 * cell to cell. Editable rows show their values as text until touched. The table has no
 * ground of its own: a line under the header and hairlines between the rows.
 */
export function TableView<T extends { id: Key }>({
  density = "regular",
  layout = "auto",
  columns,
  ...props
}: TableViewProps<T>) {
  const isNarrow = useIsNarrow();
  const lines = isNarrow || layout === "cards";
  // The columns at this width; the rows keep their cache while the list holds.
  const shown = useMemo(
    () =>
      columns.filter(
        (column) =>
          !(isNarrow && (column.isHiddenOnPhone ?? false)) &&
          // A line presses as a whole and holds no buttons: no ⋯ there.
          !(lines && (column.isRowActions ?? false)),
      ),
    [columns, isNarrow, lines],
  );
  const { footerAction, footerTotal, ...tableProps } = props;
  const {
    isRowEditable: _,
    editRequest: __,
    onEditRequestMet: ___,
    ...rowProps
  } = tableProps;
  const table = lines ? (
    <LineRows {...rowProps} columns={shown} density={density} />
  ) : (
    <GridTable {...tableProps} columns={shown} density={density} />
  );
  const total = lines ? null : footerTotal;
  if (footerAction == null && total == null) return table;
  return (
    <div className={styles.withFooter}>
      {table}
      <div className={styles.footer({ lines })}>
        {footerAction != null && (
          <div className={styles.footerAction({ lines })}>{footerAction}</div>
        )}
        {total != null && <div className={styles.footerTotal}>{total}</div>}
      </div>
    </div>
  );
}

/** A column's role in the row, which sets its cell's look. */
const kindOf = (column: TableColumn) =>
  column.isMark
    ? "mark"
    : column.isRowActions
      ? "actions"
      : column.isRowHeader
        ? "header"
        : column.numeric
          ? "numeric"
          : "text";

function rowTextOf<T extends { id: Key }>(
  props: Pick<TableViewProps<T>, "columns" | "renderCell" | "textValue">,
  item: T,
): string | undefined {
  if (props.textValue) return props.textValue(item);
  const header = props.columns.find((column) => column.isRowHeader);
  const content =
    header === undefined
      ? undefined
      : props.renderCell(item, header.id, { isEditing: false, isCard: false });
  return typeof content === "string" ? content : undefined;
}

function GridTable<T extends { id: Key }>({
  columns,
  items,
  renderCell,
  textValue,
  isRowEditable,
  onRowAction,
  selectionMode = "none",
  selectedKeys,
  onSelectionChange,
  editRequest,
  onEditRequestMet,
  renderEmptyState,
  density = "regular",
  ...labels
}: Omit<TableViewProps<T>, "layout">) {
  // The row focus is in (a cell or one of its inputs): an editable one shows its inputs.
  const [activeKey, setActiveKey] = useState<Key | null>(null);
  // The row being typed in: the table's keys go to its inputs.
  const [editingKey, setEditingKey] = useState<Key | null>(null);
  // The column whose input takes focus when editing starts: the cell last focused or pressed.
  const focusColumn = useRef<string | null>(null);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A pointer is down in the table: the focus it brings comes before its press ends.
  const pressing = useRef(false);
  // The press started editing a row, which then puts focus where it belongs.
  const startedDuringPress = useRef(false);
  const focusing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  useEffect(
    () => () => {
      if (leaving.current !== null) clearTimeout(leaving.current);
      if (focusing.current !== null) clearTimeout(focusing.current);
    },
    [],
  );

  const editable = (key: Key) => {
    const item = items.find((each) => each.id === key);
    return item !== undefined && (isRowEditable?.(item) ?? false);
  };
  /**
   * The row of an element in the table (the row itself, or one of its cells and what is
   * in it), as its key, which the row's cells carry.
   */
  const rowOf = (target: Element) => {
    const cell =
      target.closest<HTMLElement>("[data-row]") ??
      target
        .closest<HTMLElement>('[role="row"]')
        ?.querySelector<HTMLElement>("[data-row]");
    return (
      items.find((item) => String(item.id) === cell?.dataset.row)?.id ?? null
    );
  };

  /**
   * Focuses the row's input in the noted column (else its first), or the noted cell,
   * once the row has rendered again: React Aria renders a row's cells after the table, so
   * this waits for the task to end.
   */
  const focusLater = (key: Key, target: "input" | "cell") => {
    if (focusing.current !== null) clearTimeout(focusing.current);
    focusing.current = setTimeout(() => {
      focusing.current = null;
      const table = tableRef.current;
      if (table === null) return;
      const cells = [
        ...table.querySelectorAll<HTMLElement>(
          `[data-row="${CSS.escape(String(key))}"]`,
        ),
      ];
      const cell = cells.find(
        (each) => each.dataset.column === focusColumn.current,
      );
      if (target === "cell") {
        (cell ?? cells[0])?.focus();
        return;
      }
      (
        cell?.querySelector<HTMLElement>(FOCUSABLE) ??
        cells
          .map((each) => each.querySelector<HTMLElement>(FOCUSABLE))
          .find((input) => input !== null)
      )?.focus();
    }, 0);
  };

  const startEditing = (key: Key) => {
    startedDuringPress.current = pressing.current;
    setActiveKey(key);
    setEditingKey(key);
    focusLater(key, "input");
  };

  // Each request is met once, when its row is there: a new row arrives after the request.
  const metRequest = useRef<TableViewProps<T>["editRequest"]>(null);
  useEffect(() => {
    if (editRequest == null || metRequest.current === editRequest) return;
    if (!items.some((item) => item.id === editRequest.key)) return;
    metRequest.current = editRequest;
    focusColumn.current = editRequest.columnId;
    const item = items.find((each) => each.id === editRequest.key);
    if (item !== undefined && (isRowEditable?.(item) ?? false)) {
      startEditing(editRequest.key);
    } else {
      focusLater(editRequest.key, "cell");
    }
    onEditRequestMet?.();
  });

  /**
   * Brings the rows in line with where focus is: its row shows its inputs, and focus in
   * one of them (or a button that opens one) types in it. A column header has no row.
   */
  const follow = (target: Element | null) => {
    const table = tableRef.current;
    if (target === null || table === null || !table.contains(target)) return;
    const key = rowOf(target);
    if (key === null) {
      setActiveKey(null);
      setEditingKey(null);
      return;
    }
    const cell = target.closest("[data-column]");
    const inField = cell !== null && cell !== target;
    // Escape goes back to the cell last in focus, the input's or the cell's own.
    if (cell !== null) focusColumn.current = cell.getAttribute("data-column");
    setActiveKey(key);
    setEditingKey(inField && editable(key) ? key : null);
  };
  // The press's end, a task later, needs the rows as they are then.
  const followLatest = useRef(follow);
  followLatest.current = follow;

  // Focus is followed through React's tree, where an overlay a cell opened (a portal)
  // is still inside the table: moving into it keeps the row as it is.
  const onFocus = (event: FocusEvent) => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
    const target = event.target;
    // React Aria's grid may already have moved focus on (to the cell it remembers)
    // inside this very event: the focus that counts is the one that stays.
    if (!(target instanceof Element) || target !== document.activeElement)
      return;
    if (!tableRef.current?.contains(target)) return;
    const key = rowOf(target);
    // Focus that a press brings to a row still showing its values leaves the row as it
    // is: turning it into inputs would move what is under the pointer before the press
    // ends (a FauPicker would not open). The press starts editing (onAction), or, if it
    // does not end on the row, the rows follow focus once it is over.
    if (
      pressing.current &&
      key !== null &&
      key !== activeKey &&
      key !== editingKey
    ) {
      return;
    }
    follow(target);
  };
  /**
   * With a cell focused in a row that shows its inputs, ← and → go to the next cell, as
   * in any row: React Aria's grid would go into the cell's inputs first.
   */
  const onKeyDownCapture = (event: KeyboardEvent) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const cell = event.target;
    if (
      !(cell instanceof HTMLElement) ||
      cell.dataset.column === undefined ||
      cell.querySelector(FOCUSABLE) === null
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const next =
      event.key === "ArrowRight"
        ? cell.nextElementSibling
        : (cell.previousElementSibling ?? cell.parentElement);
    if (next instanceof HTMLElement) next.focus();
  };
  const onBlur = (event: FocusEvent) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    leaving.current = setTimeout(() => {
      leaving.current = null;
      setActiveKey(null);
      setEditingKey(null);
    }, 0);
  };
  const onEditKeyDown = (event: KeyboardEvent) => {
    // Escape from an overlay a cell opened (a portal) is the overlay's, and Escape that
    // ends an IME composition is the composition's (Safari reports it as 229).
    if (
      event.key === "Escape" &&
      !event.nativeEvent.isComposing &&
      event.nativeEvent.keyCode !== 229 &&
      event.currentTarget.contains(event.target as Node)
    ) {
      event.preventDefault();
      if (editingKey !== null) focusLater(editingKey, "cell");
      setEditingKey(null);
    }
    // The table navigates no more while a row is typed in; its keys stay with the inputs.
    event.stopPropagation();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only follows where focus is; the table inside handles the keys and presses.
    <div
      className={styles.scroller}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDownCapture={onKeyDownCapture}
      onPointerDownCapture={(event) => {
        // A primary press only: the others do not press rows.
        if (event.button !== 0) return;
        pressing.current = true;
        startedDuringPress.current = false;
        // Until the press has ended, its click included. A press that did not start
        // editing (dragged off, cancelled) leaves focus somewhere the rows now follow.
        const end = () => {
          window.removeEventListener("pointerup", end, true);
          window.removeEventListener("pointercancel", end, true);
          setTimeout(() => {
            pressing.current = false;
            if (!startedDuringPress.current) {
              followLatest.current(document.activeElement);
            }
          }, 0);
        };
        window.addEventListener("pointerup", end, true);
        window.addEventListener("pointercancel", end, true);
        const cell = (event.target as Element).closest<HTMLElement>(
          "[data-column]",
        );
        if (cell !== null) focusColumn.current = cell.dataset.column ?? null;
      }}
    >
      <AriaTable
        {...labels}
        ref={tableRef}
        selectionMode={selectionMode}
        selectedKeys={selectedKeys}
        onSelectionChange={
          onSelectionChange
            ? (selection) => onSelectionChange(toSet(selection))
            : undefined
        }
        className={`${styles.table} ${styles.density[density]}`}
      >
        <TableHeader columns={columns}>
          {(column) => (
            <Column
              id={column.id}
              isRowHeader={column.isRowHeader}
              // The fixed layout takes the columns' widths from the header's cells.
              style={
                column.width === undefined ? undefined : { width: column.width }
              }
              className={styles.headerCell({ kind: kindOf(column) })}
            >
              {column.isMark || column.isRowActions ? (
                <VisuallyHidden>{column.name}</VisuallyHidden>
              ) : (
                column.name
              )}
            </Column>
          )}
        </TableHeader>
        <TableBody
          items={items}
          dependencies={[
            activeKey,
            editingKey,
            renderCell,
            columns,
            isRowEditable,
            onRowAction,
            textValue,
            selectionMode,
          ]}
          renderEmptyState={
            renderEmptyState
              ? () => <div className={styles.empty}>{renderEmptyState()}</div>
              : undefined
          }
        >
          {(item) => {
            const isEditable = isRowEditable?.(item) ?? false;
            const chevronColumn = columns.findLast(
              (column) => !column.isRowActions && !column.isMark,
            );
            const showsInputs =
              isEditable && (activeKey === item.id || editingKey === item.id);
            const isTyping = isEditable && editingKey === item.id;
            const action = isEditable
              ? () => startEditing(item.id)
              : onRowAction
                ? () => onRowAction(item.id)
                : undefined;
            return (
              <Row
                id={item.id}
                columns={columns}
                // A row caches its cells: being touched changes what they render.
                dependencies={[
                  showsInputs,
                  isTyping,
                  renderCell,
                  columns,
                  isEditable,
                  onRowAction,
                  selectionMode,
                ]}
                textValue={rowTextOf({ columns, renderCell, textValue }, item)}
                onAction={action}
                className={styles.row({
                  isActionable:
                    action !== undefined || selectionMode !== "none",
                  isEditing: showsInputs,
                })}
              >
                {(column) => (
                  <Cell
                    data-row={String(item.id)}
                    data-column={column.id}
                    // An editable row's arrows land on its cells, not in their inputs:
                    // Enter or a press starts typing.
                    focusMode={isEditable ? "cell" : undefined}
                    className={styles.cell({ kind: kindOf(column) })}
                  >
                    <TableCellContext.Provider
                      value={{
                        isNumeric: column.numeric ?? false,
                        isEditing: showsInputs,
                      }}
                    >
                      {isEditable ? (
                        // One element whether the row shows its values or its inputs, so
                        // what a cell renders in both (a FauPicker) keeps its state.
                        // biome-ignore lint/a11y/noStaticElementInteractions: the cell's inputs take the keys; this ends typing on Escape and keeps the keys and presses from the table.
                        <div
                          className={
                            kindOf(column) === "mark"
                              ? styles.mark
                              : kindOf(column) === "actions"
                                ? styles.actions
                                : showsInputs
                                  ? styles.editing
                                  : styles.value
                          }
                          onPointerDown={
                            showsInputs
                              ? (event) => event.stopPropagation()
                              : undefined
                          }
                          onKeyDown={isTyping ? onEditKeyDown : undefined}
                        >
                          {isTyping && <KeyboardNavigationOff />}
                          {renderCell(item, column.id, {
                            isEditing: showsInputs,
                            isCard: false,
                          })}
                        </div>
                      ) : (onRowAction !== undefined ||
                          selectionMode !== "none") &&
                        column === chevronColumn ? (
                        // A row pressed to open something or show it beside the table
                        // ends in › (design-spec 4.4), before its ⋯.
                        <span className={styles.withChevron}>
                          <span className={styles.chevronContent}>
                            {renderCell(item, column.id, {
                              isEditing: false,
                              isCard: false,
                            })}
                          </span>
                          <span className={styles.chevron}>
                            <IconSlot size="S">
                              <ChevronRight />
                            </IconSlot>
                          </span>
                        </span>
                      ) : (
                        <div
                          className={
                            kindOf(column) === "mark"
                              ? styles.mark
                              : kindOf(column) === "actions"
                                ? styles.actions
                                : styles.wrapped
                          }
                        >
                          {renderCell(item, column.id, {
                            isEditing: false,
                            isCard: false,
                          })}
                        </div>
                      )}
                    </TableCellContext.Provider>
                  </Cell>
                )}
              </Row>
            );
          }}
        </TableBody>
      </AriaTable>
    </div>
  );
}

/**
 * Turns the table's arrow keys and typing-to-find off while a row is edited, so the
 * inputs get them (React Aria's grid would move to the next cell on ← and →).
 */
function KeyboardNavigationOff() {
  const state = useContext(TableStateContext);
  useEffect(() => {
    if (state === null) return;
    state.setKeyboardNavigationDisabled(true);
    return () => state.setKeyboardNavigationDisabled(false);
  }, [state]);
  return null;
}

/**
 * A phone's table (and `layout="cards"`): one line per row, divided by hairlines under a
 * line, not boxed (design-spec 4.3・4.5; s17-costs.html). The mark at the start, the name
 * and under it the values marked `isBelowName`, and at the end the one other value; a row
 * with more values lists them under its name with their labels.
 */
function LineRows<T extends { id: Key }>({
  columns,
  items,
  renderCell,
  textValue,
  onRowAction,
  selectionMode = "none",
  selectedKeys,
  onSelectionChange,
  renderEmptyState,
  density = "regular",
  ...labels
}: Omit<TableViewProps<T>, "layout" | "isRowEditable">) {
  const mark = columns.find((column) => column.isMark);
  const header = columns.find((column) => column.isRowHeader);
  const below = columns.filter(
    (column) => column.isBelowName && column !== header,
  );
  const rest = columns.filter(
    (column) => column !== mark && column !== header && !below.includes(column),
  );
  const [end] = rest.length === 1 ? rest : [];
  const cell = (item: T, column: TableColumn) => (
    <TableCellContext.Provider
      value={{ isNumeric: column.numeric ?? false, isEditing: false }}
    >
      {renderCell(item, column.id, { isEditing: false, isCard: true })}
    </TableCellContext.Provider>
  );
  return (
    <GridList
      {...labels}
      items={items}
      dependencies={[
        renderCell,
        columns,
        onRowAction,
        selectionMode,
        textValue,
      ]}
      selectionMode={selectionMode}
      selectedKeys={selectedKeys}
      onSelectionChange={
        onSelectionChange
          ? (selection) => onSelectionChange(toSet(selection))
          : undefined
      }
      renderEmptyState={renderEmptyState}
      className={`${styles.lines} ${styles.density[density]}`}
    >
      {(item) => {
        // A row pressed to open something or to choose it ends in › (design-spec 4.4).
        const isPressable =
          onRowAction !== undefined || selectionMode !== "none";
        return (
          <GridListItem
            id={item.id}
            textValue={rowTextOf({ columns, renderCell, textValue }, item)}
            onAction={onRowAction ? () => onRowAction(item.id) : undefined}
            className={styles.line({ isActionable: isPressable })}
          >
            {mark !== undefined && (
              <span className={styles.lineMark}>{cell(item, mark)}</span>
            )}
            <div className={styles.lineBody}>
              {header !== undefined && (
                <span className={styles.lineTitle}>{cell(item, header)}</span>
              )}
              {below.map((column) => (
                <span key={column.id} className={styles.lineBelow}>
                  {cell(item, column)}
                </span>
              ))}
              {end === undefined && rest.length > 0 && (
                <dl className={styles.lineValues}>
                  {rest.map((column) => (
                    <div key={column.id} className={styles.lineValue}>
                      <dt className={styles.lineLabel}>{column.name}</dt>
                      <dd
                        className={styles.lineData({
                          numeric: column.numeric ?? false,
                        })}
                      >
                        {cell(item, column)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
            {end !== undefined && (
              <span
                className={styles.lineEnd({ numeric: end.numeric ?? false })}
              >
                {cell(item, end)}
              </span>
            )}
            {isPressable && (
              <span className={styles.chevron}>
                <IconSlot size="S">
                  <ChevronRight />
                </IconSlot>
              </span>
            )}
          </GridListItem>
        );
      }}
    </GridList>
  );
}
