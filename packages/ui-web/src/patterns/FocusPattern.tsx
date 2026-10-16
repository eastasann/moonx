import type { ReactNode } from "react";
import { BottomBar } from "../internal/frame";
import * as styles from "./patterns.css";

export interface FocusPatternProps {
  /** The title of the one decision or form ("Decide on Piaya Gift Box", "Sign in"). */
  header: ReactNode;
  /** The material to decide on first, then the fields (4.1 B: material above, input below). */
  children: ReactNode;
  /** The one main action: under the fields, fixed to the bottom on a phone. */
  primaryAction?: ReactNode;
}

/**
 * Pattern B, focused (design-spec 4.1): one decision or one form (2, 19). One column of
 * reading width at every width; on a phone the main action is fixed to the bottom.
 */
export function FocusPattern({
  header,
  children,
  primaryAction,
}: FocusPatternProps) {
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "reading", density: "spacious" })}>
        {header}
        {children}
      </div>
      {primaryAction != null && (
        <BottomBar isPhoneOnly>{primaryAction}</BottomBar>
      )}
    </div>
  );
}
