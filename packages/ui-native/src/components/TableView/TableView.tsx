import type { Density } from "@moonx/ui-tokens";
import { ArrowDown, ArrowUp, Check } from "lucide-react-native";
import { createContext, type ReactNode, useContext, useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { textOf } from "../../internal/FieldParts";
import { SelectionBox, SelectionCheckbox } from "../../internal/SelectionBox";
import { type Key, type Selection, useSelection } from "../../internal/selection";
import { atLeastTarget } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";

export type { Key, Selection };

export interface TableViewColumn {
  id: string;
  /** Header text. In the card layout it labels the value inside each card and the sort control. */
  label: string;
  /** The row's name column. Its cell is exposed as the row header. */
  isRowHeader?: boolean;
  allowsSorting?: boolean;
  /** Right-aligns the value and sets its figures in tabular numerals so digits line up. */
  isNumeric?: boolean;
  /** Accepted for the same vocabulary as the Web part; cards have no columns, so it is not read. */
  width?: number | string;
}

export interface TableViewRow {
  id: Key;
  /** Cell content keyed by column id. A missing key renders an empty cell. */
  cells: Readonly<Record<string, ReactNode>>;
  /**
   * Accessible name of a pressable or selectable card. Without it the name is built from the
   * text cells, as "Label: value, Label: value".
   */
  textValue?: string;
  isDisabled?: boolean;
}

export interface SortDescriptor {
  column: Key;
  direction: "ascending" | "descending";
}

export interface TableViewProps {
  "aria-label": string;
  columns: readonly TableViewColumn[];
  rows: readonly TableViewRow[];
  /** Card padding and the gap between cards (design-spec 4.4). */
  density?: Density;
  /**
   * Accepted for the same vocabulary as the Web part. A phone never shows a grid or a
   * horizontal scroll (design-spec 4.3), so `auto`, `table` and `cards` all draw the cards.
   */
  layout?: "auto" | "table" | "cards";
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: Selection;
  defaultSelectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  sortDescriptor?: SortDescriptor;
  /** Fires when a sort control is pressed: ascending first, then it flips. */
  onSortChange?: (descriptor: SortDescriptor) => void;
  /**
   * Fires with the row's `id` when a card is pressed in `none` selection mode. In `multiple`
   * mode the checkbox selects and a press on the rest of the card fires it. In `single` mode a
   * press selects and this is not called.
   */
  onRowAction?: (key: Key) => void;
  /** Content for a table with no rows, such as an IllustratedMessage. */
  emptyState?: ReactNode;
  /**
   * Accessible name of the select-all checkbox shown above the cards in `multiple` mode. The Web
   * part gets it from React Aria's own English strings, which this package must not carry, so
   * the phone draws the control only when the screen passes the label.
   */
  selectAllLabel?: string;
  /**
   * Spoken direction of the sorted column, such as "ascending". React Aria announces it on the
   * Web; React Native has no `aria-sort`, so the phone reads it as the value of the sort control.
   */
  sortLabels?: { ascending: string; descending: string };
}

const DensityContext = createContext<Density>("regular");

/**
 * Data table, drawn on the phone as one card per row with the column labels inside each card
 * (design-spec 4.3), so there is never a horizontal scroll. The semantics stay `grid`. Sorting is
 * a row of controls above the cards. The cards are plain views: the table sits in the screen's
 * own scroll, so a very long table belongs in a `ListView`.
 *
 * Web props with no phone meaning: `column.width` (not read), `layout` (always cards),
 * `selectionBehavior`, `disabledBehavior`, keyboard-navigation props, `dragAndDropHooks`.
 */
export function TableView({
  "aria-label": ariaLabel,
  columns,
  rows,
  density = "regular",
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  sortDescriptor,
  onSortChange,
  onRowAction,
  emptyState,
  selectAllLabel,
  sortLabels,
}: TableViewProps) {
  const allKeys = useMemo(() => rows.map((row) => row.id), [rows]);
  const disabledKeys = useMemo(() => rows.filter((r) => r.isDisabled).map((r) => r.id), [rows]);
  const selection = useSelection({
    mode: selectionMode,
    selectedKeys,
    defaultSelectedKeys,
    onSelectionChange,
    allKeys,
    disabledKeys,
  });
  styles.useVariants({ density });
  const sortable = columns.filter((column) => column.allowsSorting);
  const showSelectAll = selectionMode === "multiple" && selectAllLabel !== undefined;
  return (
    <DensityContext.Provider value={density}>
      <View role="grid" aria-label={ariaLabel} style={styles.table}>
        {showSelectAll || sortable.length > 0 ? (
          <View style={styles.header}>
            {showSelectAll ? (
              <SelectionCheckbox
                isSelected={selection.isAllSelected}
                isIndeterminate={selection.isSomeSelected}
                aria-label={selectAllLabel}
                onPress={selection.toggleAll}
              />
            ) : null}
            {sortable.map((column) => (
              <SortControl
                key={column.id}
                column={column}
                descriptor={sortDescriptor}
                onSortChange={onSortChange}
                sortLabels={sortLabels}
              />
            ))}
          </View>
        ) : null}
        {rows.length === 0 && emptyState ? <View style={styles.empty}>{emptyState}</View> : null}
        {rows.map((row) => (
          <TableCard
            key={row.id}
            row={row}
            columns={columns}
            selection={selection}
            onRowAction={onRowAction}
          />
        ))}
      </View>
    </DensityContext.Provider>
  );
}

function SortControl({
  column,
  descriptor,
  onSortChange,
  sortLabels,
}: {
  column: TableViewColumn;
  descriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  sortLabels?: TableViewProps["sortLabels"];
}) {
  const { theme } = useUnistyles();
  const active = descriptor?.column === column.id;
  const Arrow = active && descriptor.direction === "descending" ? ArrowDown : ArrowUp;
  const next = active && descriptor.direction === "ascending" ? "descending" : "ascending";
  return (
    <Pressable
      role="button"
      aria-label={column.label}
      aria-selected={active}
      accessibilityValue={
        active && sortLabels ? { text: sortLabels[descriptor.direction] } : undefined
      }
      onPress={() => onSortChange?.({ column: column.id, direction: next })}
      style={({ pressed }) => styles.sort(pressed, active)}
    >
      <Text style={styles.sortLabel}>{column.label}</Text>
      <View
        aria-hidden
        importantForAccessibility="no-hide-descendants"
        style={styles.sortIcon(active)}
      >
        <Arrow
          size={theme.scale.component.icon.size.XS}
          color={theme.color.text.secondary}
          strokeWidth={theme.icon["stroke-width"]}
        />
      </View>
    </Pressable>
  );
}

function nameOf(row: TableViewRow, columns: readonly TableViewColumn[]): string {
  if (row.textValue !== undefined) return row.textValue;
  return columns
    .map((column) => [column.label, textOf(row.cells[column.id])] as const)
    .filter(([, text]) => text !== "")
    .map(([label, text]) => `${label}: ${text}`)
    .join(", ");
}

function TableCard({
  row,
  columns,
  selection,
  onRowAction,
}: {
  row: TableViewRow;
  columns: readonly TableViewColumn[];
  selection: ReturnType<typeof useSelection>;
  onRowAction?: (key: Key) => void;
}) {
  const { theme } = useUnistyles();
  const density = useContext(DensityContext);
  const mode = selection.mode;
  const selected = selection.isSelected(row.id);
  const disabled = row.isDisabled === true || selection.isDisabled(row.id);
  const action = onRowAction ? () => onRowAction(row.id) : undefined;
  styles.useVariants({ density, selected, disabled });
  const name = nameOf(row, columns);

  const cells = (
    <View style={styles.cells}>
      {columns.map((column) => (
        <TableCell
          key={column.id}
          column={column}
          node={row.cells[column.id]}
          disabled={disabled}
        />
      ))}
    </View>
  );

  if (mode === "multiple" && action) {
    return (
      <View role="row" style={styles.card(false)}>
        <SelectionCheckbox
          isSelected={selected}
          isDisabled={disabled}
          aria-label={name}
          onPress={() => selection.toggle(row.id)}
        />
        <Pressable
          role="button"
          aria-label={name}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={action}
          style={({ pressed }) => styles.cellsPressable(pressed)}
        >
          {cells}
        </Pressable>
      </View>
    );
  }

  if (mode === "none" && !action) {
    return (
      <View role="row" style={styles.card(false)}>
        {cells}
      </View>
    );
  }

  const press = () => {
    if (mode === "none") action?.();
    else selection.toggle(row.id);
  };
  return (
    <Pressable
      role={mode === "multiple" ? "checkbox" : "button"}
      aria-label={name}
      aria-selected={mode === "single" ? selected : undefined}
      aria-checked={mode === "multiple" ? selected : undefined}
      aria-disabled={disabled}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => styles.card(pressed)}
    >
      {mode === "multiple" ? (
        <View style={styles.selectionSlot}>
          <SelectionBox isSelected={selected} isDisabled={disabled} />
        </View>
      ) : null}
      {cells}
      {mode === "single" && selected ? (
        <View
          aria-hidden
          importantForAccessibility="no-hide-descendants"
          style={styles.selectionSlot}
        >
          <Check
            size={theme.scale.component.icon.size.S}
            color={theme.color.text.primary}
            strokeWidth={theme.icon["stroke-width"]}
          />
        </View>
      ) : null}
    </Pressable>
  );
}

