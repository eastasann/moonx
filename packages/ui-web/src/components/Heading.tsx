import type { HeadingVariant } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { Heading as AriaHeading } from "react-aria-components";
import * as styles from "./typography.css";

export interface HeadingProps {
  /** The heading level in the page outline: h1 to h4. */
  level: 1 | 2 | 3 | 4;
  /**
   * The look, when it differs from the level's: `display` is the landing title, `label`
   * the small heading of a block (Next steps, Checks, Totals).
   */
  variant?: HeadingVariant;
  id?: string;
  /** Lets a surrounding component (a Dialog) take the heading as its title. */
  slot?: string;
  children: ReactNode;
}

/** A heading in the body face, set heavier and tighter (design-spec 4.4). */
export function Heading({ level, variant, children, ...props }: HeadingProps) {
  return (
    <AriaHeading
      {...props}
      level={level}
      className={styles.heading({ style: variant ?? level })}
    >
      {children}
    </AriaHeading>
  );
}
