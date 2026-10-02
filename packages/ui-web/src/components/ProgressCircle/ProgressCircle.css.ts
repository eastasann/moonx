import { keyframes, style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const spin = keyframes({ to: { transform: "rotate(360deg)" } });

export const progressCircle = recipe({
  base: { display: "inline-block", flexShrink: 0 },
  variants: {
    size: {
      S: { width: vars.space["300"], height: vars.space["300"] },
      M: { width: vars.space["500"], height: vars.space["500"] },
      L: { width: vars.space["800"], height: vars.space["800"] },
    },
  },
  defaultVariants: { size: "M" },
});

export const svg = style({ display: "block", width: "100%", height: "100%" });

export const track = style({ fill: "none", stroke: vars.color.control.track });

export const arc = style({
  fill: "none",
  stroke: vars.color.control["track-fill"],
  strokeLinecap: "round",
  transformOrigin: "center",
  transform: "rotate(-90deg)",
  transition: `stroke-dasharray ${vars.motion.transition.expand}`,
  "@media": { [reducedMotion]: { transition: "none" } },
});

/**
 * Keeps spinning under reduced motion: the rotation is the only signal that work is in progress,
 * and a frozen arc would read as a stalled value.
 */
export const spinning = style({
  transformOrigin: "center",
  animation: `${spin} ${vars.motion.loop.spin} linear infinite`,
});

export type ProgressCircleVariants = NonNullable<RecipeVariants<typeof progressCircle>>;
