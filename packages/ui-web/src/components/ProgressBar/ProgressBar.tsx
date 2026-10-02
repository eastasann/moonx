import type { ComponentSize } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { ProgressBar as AriaProgressBar, Label } from "react-aria-components";
import { fill, fillIndeterminate, header, progressBar, track, valueLabel } from "./ProgressBar.css";

export interface ProgressBarProps {
  /** What is in progress, e.g. "Preparing PDF…". Shown above the bar and used as its name. */
  label: ReactNode;
  /** The value text, e.g. "40%". Formatted by the screen with the i18n helpers; also the spoken value. */
  valueLabel?: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** For work whose progress is unknown. `value` is ignored. */
  isIndeterminate?: boolean;
  size?: ComponentSize;
}

export function ProgressBar({
  label,
  valueLabel: valueText,
  size = "M",
  ...props
}: ProgressBarProps) {
  return (
    <AriaProgressBar {...props} valueLabel={valueText} className={progressBar}>
      {({ percentage, isIndeterminate }) => (
        <>
          <div className={header}>
            <Label>{label}</Label>
            {valueText && !isIndeterminate ? <span className={valueLabel}>{valueText}</span> : null}
          </div>
          <div className={track({ size })}>
            <div
              className={isIndeterminate ? `${fill} ${fillIndeterminate}` : fill}
              style={isIndeterminate ? undefined : { width: `${percentage ?? 0}%` }}
            />
          </div>
        </>
      )}
    </AriaProgressBar>
  );
}
