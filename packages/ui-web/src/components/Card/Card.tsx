import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox, GridListItem, type GridListItemProps } from "react-aria-components";
import { card, check, checkbox, content } from "./Card.css";

export interface CardProps
  extends Omit<GridListItemProps, "className" | "style" | "children" | "value"> {
  /**
   * Plain text of the card, used for keyboard type-ahead and as the fallback name of the row.
   * Required because the content is arbitrary.
   */
  textValue: string;
  /** Pass `href` to make the whole card a link. Selection is set on the surrounding CardView. */
  children: ReactNode;
}

/**
 * A card in a CardView. It can be selected (the CardView's `selectionMode`) or be a link (`href`),
 * and a multiple-selection CardView shows a checkbox on every card.
 */
export function Card({ children, ...props }: CardProps) {
  return (
    <GridListItem {...props} className={card}>
      {({ selectionMode }) => (
        <>
          {selectionMode === "multiple" ? (
            <Checkbox slot="selection" className={checkbox}>
              {({ isSelected }) =>
                isSelected ? <Check aria-hidden="true" className={check} /> : null
              }
            </Checkbox>
          ) : null}
          <div className={content}>{children}</div>
        </>
      )}
    </GridListItem>
  );
}
