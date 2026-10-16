import type { ProgressCircleSize } from "@moonx/ui-tokens";
import { ProgressBar } from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "./ProgressCircle.css";

export interface ProgressCircleProps {
  /** @default "M" */
  size?: ProgressCircleSize;
  /** Progress between `minValue` and `maxValue`. Ignored while indeterminate. */
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** Spins without a value ("Preparing PDF…", a pending Button). */
  isIndeterminate?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

// pathLength="100" lets the dash pattern be written in percent of the ring.
function Circle({
  percentage,
  isIndeterminate,
  inherit,
}: {
  percentage: number | undefined;
  isIndeterminate: boolean;
  inherit: boolean;
}) {
  const shown = isIndeterminate ? 25 : (percentage ?? 0);
  return (
    <svg
      aria-hidden="true"
      className={`${styles.svg} ${isIndeterminate ? styles.indeterminate : ""}`}
    >
      <circle className={`${styles.track} ${inherit ? styles.noTrack : ""}`} />
      <circle
        pathLength={100}
        strokeDasharray={`${shown} 100`}
        className={styles.fill}
      />
    </svg>
  );
}

/** A circular progress indicator (design-spec 4.5). */
export function ProgressCircle({
  size = "M",
  isIndeterminate = false,
  ...props
}: ProgressCircleProps) {
  return (
    <FixedLocale>
      <ProgressBar
        {...props}
        isIndeterminate={isIndeterminate}
        className={`${styles.root} ${styles.size[size]}`}
      >
        {({ percentage }) => (
          <Circle
            percentage={percentage}
            isIndeterminate={isIndeterminate}
            inherit={false}
          />
        )}
      </ProgressBar>
    </FixedLocale>
  );
}

/**
 * The indeterminate circle a pending Button shows, in the button's text colour and
 * without the track. The Button announces the pending state, so this one is hidden.
 */
export function PendingCircle() {
  return (
    <span
      aria-hidden="true"
      className={`${styles.root} ${styles.onControl} ${styles.size.S}`}
    >
      <Circle percentage={undefined} isIndeterminate inherit />
    </span>
  );
}
