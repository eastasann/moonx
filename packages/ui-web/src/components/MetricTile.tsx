import type { MetricTileTone } from "@moonx/ui-tokens";
import { TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./MetricTile.css";

export interface MetricTileProps {
  /** The metric's name ("Startup cost", "Break-even"). */
  label: ReactNode;
  /** The formatted value ("₱169,500+", "6.9 / day"), or why there is none ("Needs price"). */
  value: string;
  /**
   * The value is not a number but "Empty" or a reason (design-spec 6.4「計算できない主要
   * 指標の表示」): it is set in the text size, quieter, and wraps between words.
   */
  isPlaceholder?: boolean;
  /** A line under the value: a reason, a warning, a link to the screen that fixes it. */
  supplement?: ReactNode;
  /**
   * `notice` marks the supplement as a warning (zero or negative contribution margin): amber
   * with a warning sign, not colour alone (design-spec 4.4).
   * @default "neutral"
   */
  supplementTone?: MetricTileTone;
}

/**
 * One key number (13・19, design-spec 4.5): its name, the number large in the monospaced
 * face, and an optional supplement, stacked. The screen lays the tiles out (a row on a
 * desktop, 2×2 on a phone).
 */
export function MetricTile({
  label,
  value,
  isPlaceholder = false,
  supplement,
  supplementTone = "neutral",
}: MetricTileProps) {
  return (
    <dl className={styles.tile}>
      <dt className={styles.label}>{label}</dt>
      <dd className={isPlaceholder ? styles.placeholder : styles.value}>
        {value}
      </dd>
      {supplement != null && (
        <dd className={styles.supplement[supplementTone]}>
          {supplementTone === "notice" && (
            <IconSlot size="XS">
              <TriangleAlert />
            </IconSlot>
          )}
          <span>{supplement}</span>
        </dd>
      )}
    </dl>
  );
}
