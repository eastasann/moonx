import { Check, ChevronRight } from "lucide-react-native";
import {
  Children,
  createContext,
  isValidElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { Content } from "../../internal/Content";
import {
  type Key,
  type Selection,
  type SelectionState,
  useSelection,
} from "../../internal/selection";
import { fontStyle } from "../../internal/typography";

export type { Key, Selection };

interface TreeState {
  selection: SelectionState;
  expanded: ReadonlySet<Key>;
  toggleExpanded: (key: Key) => void;
  onAction?: (key: Key) => void;
}

const TreeContext = createContext<TreeState | null>(null);
const LevelContext = createContext(1);

export interface TreeProps<T extends object> {
  "aria-label": string;
  /** Content for a tree with no nodes. */
  emptyState?: ReactNode;
  /**
   * `single` and `multiple` make a press select the node and show a check mark on it, so
   * expanding goes through the chevron. In `multiple` mode a press toggles the node.
   */
  selectionMode?: "none" | "single" | "multiple";
  selectedKeys?: Selection;
  defaultSelectedKeys?: Selection;
  onSelectionChange?: (keys: Selection) => void;
  disabledKeys?: Iterable<Key>;
  disallowEmptySelection?: boolean;
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  onExpandedChange?: (keys: Set<Key>) => void;
  /**
   * Fires with the node's `id` when it is pressed. With an action, selection and expansion go
   * through the chevron (and selection through nothing else), as in the Web part.
   */
  onAction?: (key: Key) => void;
  /** Data for the render function in `children`. Each item needs an `id` (or a `key`). */
  items?: Iterable<T>;
  /** `TreeItem`s, or with `items` a function that returns one for an item. */
  children: ReactNode | ((item: T) => ReactNode);
}

function nodesOf<T extends object>(
  items: Iterable<T> | undefined,
  children: TreeProps<T>["children"],
): ReactNode[] {
  if (items !== undefined && typeof children === "function") {
    return Array.from(items, (item, index) => {
      const withKey = item as { id?: Key; key?: Key };
      return <TreeKeyed key={withKey.id ?? withKey.key ?? index}>{children(item)}</TreeKeyed>;
    });
  }
  return Children.toArray(children as ReactNode);
}

function TreeKeyed({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

function collectKeys(nodes: ReactNode, into: Key[], disabled: Key[]): Key[] {
  for (const node of Children.toArray(nodes)) {
    if (!isValidElement<{ id?: Key; isDisabled?: boolean; children?: ReactNode }>(node)) continue;
    const inner = node.type === TreeKeyed ? node.props.children : node;
    if (!isValidElement<{ id?: Key; isDisabled?: boolean; children?: ReactNode }>(inner)) continue;
    if (inner.props.id !== undefined) {
      into.push(inner.props.id);
      if (inner.props.isDisabled === true) disabled.push(inner.props.id);
    }
    collectKeys(inner.props.children, into, disabled);
  }
  return into;
}

/**
 * Expandable outline of nodes as a full-screen scrolling list, for the section and question
 * outline in the template editor (screen 27). Build nodes with `TreeItem`; nest items to add
 * depth. A collapsed node does not render its children. Dynamic nested children are built with
 * `map` (the Web part's `Collection` has no phone twin).
 *
 * Web props with no phone meaning: `selectionBehavior`, `dragAndDropHooks`, `disabledBehavior`
 * and the keyboard-navigation props.
 */
export function Tree<T extends object>({
  "aria-label": ariaLabel,
  emptyState,
  selectionMode = "none",
  selectedKeys,
  defaultSelectedKeys,
  onSelectionChange,
  disabledKeys,
  disallowEmptySelection,
  expandedKeys,
  defaultExpandedKeys,
  onExpandedChange,
  onAction,
  items,
  children,
}: TreeProps<T>) {
  const nodes = useMemo(() => nodesOf(items, children), [items, children]);
  const { allKeys, allDisabled } = useMemo(() => {
    const inPlace: Key[] = [];
    const keys = collectKeys(nodes, [], inPlace);
    return {
      allKeys: keys,
      allDisabled: disabledKeys ? [...disabledKeys, ...inPlace] : inPlace,
    };
  }, [nodes, disabledKeys]);
  const selection = useSelection({
    mode: selectionMode,
    selectedKeys,
    defaultSelectedKeys,
    onSelectionChange,
    disallowEmptySelection,
    allKeys,
    disabledKeys: allDisabled,
  });
  const [innerExpanded, setInnerExpanded] = useState<Set<Key>>(() => new Set(defaultExpandedKeys));
  const controlled = expandedKeys !== undefined;
  const expanded = useMemo(
    () => (controlled ? new Set(expandedKeys) : innerExpanded),
    [controlled, expandedKeys, innerExpanded],
  );
  const toggleExpanded = useCallback(
    (key: Key) => {
      const next = new Set(expanded);
      if (!next.delete(key)) next.add(key);
      if (!controlled) setInnerExpanded(next);
      onExpandedChange?.(next);
    },
    [expanded, controlled, onExpandedChange],
  );
  const state = useMemo<TreeState>(
    () => ({ selection, expanded, toggleExpanded, onAction }),
    [selection, expanded, toggleExpanded, onAction],
  );
  return (
    <TreeContext.Provider value={state}>
      <ScrollView
        role="tree"
        aria-label={ariaLabel}
        contentContainerStyle={styles.tree}
        keyboardShouldPersistTaps="handled"
      >
        {nodes.length === 0 && emptyState ? <View style={styles.empty}>{emptyState}</View> : null}
        {nodes}
      </ScrollView>
    </TreeContext.Provider>
  );
}

export interface TreeItemProps {
  /** Identity of the node in the selection, `expandedKeys`, `disabledKeys` and `onAction`. */
  id: Key;
  /** Plain text of the node, used as its accessible name. */
  textValue: string;
  /** Visible text of the row. */
  title: ReactNode;
  /** Right-aligned slot, for a count or a Badge. */
  trailing?: ReactNode;
  isDisabled?: boolean;
  /** Overrides the tree's `onAction` for this node. */
  onAction?: () => void;
  /** Whether the node can expand when its children are not given yet. Overrides the count. */
  hasChildItems?: boolean;
  testID?: string;
  /** Nested `TreeItem`s. `false`, `null` and empty arrays do not count as children. */
  children?: ReactNode;
}

/**
 * One node of a `Tree`. A node with children shows an expand / collapse chevron and reports
 * `aria-expanded`. Pressing a node that has no action and no selection expands it. A pressable
 * row is one accessibility element named by `textValue`.
 */
export function TreeItem({
  id,
  textValue,
  title,
  trailing,
  isDisabled = false,
  onAction,
  hasChildItems,
  testID,
  children,
}: TreeItemProps) {
  const { theme } = useUnistyles();
  const tree = useContext(TreeContext);
  const level = useContext(LevelContext);
  const mode = tree?.selection.mode ?? "none";
  const selected = tree?.selection.isSelected(id) ?? false;
  const disabled = isDisabled || (tree?.selection.isDisabled(id) ?? false);
  const expandable = hasChildItems ?? Children.toArray(children).length > 0;
  const isExpanded = expandable && (tree?.expanded.has(id) ?? false);
  const action = onAction ?? (tree?.onAction ? () => tree.onAction?.(id) : undefined);
  const hasOwnPress = action !== undefined || mode !== "none";
  styles.useVariants({ selected, disabled });

  const expand = () => tree?.toggleExpanded(id);
  const press = () => {
    if (action) action();
    else if (mode !== "none") tree?.selection.toggle(id);
    else expand();
  };

  const label =
    typeof title === "string" || typeof title === "number" ? (
      <Text numberOfLines={1} style={styles.title}>
        {title}
      </Text>
    ) : (
      <Content textStyle={styles.title} iconSize={styles.icon.width}>
        {title}
      </Content>
    );
  const body = (
    <>
      <View style={styles.titleSlot}>{label}</View>
      {trailing ? (
        <View style={styles.trailing}>
          <Content textStyle={styles.trailingText} iconSize={styles.icon.width}>
            {trailing}
          </Content>
        </View>
      ) : null}
      {selected ? (
        <View aria-hidden importantForAccessibility="no-hide-descendants">
          <Check
            size={theme.scale.component.icon.size.S}
            color={theme.color.text.primary}
            strokeWidth={theme.icon["stroke-width"]}
          />
        </View>
      ) : null}
    </>
  );

  const treeItemProps = {
    role: "treeitem",
    "aria-label": textValue,
    "aria-expanded": expandable ? isExpanded : undefined,
    "aria-selected": mode === "none" ? undefined : selected,
    "aria-disabled": disabled,
  } as const;

  return (
    <>
      <View style={styles.row(level)}>
        {expandable ? (
          <Pressable
            role={hasOwnPress ? "button" : undefined}
            aria-label={hasOwnPress ? textValue : undefined}
            aria-expanded={hasOwnPress ? isExpanded : undefined}
            accessible={hasOwnPress}
            importantForAccessibility={hasOwnPress ? "yes" : "no"}
            disabled={disabled}
            testID={testID ? `${testID}-chevron` : undefined}
            onPress={expand}
            style={styles.chevron}
          >
            <View style={styles.chevronIcon(isExpanded)}>
              <ChevronRight
                size={theme.scale.component.icon.size.S}
                color={theme.color.text.secondary}
                strokeWidth={theme.icon["stroke-width"]}
              />
            </View>
          </Pressable>
        ) : (
          <View style={styles.chevronSpacer} />
        )}
        {hasOwnPress || expandable ? (
          <Pressable
            {...treeItemProps}
            disabled={disabled}
            testID={testID}
            onPress={press}
            style={({ pressed }) => styles.main(pressed)}
          >
            {body}
          </Pressable>
        ) : (
          <View accessible {...treeItemProps} testID={testID} style={styles.main(false)}>
            {body}
          </View>
        )}
      </View>
      {isExpanded ? (
        <LevelContext.Provider value={level + 1}>
          <View role="group">{children}</View>
        </LevelContext.Provider>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => {
  const targetMin = theme.scale.component["target-min"];
  return {
    tree: { gap: theme.density.compact["list-gap"] },
    row: (level: number) => ({
      flexDirection: "row",
      alignItems: "center",
      minHeight: targetMin,
      paddingRight: theme.space["100"],
      paddingLeft: theme.space["100"] + (level - 1) * theme.space["400"],
      borderRadius: theme.radius.control,
      variants: {
        selected: { true: { backgroundColor: theme.color.surface.selected }, false: {} },
        disabled: { true: {}, false: {} },
      },
    }),
    chevron: {
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      width: targetMin,
      height: targetMin,
    },
    chevronSpacer: { flexShrink: 0, width: targetMin },
    chevronIcon: (expanded: boolean) => ({
      // A static quarter turn: the tree does not animate, so reduced motion needs no branch.
      transform: [{ rotate: expanded ? "90deg" : "0deg" }],
    }),
    main: (pressed: boolean) => ({
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: theme.space["75"],
      minHeight: targetMin,
      borderRadius: theme.radius.control,
      backgroundColor: pressed ? theme.color.surface.hover : "transparent",
    }),
    titleSlot: { flex: 1, minWidth: 0 },
    title: {
      ...fontStyle(theme, "body-sm"),
      color: theme.color.text.primary,
      variants: { disabled: { true: { color: theme.color.text.disabled }, false: {} } },
    },
    trailing: { flexShrink: 0 },
    trailingText: { ...fontStyle(theme, "body-sm"), color: theme.color.text.secondary },
    icon: { width: theme.scale.component.icon.size.S },
    empty: { padding: theme.space["400"], alignItems: "center" },
  };
});
