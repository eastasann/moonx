import type { Density } from "@moonx/ui-tokens";
import { Check } from "lucide-react";
import { createContext, type ReactNode, useContext } from "react";
import {
  Checkbox,
  GridList,
  GridListItem,
  type GridListItemProps,
  type GridListProps,
} from "react-aria-components";
import {
  checkbox,
  checkboxBox,
  checkboxIcon,
  empty,
  item,
  itemContent,
  list,
} from "./ListView.css";

const DensityContext = createContext<Density>("regular");

export interface ListViewProps<T extends object>
  extends Omit<GridListProps<T>, "className" | "style" | "renderEmptyState"> {
  "aria-label": string;
  /** Row height, padding and the gap between rows (design-spec 4.4). */
  density?: Density;
  /** Content for a list with no items, such as an IllustratedMessage. */
  emptyState?: ReactNode;
}

/**
 * Selectable, keyboard-navigable list (React Aria GridList). Used for ideas, research log,
 * notifications and the execution lists. Compose rows with `ListViewItem`.
 */
export function ListView<T extends object>({
  density = "regular",
  emptyState,
  ...props
}: ListViewProps<T>) {
  return (
    <DensityContext.Provider value={density}>
      <GridList
        {...props}
        className={list({ density })}
        renderEmptyState={emptyState ? () => <div className={empty}>{emptyState}</div> : undefined}
      />
    </DensityContext.Provider>
  );
}

export interface ListViewItemProps
  extends Omit<GridListItemProps, "className" | "style" | "children"> {
  /** Plain text of the row, used for typeahead and as its accessible name. */
  textValue: string;
  children: ReactNode;
}

/** One row of a `ListView`. With `selectionMode="multiple"` it shows a selection checkbox. */
export function ListViewItem({ children, ...props }: ListViewItemProps) {
  const density = useContext(DensityContext);
  return (
    <GridListItem {...props} className={item({ density })}>
      {({ selectionMode, selectionBehavior }) => (
        <>
          {selectionMode === "multiple" && selectionBehavior === "toggle" ? (
            <Checkbox slot="selection" className={checkbox}>
              {({ isSelected }) => (
                <span className={checkboxBox}>
                  {isSelected ? (
                    <Check className={checkboxIcon} aria-hidden strokeWidth={3} />
                  ) : null}
                </span>
              )}
            </Checkbox>
          ) : null}
          <div className={itemContent}>{children}</div>
        </>
      )}
    </GridListItem>
  );
}
