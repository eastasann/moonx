import { i18n } from "@moonx/i18n";
import type { Density } from "@moonx/ui-tokens";
import { vars } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import {
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  type TreeItemProps as AriaTreeItemProps,
  Button,
  type Key,
  type Selection,
  TreeItemContent,
} from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./Tree.css";

/**
 * Whether pressing the tree's items opens something or shows it beside the tree: they
 * then end in ›.
 */
const OpensContext = createContext(false);

export interface TreeProps<T extends object> {
  /** The top items, for a tree built from data; `children` then renders each. */
  items?: Iterable<T>;
  /** `TreeItem`s, or a function from an item to its `TreeItem`. */
  children: ReactNode | ((item: T) => ReactElement);
  /** Values the rendered items depend on beside `items`. */
  dependencies?: readonly unknown[];
  expandedKeys?: Iterable<Key>;
  defaultExpandedKeys?: Iterable<Key>;
  onExpandedChange?: (keys: Set<Key>) => void;
  /** Pressing an item: open it in the detail beside the tree. */
  onAction?: (key: Key) => void;
  /** `single` keeps the opened item chosen (27's node being edited). */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  renderEmptyState?: () => ReactNode;
  /** @default "regular" */
  density?: Density;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * Sections and their questions (27, design-spec 4.5): ← and → close and open a branch,
 * ↑ and ↓ move between the visible items.
 */
export function Tree<T extends object>({
  density = "regular",
  selectionMode = "none",
  onSelectionChange,
  onExpandedChange,
  renderEmptyState,
  ...props
}: TreeProps<T>) {
  return (
    <OpensContext.Provider
      value={props.onAction !== undefined || selectionMode !== "none"}
    >
      <AriaTree
        {...props}
        selectionMode={selectionMode}
        onSelectionChange={
          onSelectionChange
            ? (selection: Selection) =>
                onSelectionChange(
                  selection === "all" ? new Set() : new Set(selection),
                )
            : undefined
        }
        onExpandedChange={
          onExpandedChange
            ? (keys) => onExpandedChange(new Set(keys))
            : undefined
        }
        renderEmptyState={
          renderEmptyState
            ? () => <div className={styles.empty}>{renderEmptyState()}</div>
            : undefined
        }
        className={`${styles.tree} ${styles.density[density]}`}
      />
    </OpensContext.Provider>
  );
}

export interface TreeItemProps
  extends Pick<AriaTreeItemProps, "href" | "routerOptions" | "isDisabled"> {
  id: Key;
  /** The item's text, for screen readers and typing to find it. */
  textValue: string;
  /** The row's content. */
  title: ReactNode;
  /** Nested `TreeItem`s. */
  children?: ReactNode;
}

/** An item of a Tree; its children are the branch under it. */
export function TreeItem({ title, children, ...props }: TreeItemProps) {
  const opens = useContext(OpensContext) || props.href !== undefined;
  return (
    <AriaTreeItem {...props} className={styles.item}>
      <TreeItemContent>
        {({ hasChildItems, isExpanded, level }) => (
          <div
            className={styles.row}
            // The indent is the item's depth, which only the tree knows as it renders.
            style={{
              paddingInlineStart: `calc(${level - 1} * ${vars.space["400"]})`,
            }}
          >
            {hasChildItems ? (
              <Button
                slot="chevron"
                aria-label={i18n.t(
                  isExpanded
                    ? "components:tree.collapse"
                    : "components:tree.expand",
                )}
                className={styles.chevron}
              >
                <IconSlot size="S">
                  <ChevronRight />
                </IconSlot>
              </Button>
            ) : (
              <span aria-hidden="true" className={styles.chevronSpace} />
            )}
            <span className={styles.title}>{title}</span>
            {opens && (
              <span className={styles.opens}>
                <IconSlot size="S">
                  <ChevronRight />
                </IconSlot>
              </span>
            )}
          </div>
        )}
      </TreeItemContent>
      {children}
    </AriaTreeItem>
  );
}
