import {
  Children,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

function hasText(children: ReactNode): boolean {
  return Children.toArray(children).some((child) => {
    if (typeof child === "string" || typeof child === "number") return true;
    if (isValidElement(child) && child.type === Fragment) {
      return hasText(
        (child as ReactElement<{ children?: ReactNode }>).props.children,
      );
    }
    return false;
  });
}

/**
 * Whether a button's content is an icon alone, which takes the tighter icon-only padding
 * (06 component.action-button.padding-icon-only). Such a button needs an `aria-label`.
 */
export const isIconOnly = (children: ReactNode) => !hasText(children);
