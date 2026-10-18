import { vars } from "@moonx/ui-tokens";
import {
  createVar,
  keyframes,
  style,
  styleVariants,
} from "@vanilla-extract/css";
import { reducedMotion } from "../styles/helpers";

const spin = keyframes({
  from: { transform: "rotate(-90deg)" },
  to: { transform: "rotate(270deg)" },
});

const thicknessVar = createVar();

export const root = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.control.trackFill,
});

/** Diameter and ring width of each size (06 component.progress-circle). */
export const size = styleVariants(
  vars.scale.component.progressCircle.size,
  (diameter, key) => ({
    width: diameter,
    height: diameter,
    vars: {
      [thicknessVar]: vars.scale.component.progressCircle.thickness[key],
    },
  }),
);

// The svg has no viewBox, so the ring is drawn in CSS pixels: the radius leaves half the
// ring's width inside the box, and the width is the token as it is.
export const svg = style({
  display: "block",
  width: "100%",
  height: "100%",
  transform: "rotate(-90deg)",
});

const ring = {
  cx: "50%",
  cy: "50%",
  r: `calc(50% - ${thicknessVar} / 2)`,
  fill: "none",
  strokeWidth: thicknessVar,
} as const;

export const track = style({ ...ring, stroke: vars.color.control.track });

export const fill = style({
  ...ring,
  stroke: "currentColor",
  strokeLinecap: "round",
});

/**
 * The arc that turns without a value (06 progress-circle.indeterminate-arc), in the
 * hundredths of the ring its `pathLength` sets.
 */
export const indeterminateFill = style({
  strokeDasharray: `calc(${vars.scale.component.progressCircle.indeterminateArc} * 100) 100`,
});

export const indeterminate = style({
  animation: `${spin} ${vars.motion.loop.spin} linear infinite`,
  // Movement stops (06 motion.reduced): the arc stays still; React Aria still tells
  // screen readers the work goes on.
  "@media": { [reducedMotion]: { animation: "none" } },
});

/** Inside a Button the circle takes the button's text colour and drops the track. */
export const onControl = style({ color: "currentColor" });
export const noTrack = style({ display: "none" });
