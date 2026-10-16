import type { BadgeFillStyle, BadgeVariant, Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import * as styles from "./Badge.css";

interface BadgeBaseProps {
  /** @default "S" */
  size?: Size;
  /** The label: a few words or a count. */
  children: ReactNode;
}

interface NeutralBadgeProps extends BadgeBaseProps {
  /** @default "neutral" */
  variant?: Extract<BadgeVariant, "neutral">;
  /**
   * `outline`: the uncoloured frame (Proceed / Hold / Drop, stages, "Lump sum").
   * `dashed`: Undecided. `bold`: the ink fill of an unread count (formatCount).
   * @default "outline"
   */
  fillStyle?: BadgeFillStyle;
}

interface NoticeBadgeProps extends BadgeBaseProps {
  /** The amber text of "Overdue" and "overdue 3d" (design-spec 4.5), in the outline frame. */
  variant: Extract<BadgeVariant, "notice">;
  fillStyle?: "outline";
}

export type BadgeProps = NeutralBadgeProps | NoticeBadgeProps;

/**
 * A short label of a state or a count, in a frame (design-spec 4.5). There is no red
 * badge: Drop is not negative.
 */
export function Badge({
  variant = "neutral",
  fillStyle = "outline",
  size = "S",
  children,
}: BadgeProps) {
  return (
    <span className={styles.badge({ variant, fillStyle, size })}>
      <span className={styles.label}>{children}</span>
    </span>
  );
}
