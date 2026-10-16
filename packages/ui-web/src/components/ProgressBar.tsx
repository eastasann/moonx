import { formatProgress } from "@moonx/i18n";
import type { Size } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { ProgressBar as AriaProgressBar, Label } from "react-aria-components";
import { FixedLocale } from "../internal/FixedLocale";
import * as styles from "./ProgressBar.css";

export interface ProgressBarProps {
  /** The task, shown above the bar ("Preparing PDF…"). */
  label?: ReactNode;
  /** @default "M" */
  size?: Size;
  /** Progress between `minValue` and `maxValue`. Ignored while indeterminate. */
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** Moves without a value, for work whose length is unknown. */
  isIndeterminate?: boolean;
  /** Shows the percentage at the end of the label's line. @default true when determinate */
  showValueLabel?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}

/** A horizontal progress indicator (design-spec 4.5). */
export function ProgressBar({
  label,
  size = "M",
  value = 0,
  minValue = 0,
  maxValue = 100,
  isIndeterminate = false,
  showValueLabel = !isIndeterminate,
  ...props
}: ProgressBarProps) {
  // The shared formatter's percentage replaces React Aria's, as ProgressCircle does
  // (SDD 9章「書式」). Clamped, and 0 for an empty range, as React Aria does.
  const range = maxValue - minValue;
  const fraction =
    range === 0
      ? 0
      : (Math.min(Math.max(value, minValue), maxValue) - minValue) / range;
  const valueLabel = isIndeterminate ? undefined : formatProgress(fraction);
  return (
    <FixedLocale>
      <AriaProgressBar
        {...props}
        value={value}
        minValue={minValue}
        maxValue={maxValue}
        valueLabel={valueLabel}
        isIndeterminate={isIndeterminate}
        className={`${styles.root({
          hasTextRow:
            label !== undefined || (showValueLabel && valueLabel !== undefined),
        })} ${styles.size[size]}`}
      >
        {label !== undefined && <Label className={styles.label}>{label}</Label>}
        {showValueLabel && valueLabel !== undefined && (
          <span className={styles.value}>{valueLabel}</span>
        )}
        <div className={styles.track[size]}>
          {isIndeterminate ? (
            <div className={styles.indeterminate} />
          ) : (
            <div
              className={styles.fill}
              // The fill's width is the progress itself, not a style the token set can hold.
              style={{ width: `${fraction * 100}%` }}
            />
          )}
        </div>
      </AriaProgressBar>
    </FixedLocale>
  );
}
