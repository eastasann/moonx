import type { ReactNode } from "react";
import { BottomBar } from "../internal/frame";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

/**
 * A page's title and actions (patterns A and H): the tools beside the title, at the bottom
 * of its block, and the screen's main action at their end. A hub (`isActionFixed`) fixes
 * its main action to the bottom on a phone instead (4.1 A), by `MainActionBar`; the other
 * patterns keep it in place (4.3).
 */
export function PageHeader({
  header,
  actions,
  primaryAction,
  isActionFixed = false,
}: {
  header: ReactNode;
  actions?: ReactNode;
  primaryAction?: ReactNode;
  isActionFixed?: boolean;
}) {
  const isNarrow = useIsNarrow();
  const inHeader = isActionFixed && isNarrow ? undefined : primaryAction;
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

/** The phone's place for the hub's main action `PageHeader` leaves out: fixed to the bottom. */
export function MainActionBar({
  primaryAction,
}: {
  primaryAction?: ReactNode;
}) {
  const isNarrow = useIsNarrow();
  return isNarrow && primaryAction != null ? (
    <BottomBar>{primaryAction}</BottomBar>
  ) : null;
}
