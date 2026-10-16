import { vars } from "@moonx/ui-tokens";
import { keyframes, style } from "@vanilla-extract/css";
import { reducedMotion, typography } from "../styles/helpers";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });

/**
 * The label in ink with the canvas colour on it, the pair a primary Button uses
 * (06 control.primary / on-primary). It wraps inside the window rather than past it.
 */
export const tooltip = style({
  ...typography("caption"),
  maxWidth: `calc(100vw - 2 * ${vars.layout.pageGutterMobile})`,
  paddingBlock: vars.space["75"],
  paddingInline: vars.space["100"],
  borderRadius: vars.radius.control,
  background: vars.color.control.primary,
  color: vars.color.control.onPrimary,
  zIndex: vars.layout.zIndex.overlay,
  overflowWrap: "break-word",
  selectors: {
    // React Aria places it touching the trigger; the gap is a token, so it moves by it.
    "&[data-placement=top]": { translate: `0 calc(-1 * ${vars.space["100"]})` },
    "&[data-placement=bottom]": { translate: `0 ${vars.space["100"]}` },
    "&[data-placement=left]": {
      translate: `calc(-1 * ${vars.space["100"]}) 0`,
    },
    "&[data-placement=right]": { translate: `${vars.space["100"]} 0` },
    "&[data-entering]": {
      animation: `${fadeIn} ${vars.motion.transition.hover.duration} ${vars.motion.transition.hover.timingFunction}`,
    },
    "&[data-exiting]": {
      animation: `${fadeOut} ${vars.motion.transition.hover.duration} ${vars.motion.transition.hover.timingFunction}`,
    },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": {
          animation: `${fadeIn} ${vars.motion.reduced.fade} linear`,
        },
        "&[data-exiting]": {
          animation: `${fadeOut} ${vars.motion.reduced.fade} linear`,
        },
      },
    },
  },
});

/**
 * Wraps the trigger without a box of its own, to hear a long touch on it. iOS would show
 * its own callout on a long press otherwise.
 */
export const touchTarget = style({
  display: "contents",
  WebkitTouchCallout: "none",
});
