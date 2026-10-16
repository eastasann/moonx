import type { ReactNode } from "react";
import { BottomBar } from "../internal/frame";
import * as styles from "./patterns.css";

export interface StepsPatternProps {
  /** The procedure's title ("Import from AI"). */
  header?: ReactNode;
  /** The `Steps`: 1 → 2 → 3, above the step's content. */
  steps: ReactNode;
  /** The current step's content. */
  children?: ReactNode;
  /**
   * The diff check's two sides (25 ③): side by side on tablet and wider, one above the
   * other on a phone. The page widens to the content's width for them.
   */
  comparison?: { before: ReactNode; after: ReactNode };
  /**
   * The step's buttons (Back, Next, Apply n changes): at the end under the content,
   * fixed to the bottom on a phone (4.3, 6.7).
   */
  actions?: ReactNode;
}

/**
 * Pattern G, steps (design-spec 4.1): a fixed procedure, one step after another (3, 24,
 * 25). The steps on top, the current one's content in the column under them; only the
 * diff check has two columns, stacked on a phone.
 */
export function StepsPattern({
  header,
  steps,
  children,
  comparison,
  actions,
}: StepsPatternProps) {
  const width = comparison === undefined ? "reading" : "content";
  return (
    <div className={styles.root}>
      <div className={styles.page({ width, density: "spacious" })}>
        {header}
        {steps}
        {children}
        {comparison !== undefined && (
          <div className={styles.comparison}>
            <div className={styles.comparisonSide}>{comparison.before}</div>
            <div className={styles.comparisonSide}>{comparison.after}</div>
          </div>
        )}
      </div>
      {actions != null && (
        <BottomBar isPhoneOnly width={width}>
          {actions}
        </BottomBar>
      )}
    </div>
  );
}
