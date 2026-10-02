import type { CardViewColumns } from "@moonx/ui-tokens";
import { GridList, type GridListProps } from "react-aria-components";
import { cardView } from "./CardView.css";

export interface CardViewProps<T extends object>
  extends Omit<
    GridListProps<T>,
    "className" | "style" | "layout" | "dragAndDropHooks" | "aria-label" | "aria-labelledby"
  > {
  /** Required: the name of the group of cards, e.g. "Competitors". */
  "aria-label": string;
  /** One to three columns; narrow screens always show one. */
  columns?: CardViewColumns;
}

/** A grid of `Card`s with arrow-key navigation in both directions and optional selection. */
export function CardView<T extends object>({ columns = 1, ...props }: CardViewProps<T>) {
  return <GridList {...props} layout="grid" className={cardView({ columns })} />;
}
