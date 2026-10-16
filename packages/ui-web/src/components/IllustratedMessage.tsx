import type { IllustratedMessageSize } from "@moonx/ui-tokens";
import { createElement, type ReactNode } from "react";
import * as styles from "./IllustratedMessage.css";

export interface IllustratedMessageProps {
  /** A Lucide icon; moonx draws no illustrations (design-spec 4.5). */
  icon: ReactNode;
  heading: ReactNode;
  /** The heading's level in the page outline. @default 2 */
  headingLevel?: 1 | 2 | 3 | 4;
  /** One or two lines on what the place is for, or what to do next (6.0.6). */
  children?: ReactNode;
  /** The first action, such as a Button or a Link to the dashboard. */
  actions?: ReactNode;
  /** @default "M" */
  size?: IllustratedMessageSize;
}

/**
 * The empty, no-results, no-access and not-found states (design-spec 4.5・6.0.6): an icon,
 * a heading and a short explanation in the place of the content.
 */
export function IllustratedMessage({
  icon,
  heading,
  headingLevel = 2,
  children,
  actions,
  size = "M",
}: IllustratedMessageProps) {
  return (
    <div className={styles.root}>
      <span className={styles.icon[size]} aria-hidden="true">
        {icon}
      </span>
      {createElement(
        `h${headingLevel}`,
        { className: styles.heading[size] },
        heading,
      )}
      {children !== undefined && (
        <p className={styles.description[size]}>{children}</p>
      )}
      {actions !== undefined && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
