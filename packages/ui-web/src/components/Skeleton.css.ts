import { vars } from "@moonx/ui-tokens";
import { keyframes, style } from "@vanilla-extract/css";
import { reducedMotion } from "../styles/helpers";

// Between the track and the sunken surface, both theme colours, so the pulse stays
// within the palette in light and dark.
const pulse = keyframes({
  "0%, 100%": { background: vars.color.control.track },
  "50%": { background: vars.color.surface.sunken },
});

/** Leaves the layout to the children: the skeleton has no box of its own. */
export const root = style({ display: "contents" });

/**
 * Text while loading: the words keep their size and wrapping but show as bars of the
 * track colour, pulsing slowly (06 motion.loop.pulse); still when motion is reduced.
 */
export const text = style({
  color: "transparent",
  background: vars.color.control.track,
  borderRadius: vars.radius.chip,
  boxDecorationBreak: "clone",
  WebkitBoxDecorationBreak: "clone",
  userSelect: "none",
  animation: `${pulse} ${vars.motion.loop.pulse} ease-in-out infinite`,
  "@media": { [reducedMotion]: { animation: "none" } },
});
