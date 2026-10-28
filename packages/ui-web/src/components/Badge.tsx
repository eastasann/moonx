import type { BadgeFillStyle, BadgeVariant, Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { VisuallyHidden } from "react-aria-components";
import * as styles from "./Badge.css";

interface BadgeBaseProps {
  /** @default "S" */
  size?: Size;
  /** The label: a few words or a count. */
  children: ReactNode;
  /**
   * What a screen reader says in place of a label that is only a mark (20's "V" reads
   * "Uses your validation").
   */
  "aria-label"?: string;
}

interface NeutralBadgeProps extends BadgeBaseProps {
  /** @default "neutral" */
  variant?: Extract<BadgeVariant, "neutral">;
  /**
   * `outline`: the light frame (Proceed / Hold / Drop, stages, "Lump sum").
   * `dashed`: Undecided, in secondary text. `bold`: the small ink tag of an unread count
   * laid over an icon (formatCount), the same size at every `size`.
   * @default "outline"
   */
  fillStyle?: BadgeFillStyle;
}

interface NoticeBadgeProps extends BadgeBaseProps {
  /** The amber monospaced text of "Overdue" and "overdue 3d" (design-spec 4.5), without a frame. */
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
  "aria-label": label,
}: BadgeProps) {
  return (
    <span className={styles.badge({ variant, fillStyle, size })}>
      <span
        className={styles.label}
        aria-hidden={label === undefined ? undefined : true}
      >
        {children}
      </span>
      {label !== undefined && <VisuallyHidden>{label}</VisuallyHidden>}
    </span>
  );
}
