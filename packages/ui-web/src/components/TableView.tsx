import type { Density, TableLayout } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
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
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./TableView.css";

export interface TableColumn {
  id: string;
  /** The header's text; on a phone, each value's label in the row's card. */
  name: string;
  /** The column that names the row: its value is the card's title on a phone. */
  isRowHeader?: boolean;
  /** Amounts and counts: the monospaced face, aligned right (design-spec 4.4). */
  numeric?: boolean;
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
       * A phone's card, which presses as a whole: the cell shows its value only, with no
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
   * On a phone the row is a card that calls `onRowAction`, for the screen's sheet.
   */
  isRowEditable?: (item: T) => boolean;
  /** Pressing a row (that is not edited in place): open it, or its sheet on a phone. */
  onRowAction?: (key: Key) => void;
  /** `single` keeps one row chosen, as a list beside its detail does (pattern D). */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  /** Shown in place of the rows when there are none. */
  renderEmptyState?: () => ReactNode;
  /** @default "regular" */
  density?: Density;
  /**
   * `auto`: a table on tablet and wider, a card per row on a phone. A phone always shows
   * cards (design-spec 4.5).
   * @default "auto"
   */
  layout?: TableLayout;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]';

const toSet = (selection: Selection): Set<Key> =>
  selection === "all" ? new Set() : new Set(selection);

/**
 * Rows of values in columns (17・18・7・28・15・21, design-spec 4.5): arrow keys move from
 * cell to cell. Editable rows show their values as text until touched.
 */
export function TableView<T extends { id: Key }>({
  density = "regular",
  layout = "auto",
  ...props
}: TableViewProps<T>) {
  const isNarrow = useIsNarrow();
  const { isRowEditable: _, ...cardProps } = props;
  return isNarrow || layout === "cards" ? (
    <CardRows {...cardProps} density={density} />
  ) : (
    <GridTable {...props} density={density} />
  );
}

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
        <TableHeader columns={columns} className={styles.headerRow}>
          {(column) => (
            <Column
              id={column.id}
              isRowHeader={column.isRowHeader}
              className={styles.headerCell({
                numeric: column.numeric ?? false,
              })}
            >
              {column.name}
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
                    className={styles.cell({
                      numeric: column.numeric ?? false,
                    })}
                  >
                    {isEditable ? (
                      // One element whether the row shows its values or its inputs, so
                      // what a cell renders in both (a FauPicker) keeps its state.
                      // biome-ignore lint/a11y/noStaticElementInteractions: the cell's inputs take the keys; this ends typing on Escape and keeps the keys and presses from the table.
                      <div
                        className={showsInputs ? styles.editing : undefined}
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
                      column === columns[columns.length - 1] ? (
                      // A row pressed to open something or show it beside the table ends
                      // in › (design-spec 4.4).
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
                      renderCell(item, column.id, {
                        isEditing: false,
                        isCard: false,
                      })
                    )}
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

/** A phone's table: a card per row, its header cell as the title and the rest as label and value. */
function CardRows<T extends { id: Key }>({
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
  const header = columns.find((column) => column.isRowHeader);
  const rest = columns.filter((column) => column !== header);
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
      className={`${styles.cards} ${styles.density[density]}`}
    >
      {(item) => {
        // A card pressed to open something or to choose it ends in › (design-spec 4.4).
        const isPressable =
          onRowAction !== undefined || selectionMode !== "none";
        return (
          <GridListItem
            id={item.id}
            textValue={rowTextOf({ columns, renderCell, textValue }, item)}
            onAction={onRowAction ? () => onRowAction(item.id) : undefined}
            className={styles.card({ isActionable: isPressable })}
          >
            <div className={styles.cardBody}>
              {header !== undefined && (
                <span className={styles.cardTitle}>
                  {renderCell(item, header.id, {
                    isEditing: false,
                    isCard: true,
                  })}
                </span>
              )}
              <dl className={styles.cardValues}>
                {rest.map((column) => (
                  <div key={column.id} className={styles.cardValue}>
                    <dt className={styles.cardLabel}>{column.name}</dt>
                    <dd
                      className={styles.cardData({
                        numeric: column.numeric ?? false,
                      })}
                    >
                      {renderCell(item, column.id, {
                        isEditing: false,
                        isCard: true,
                      })}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
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
