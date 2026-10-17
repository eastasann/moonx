import type { ReactNode } from "react";
import { Density } from "../internal/Density";
import { BottomBar } from "../internal/frame";
import * as styles from "./patterns.css";

export interface FocusPatternProps {
  /** The title of the one decision or form ("Record a decision", "Log in"). */
  header: ReactNode;
  /**
   * The material to decide on first, then the fields (4.1 B: material above, input
   * below), each a child, apart by the section's gap.
   */
  children: ReactNode;
  /**
   * The main action, and a quiet Cancel before it: at the end under the fields, fixed to
   * the bottom on a phone, where they share the bar's width equally (4.3,
   * s19-decision.html .formbar).
   */
  actions?: ReactNode;
}

/**
 * Pattern B, focused (design-spec 4.1, s19-decision.html): one decision or one form (2,
 * 19). One column of the form's width at every width; on a phone the actions are fixed
 * to the bottom.
 */
export function FocusPattern({ header, children, actions }: FocusPatternProps) {
  return (
    <Density density="spacious">
      <div className={styles.root}>
        <div className={styles.focusPage({ hasActionRow: actions != null })}>
          <div className={styles.focusHeader}>{header}</div>
          <div className={styles.focusContent}>{children}</div>
        </div>
        {actions != null && (
          <BottomBar isPhoneOnly isShared column="form">
            {actions}
          </BottomBar>
        )}
      </div>
    </Density>
  );
}
