import { formatProgress } from "@moonx/i18n";
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
  return (
    <svg
      aria-hidden="true"
      className={`${styles.svg} ${isIndeterminate ? styles.indeterminate : ""}`}
    >
      <circle className={`${styles.track} ${inherit ? styles.noTrack : ""}`} />
      {isIndeterminate ? (
        <circle
          pathLength={100}
          className={`${styles.fill} ${styles.indeterminateFill}`}
        />
      ) : (
        <circle
          pathLength={100}
          strokeDasharray={`${percentage ?? 0} 100`}
          className={styles.fill}
        />
      )}
    </svg>
  );
}

/** A circular progress indicator (design-spec 4.5). */
export function ProgressCircle({
  size = "M",
  isIndeterminate = false,
  value = 0,
  minValue = 0,
  maxValue = 100,
  ...props
}: ProgressCircleProps) {
  // React Aria would read the percentage out in its own format; the shared formatter's
  // replaces it (SDD 9章「書式」). Clamped, and 0 for an empty range, as React Aria does.
  const range = maxValue - minValue;
  const fraction =
    range === 0
      ? 0
      : (Math.min(Math.max(value, minValue), maxValue) - minValue) / range;
  return (
    <FixedLocale>
      <ProgressBar
        {...props}
        value={value}
        minValue={minValue}
        maxValue={maxValue}
        valueLabel={isIndeterminate ? undefined : formatProgress(fraction)}
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
