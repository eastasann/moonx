import type { LinkVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  Link as AriaLink,
  type LinkProps as AriaLinkProps,
} from "react-aria-components";
import * as styles from "./Link.css";

export interface LinkProps
  extends Pick<
    AriaLinkProps,
    | "href"
    | "routerOptions"
    | "target"
    | "rel"
    | "onPress"
    | "isDisabled"
    | "aria-label"
    | "id"
  > {
  /**
   * `primary`: on its own line ("Edit in validation", "See all decisions"), with the
   * minimum target. `secondary`: inside running text (29・30, hints, EXAMPLE), wrapping
   * with it (design-spec 4.5).
   * @default "primary"
   */
  variant?: LinkVariant;
  /**
   * Without the underline until hovered (Spectrum 2's quiet link): the footer's Privacy
   * Policy and Support (s01-landing.html), where the row says they are links.
   */
  isQuiet?: boolean;
  children: ReactNode;
}

/**
 * A link. An `href` inside the app moves through the app's router (`RouterProvider`,
 * design-spec 4.5).
 */
export function Link({
  variant = "primary",
  isQuiet = false,
  children,
  ...props
}: LinkProps) {
  return (
    <AriaLink {...props} className={styles.link({ variant, isQuiet })}>
      {children}
    </AriaLink>
  );
}
