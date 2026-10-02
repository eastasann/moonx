import { ProgressBar as AriaProgressBar } from "react-aria-components";
import { arc, progressCircle, spinning, svg, track } from "./ProgressCircle.css";

export interface ProgressCircleProps {
  /** Required: a circle has no visible label. */
  "aria-label": string;
  /** Spoken value, e.g. "40%". Formatted by the screen with the i18n helpers. */
  valueLabel?: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  /** For work whose progress is unknown, e.g. a sending button. `value` is ignored. */
  isIndeterminate?: boolean;
  size?: "S" | "M" | "L";
}

// Geometry of the SVG viewBox, not a style value: the drawn size follows the CSS box.
const VIEW = 32;
const STROKE = 4;
const RADIUS = (VIEW - STROKE) / 2;
const INDETERMINATE_ARC = 25;

export function ProgressCircle({ size = "M", ...props }: ProgressCircleProps) {
  return (
    <AriaProgressBar {...props} className={progressCircle({ size })}>
      {({ percentage, isIndeterminate }) => (
        <svg aria-hidden="true" className={svg} viewBox={`0 0 ${VIEW} ${VIEW}`}>
          <circle className={track} cx={VIEW / 2} cy={VIEW / 2} r={RADIUS} strokeWidth={STROKE} />
          <g className={isIndeterminate ? spinning : undefined}>
            <circle
              className={arc}
              cx={VIEW / 2}
              cy={VIEW / 2}
              r={RADIUS}
              strokeWidth={STROKE}
              pathLength={100}
              strokeDasharray={`${isIndeterminate ? INDETERMINATE_ARC : (percentage ?? 0)} 100`}
            />
          </g>
        </svg>
      )}
    </AriaProgressBar>
  );
}
