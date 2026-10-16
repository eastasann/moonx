import type { ReactNode } from "react";
import * as styles from "./patterns.css";

export interface PublicPatternProps {
  /** The top bar: the name of the app and Sign in. */
  header?: ReactNode;
  /**
   * The page's sections, one under another. Two-column parts (the hero) are the
   * screen's Grid, one column when the width runs out.
   */
  children: ReactNode;
  /** The foot: the links to 29 and 30. */
  footer?: ReactNode;
}

/**
 * Pattern J, public page (design-spec 4.1): pages that present the app (1, 29, 30). One
 * long column at every width, with a top bar and a foot.
 */
export function PublicPattern({
  header,
  children,
  footer,
}: PublicPatternProps) {
  return (
    <div className={styles.root}>
      {header != null && <div className={styles.publicBar}>{header}</div>}
      <div className={styles.page({ width: "content", density: "spacious" })}>
        {children}
      </div>
      {footer != null && <div className={styles.publicFooter}>{footer}</div>}
    </div>
  );
}
