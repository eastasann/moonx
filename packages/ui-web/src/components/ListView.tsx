import type { Density, TableLayout } from "@moonx/ui-tokens";
import { ChevronRight } from "lucide-react";
import {
  createContext,
  type ReactElement,
  type ReactNode,
  useContext,
} from "react";
import {
  GridList,
  GridListItem,
  type GridListItemProps,
  type Key,
  type Selection,
} from "react-aria-components";
import { ListPaneContext } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./ListView.css";

const ItemContext = createContext({ isActionable: false, isCard: false });

export interface ListViewProps<T extends object> {
  /** The items, for a list built from data; `children` then renders each. */
  items?: Iterable<T>;
  /** `ListViewItem`s, or a function from an item to its `ListViewItem`. */
  children: ReactNode | ((item: T) => ReactElement);
  /** Values the rendered items depend on beside `items`, so they render again when these change. */
  dependencies?: readonly unknown[];
  /** Pressing an item: open it. Its row then ends in ›. */
  onAction?: (key: Key) => void;
  /** `single` keeps one item chosen, as a list beside its detail does (pattern D). */
  selectionMode?: "none" | "single";
  selectedKeys?: Iterable<Key>;
  onSelectionChange?: (keys: Set<Key>) => void;
  /** Shown in place of the items when there are none. */
  renderEmptyState?: () => ReactNode;
  /** @default "regular" */
  density?: Density;
  /**
   * TableView's layouts, for a list: `auto` and `table` are rows divided by hairlines at
   * every width (a phone's full-screen list, design-spec 4.5); `cards` frames each item.
   * @default "auto"
   */
  layout?: TableLayout;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/**
 * A list of things to open or manage (6・14・8・22・9・12・26, design-spec 4.5): one row per
 * item, the arrow keys moving between them.
 */
export function ListView<T extends object>({
  density = "regular",
  layout = "auto",
  selectionMode = "none",
  onSelectionChange,
  renderEmptyState,
  ...props
}: ListViewProps<T>) {
  const isCard = layout === "cards";
  const inPane = useContext(ListPaneContext);
  return (
    <ItemContext.Provider
      value={{
        isActionable: props.onAction !== undefined || selectionMode !== "none",
        isCard,
      }}
    >
      <GridList
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
        renderEmptyState={
          renderEmptyState
            ? () => <div className={styles.empty}>{renderEmptyState()}</div>
            : undefined
        }
        className={`${styles.list({ isCard })} ${styles.density[density]}${
          inPane ? ` ${styles.inPane}` : ""
        }`}
      />
    </ItemContext.Provider>
  );
}

export interface ListViewItemProps
  extends Pick<GridListItemProps, "href" | "routerOptions" | "isDisabled"> {
  id: Key;
  /** The item's text, for screen readers and typing to find it. */
  textValue: string;
  /** The row's content: lines of Text, a StatusLight, a Badge, CheckDots. */
  children: ReactNode;
}

/** An item of a ListView. With an `href`, or a list that acts, the whole row presses. */
export function ListViewItem({ children, ...props }: ListViewItemProps) {
  const list = useContext(ItemContext);
  const isActionable = list.isActionable || props.href !== undefined;
  return (
    <GridListItem
      {...props}
      className={styles.item({ isActionable, isCard: list.isCard })}
    >
      <div className={styles.content}>{children}</div>
      {isActionable && (
        <span className={styles.chevron}>
          <IconSlot size="S">
            <ChevronRight />
          </IconSlot>
        </span>
      )}
    </GridListItem>
  );
}
