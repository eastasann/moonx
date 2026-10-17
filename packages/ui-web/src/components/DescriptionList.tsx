import { type ReactNode, useContext } from "react";
import { DensityContext } from "../internal/Density";
import * as styles from "./DescriptionList.css";

export interface DescriptionListProps {
  /**
   * `DescriptionListItem`s. A list has no role to carry a name: the block's heading or the
   * region around it names it.
   */
  children: ReactNode;
}

/**
 * Labels and their values side by side, divided by hairlines (13・19's Summary,
 * design-spec 4.5; d1-moon.html and s19-decision.html): the labels in a column of their
 * own, wider in a spacious pattern (19's); on a phone each label sits above its value.
 */
export function DescriptionList({ children }: DescriptionListProps) {
  const density = useContext(DensityContext);
  return (
    <dl className={styles.list({ isSpacious: density === "spacious" })}>
      {children}
    </dl>
  );
}

export interface DescriptionListItemProps {
  /** The value's name ("Customer", "Market type"). */
  label: ReactNode;
  /** The value: text, or a placeholder in a quieter tone ("Empty"). */
  children: ReactNode;
}

/** One label and its value in a DescriptionList. */
export function DescriptionListItem({
  label,
  children,
}: DescriptionListItemProps) {
  return (
    <div className={styles.item}>
      <dt className={styles.label}>{label}</dt>
      <dd className={styles.value}>{children}</dd>
    </div>
  );
}
