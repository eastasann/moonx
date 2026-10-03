import type { ComponentSize } from "@moonx/ui-tokens";
import { Link as AriaLink, type LinkProps as AriaLinkProps } from "react-aria-components";
import { link } from "./Link.css";

export interface LinkProps extends Omit<AriaLinkProps, "className" | "style"> {
  /**
   * `primary` is a link on its own line or in a list and keeps the minimum tap target.
   * `secondary` is for links inside running text that should not draw the eye; it flows with the
   * text and is exempt from the target size.
   */
  variant?: "primary" | "secondary";
  /** Sets the text size. Without it the link takes the size of the text around it. */
  size?: ComponentSize;
}

/** Renders an `<a>` when `href` is given and a focusable `role="link"` span otherwise. */
export function Link({ variant = "primary", size, ...props }: LinkProps) {
  return <AriaLink {...props} className={link({ variant, size })} />;
}
