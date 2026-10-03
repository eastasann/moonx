import type { Density } from "@moonx/ui-tokens";
import { Check } from "lucide-react-native";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useContext,
  useMemo,
} from "react";
import { FlatList, Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import { SelectionBox, SelectionCheckbox } from "../../internal/SelectionBox";
import {
  type Key,
  type Selection,
  type SelectionState,
  useSelection,
} from "../../internal/selection";
import { atLeastTarget } from "../../internal/sizes";
import { fontStyle } from "../../internal/typography";

export type { Key, Selection };

interface ListViewState {
  density: Density;
  selection: SelectionState;
  onAction?: (key: Key) => void;
}

const ListViewContext = createContext<ListViewState | null>(null);

interface Entry {
  key: Key;
  node: ReactNode;
  /** Read from the row element's `isDisabled`, so `"all"` skips rows disabled in place. */
  isDisabled: boolean;
}

const disabledOf = (node: ReactNode) =>
  isValidElement<{ isDisabled?: boolean }>(node) && node.props.isDisabled === true;

export interface ListViewProps<T extends object> {
  "aria-label": string;
  /** Row height, padding and the gap between rows (design-spec 4.4). */
  density?: Density;
  /** Content for a list with no items, such as an IllustratedMessage. */
  emptyState?: ReactNode;
  /**
   * `single` selects the pressed row and shows a check mark on it. `multiple` draws a checkbox
   * on every row. Unlike the Web part there is no `selectionBehavior`: selection is always
   * `toggle`.
   */
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: Selection;
  defaultSelectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  disabledKeys?: Iterable<Key>;
  /** Keeps the last selected row selected. */
  disallowEmptySelection?: boolean;
  /**
   * Fires with the row's `id` when a row is pressed in `none` selection mode. In `multiple` mode
   * the checkbox selects and a press on the rest of the row fires it. In `single` mode a press
   * selects and this is not called.
   */
  onAction?: (key: Key) => void;
  /** Data for the render function in `children`. Each item needs an `id` (or a `key`). */
  items?: Iterable<T>;
  /** `ListViewItem`s, or with `items` a function that returns one for an item. */
  children: ReactNode | ((item: T) => ReactNode);
}

function entriesOf<T extends object>(
  items: Iterable<T> | undefined,
  children: ListViewProps<T>["children"],
): Entry[] {
  if (items !== undefined && typeof children === "function") {
    return Array.from(items, (item, index) => {
      const withKey = item as { id?: Key; key?: Key };
      const node = children(item);
      return { key: withKey.id ?? withKey.key ?? index, node, isDisabled: disabledOf(node) };
    });
  }
  return Children.toArray(children as ReactNode)
    .filter(isValidElement<{ id?: Key }>)
    .map((element, index) => ({
      key: element.props.id ?? index,
      node: element,
      isDisabled: disabledOf(element),
    }));
}

/**
 * Selectable list of rows, virtualized with `FlatList` so long lists stay light. It scrolls
 * itself: give it the screen body (or a bounded height) and do not put it inside a `ScrollView`.
 * Used for ideas, research log, notifications and the execution lists. Compose rows with
 * `ListViewItem`.
 *
 * Web props with no phone meaning: `selectionBehavior`, `dependencies`, `shouldSelectOnPressUp`,
 * `keyboardDelegate`, `autoFocus` and the other keyboard-navigation props (React Native has no
 * arrow-key navigation); `dragAndDropHooks` (no row reordering on the phone).
 */
export function ListView<T extends object>({
  "aria-label": ariaLabel,
  density = "regular",
  emptyState,
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  disabledKeys,
  disallowEmptySelection,
  onAction,
  items,
  children,
}: ListViewProps<T>) {
  const entries = useMemo(() => entriesOf(items, children), [items, children]);
  const allKeys = useMemo(() => entries.map((entry) => entry.key), [entries]);
  const allDisabled = useMemo(() => {
    const inPlace = entries.filter((entry) => entry.isDisabled).map((entry) => entry.key);
    return disabledKeys ? [...disabledKeys, ...inPlace] : inPlace;
  }, [entries, disabledKeys]);
  const selection = useSelection({
    mode: selectionMode,
    selectedKeys,
    defaultSelectedKeys,
    onSelectionChange,
    disallowEmptySelection,
    allKeys,
    disabledKeys: allDisabled,
  });
  const state = useMemo<ListViewState>(
    () => ({ density, selection, onAction }),
    [density, selection, onAction],
  );
  styles.useVariants({ density });
  return (
    <ListViewContext.Provider value={state}>
      <FlatList
        role="list"
        aria-label={ariaLabel}
        data={entries}
        extraData={state}
        keyExtractor={(entry) => String(entry.key)}
        renderItem={({ item }) => <>{item.node}</>}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={emptyState ? <View style={styles.empty}>{emptyState}</View> : null}
      />
    </ListViewContext.Provider>
  );
}

function Separator() {
  styles.useVariants({ density: useContext(ListViewContext)?.density ?? "regular" });
  return <View style={styles.separator} />;
}

export interface ListViewItemProps {
  /** Identity of the row in `selectedKeys`, `disabledKeys` and `onAction`. */
  id: Key;
  /** Plain text of the row, used as its accessible name. */
  textValue: string;
  isDisabled?: boolean;
  /** Overrides the list's `onAction` for this row. The Web part's `href` is not accepted. */
  onAction?: () => void;
  testID?: string;
  children: ReactNode;
}

/**
 * One row of a `ListView`. A pressable row is one accessibility element named by `textValue`,
 * so controls placed inside it are not reachable by a screen reader: keep them outside the row.
 * With `selectionMode="multiple"` it shows a selection checkbox.
 */
export function ListViewItem({
  id,
  textValue,
  isDisabled = false,
  onAction,
  testID,
  children,
}: ListViewItemProps) {
  const { theme } = useUnistyles();
  const list = useContext(ListViewContext);
  const density = list?.density ?? "regular";
  const mode = list?.selection.mode ?? "none";
  const selected = list?.selection.isSelected(id) ?? false;
  const disabled = isDisabled || (list?.selection.isDisabled(id) ?? false);
  const action = onAction ?? (list?.onAction ? () => list.onAction?.(id) : undefined);
  styles.useVariants({ density, selected, disabled });

  const content = (
    <View style={styles.content}>
      <Content textStyle={styles.text} iconSize={styles.icon.width}>
        {children}
      </Content>
    </View>
  );

  if (mode === "multiple" && action) {
    return (
      <View role="listitem" testID={testID} style={styles.row(false)}>
        <SelectionCheckbox
          isSelected={selected}
          isDisabled={disabled}
          aria-label={textValue}
          onPress={() => list?.selection.toggle(id)}
        />
        <Pressable
          role="button"
          aria-label={textValue}
          aria-disabled={disabled}
          disabled={disabled}
          onPress={action}
          style={({ pressed }) => styles.contentPressable(pressed)}
        >
          {content}
        </Pressable>
      </View>
    );
  }

  if (mode === "none" && !action) {
    return (
      <View role="listitem" testID={testID} style={styles.row(false)}>
        {content}
      </View>
    );
  }

  const press = () => {
    if (mode === "none") action?.();
    else list?.selection.toggle(id);
  };
  return (
    <Pressable
      role={mode === "multiple" ? "checkbox" : "button"}
      aria-label={textValue}
      aria-selected={mode === "single" ? selected : undefined}
      aria-checked={mode === "multiple" ? selected : undefined}
      aria-disabled={disabled}
      disabled={disabled}
      testID={testID}
      onPress={press}
      style={({ pressed }) => styles.row(pressed)}
    >
      {mode === "multiple" ? <SelectionBox isSelected={selected} isDisabled={disabled} /> : null}
      {content}
      {mode === "single" && selected ? (
        <View aria-hidden importantForAccessibility="no-hide-descendants">
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

const styles = StyleSheet.create((theme) => {
  const byDensity = <T,>(make: (d: Density) => T) => ({
    compact: make("compact"),
    regular: make("regular"),
    spacious: make("spacious"),
  });
  const targetMin = theme.scale.component["target-min"];
  return {
    separator: {
      variants: {
        density: byDensity((d) => ({ height: theme.density[d]["list-gap"] })),
      },
    },
    row: (pressed: boolean) => ({
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["200"],
      backgroundColor: pressed ? theme.color.surface.hover : theme.color.surface.raised,
      borderWidth: theme["border-width"].hairline,
      borderColor: theme.color.border.hairline,
      borderRadius: theme.radius.control,
      variants: {
        density: byDensity((d) => ({
          minHeight: atLeastTarget(theme.density[d]["row-height"], targetMin),
          paddingHorizontal: theme.density[d]["cell-padding-x"],
          paddingVertical: theme.density[d]["cell-padding-y"],
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
    contentPressable: (pressed: boolean) => ({
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      minHeight: targetMin,
      backgroundColor: pressed ? theme.color.surface.hover : "transparent",
    }),
    content: { flex: 1, minWidth: 0 },
    text: {
      ...fontStyle(theme, "body"),
      color: theme.color.text.primary,
      variants: { disabled: { true: { color: theme.color.text.disabled }, false: {} } },
    },
    icon: { width: theme.scale.component.icon.size.S },
    empty: { padding: theme.space["400"], alignItems: "center" },
  };
});
