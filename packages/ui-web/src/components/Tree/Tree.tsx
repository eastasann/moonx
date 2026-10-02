import { ChevronRight } from "lucide-react";
import { Children, type ReactNode } from "react";
import {
  Tree as AriaTree,
  TreeItem as AriaTreeItem,
  type TreeItemProps as AriaTreeItemProps,
  type TreeProps as AriaTreeProps,
  Button,
  TreeItemContent,
} from "react-aria-components";
import {
  chevron,
  chevronIcon,
  chevronSpacer,
  empty,
  item,
  title,
  trailing,
  tree,
} from "./Tree.css";

export interface TreeProps<T extends object>
  extends Omit<AriaTreeProps<T>, "className" | "style" | "renderEmptyState"> {
  "aria-label": string;
  /** Content for a tree with no nodes. */
  emptyState?: ReactNode;
}

/**
 * Expandable, keyboard-navigable tree (React Aria Tree) for the section and question outline in
 * the template editor (screen 27). Build nodes with `TreeItem`; nest items to add depth.
 */
export function Tree<T extends object>({ emptyState, ...props }: TreeProps<T>) {
  return (
    <AriaTree
      {...props}
      className={tree}
      renderEmptyState={emptyState ? () => <div className={empty}>{emptyState}</div> : undefined}
    />
  );
}

export interface TreeItemProps<T extends object = object>
  extends Omit<AriaTreeItemProps<T>, "className" | "style" | "children"> {
  /** Visible text of the row. `textValue` still supplies the accessible name and typeahead. */
  title: ReactNode;
  /** Right-aligned slot, for a count or a Badge. */
  trailing?: ReactNode;
  /** Nested `TreeItem`s, or a `Collection` of them when the children are dynamic. */
  children?: ReactNode;
}

/**
 * One node of a `Tree`. A node with children shows an expand / collapse chevron; `false`, `null`
 * and empty arrays do not count as children. `hasChildItems` overrides the count.
 */
export function TreeItem<T extends object = object>({
  title: label,
  trailing: trailingSlot,
  children,
  hasChildItems,
  ...props
}: TreeItemProps<T>) {
  const expandable = hasChildItems ?? Children.toArray(children).length > 0;
  return (
    <AriaTreeItem {...props} hasChildItems={expandable} className={item}>
      <TreeItemContent>
        {expandable ? (
          <Button slot="chevron" className={chevron}>
            <ChevronRight className={chevronIcon} aria-hidden />
          </Button>
        ) : (
          <span className={chevronSpacer} aria-hidden />
        )}
        <span className={title}>{label}</span>
        {trailingSlot ? <span className={trailing}>{trailingSlot}</span> : null}
      </TreeItemContent>
      {children}
    </AriaTreeItem>
  );
}