function TableCell({
  column,
  node,
  disabled,
}: {
  column: TableViewColumn;
  node: ReactNode;
  disabled: boolean;
}) {
  const density = useContext(DensityContext);
  styles.useVariants({ density, numeric: column.isNumeric ?? false, disabled });
  return (
    <View role={column.isRowHeader ? "rowheader" : "cell"} accessible style={styles.cell}>
      <Text style={styles.cellLabel}>{column.label}</Text>
      <View style={styles.cellValue}>
        <Content textStyle={styles.cellText} iconSize={styles.icon.width}>
          {node}
        </Content>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => {
  const byDensity = <T,>(make: (d: Density) => T) => ({
    compact: make("compact"),
    regular: make("regular"),
    spacious: make("spacious"),
  });
  const targetMin = theme.scale.component["target-min"];
  return {
    table: {
      variants: { density: byDensity((d) => ({ rowGap: theme.density[d]["list-gap"] })) },
    },
    header: {
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: theme.space["100"],
      paddingBottom: theme.space["100"],
    },
    sort: (pressed: boolean, active: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["75"],
      minHeight: targetMin,
      paddingHorizontal: theme.space["200"],
      borderRadius: theme.radius.chip,
      backgroundColor:
        pressed || active
          ? theme.color.control["secondary-pressed"]
          : theme.color.control.secondary,
    }),
    sortLabel: { ...fontStyle(theme, "table-header"), color: theme.color.text.secondary },
    sortIcon: (active: boolean) => ({ opacity: active ? 1 : 0 }),
    card: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: pressed ? theme.color.surface.hover : theme.color.surface.raised,
      borderWidth: theme["border-width"].hairline,
      borderColor: theme.color.border.hairline,
      borderRadius: theme.radius.card,
      variants: {
        density: byDensity((d) => ({
          minHeight: atLeastTarget(theme.density[d]["row-height"], targetMin),
        })),
        selected: {
          true: {
            backgroundColor: theme.color.surface.selected,
            borderColor: theme.color.control["track-fill"],
          },
          false: {},
        },
        disabled: { true: {}, false: {} },
      },
    }),
    cells: { flex: 1, minWidth: 0 },
    cellsPressable: (pressed: boolean) => ({
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      minHeight: targetMin,
      backgroundColor: pressed ? theme.color.surface.hover : "transparent",
    }),
    selectionSlot: {
      alignItems: "center",
      justifyContent: "center",
      minWidth: targetMin,
      minHeight: targetMin,
    },
    cell: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: theme.space["200"],
      variants: {
        density: byDensity((d) => ({
          paddingHorizontal: theme.density[d]["cell-padding-x"],
          paddingVertical: theme.density[d]["cell-padding-y"],
        })),
      },
    },
    cellLabel: {
      ...fontStyle(theme, "label-sm"),
      flexShrink: 0,
      color: theme.color.text.secondary,
    },
    cellValue: { flexShrink: 1, minWidth: 0 },
    cellText: {
      ...fontStyle(theme, "table"),
      color: theme.color.text.primary,
      variants: {
        numeric: {
          true: { ...fontStyle(theme, "number"), textAlign: "right" },
          false: {},
        },
        disabled: { true: { color: theme.color.text.disabled }, false: {} },
      },
    },
    icon: { width: theme.scale.component.icon.size.S },
    empty: { padding: theme.space["400"], alignItems: "center" },
  };
});
