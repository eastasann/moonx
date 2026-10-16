import type { ReactNode } from "react";
import { BottomBar } from "../internal/frame";
import * as styles from "./patterns.css";

/**
 * A page's title and actions (patterns A, E, H, I): the tools beside the title, and the
 * screen's main action at their end on tablet and wider. On a phone the main action is
 * fixed to the bottom instead (4.3, 4.5 Button), by `MainActionBar`.
 */
export function PageHeader({
  header,
  actions,
  primaryAction,
  isNarrow,
}: {
  header: ReactNode;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  isNarrow: boolean;
}) {
  const inHeader = isNarrow ? undefined : primaryAction;
  return (
    <div className={styles.headerRow}>
      <div className={styles.headerTitle}>{header}</div>
      {(actions != null || inHeader != null) && (
        <div className={styles.headerActions}>
          {actions}
          {inHeader}
        </div>
      )}
    </div>
  );
}

/** The phone's place for the main action `PageHeader` leaves out: fixed to the bottom. */
export function MainActionBar({
  primaryAction,
  isNarrow,
}: {
  primaryAction?: ReactNode;
  isNarrow: boolean;
}) {
  return isNarrow && primaryAction != null ? (
    <BottomBar>{primaryAction}</BottomBar>
  ) : null;
}
