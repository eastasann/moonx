import { keyframes, style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const slideUp = keyframes({ from: { transform: "translateY(100%)" }, to: { transform: "none" } });
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

export const popover = style({
  background: vars.color.surface.overlay,
  color: vars.color.text.primary,
  border: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.card,
  boxShadow: vars.shadow.overlay,
  minWidth: "var(--trigger-width)",
  maxHeight: `min(var(--visual-viewport-height, 100dvh), ${vars.layout["popover-max-height"]})`,
  overflow: "auto",
  outline: "none",
  selectors: { "&[data-focus-visible]": focusRing },
});

export const trayOverlay = style({
  position: "fixed",
  inset: 0,
  zIndex: vars.layout["z-index"].overlay,
  background: vars.color.surface.scrim,
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  selectors: {
    "&[data-entering]": { animation: `${fadeIn} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${fadeIn} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
});

export const tray = style({
  width: "100%",
  maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
  overflow: "auto",
  background: vars.color.surface.overlay,
  color: vars.color.text.primary,
  borderStartStartRadius: vars.radius.sheet,
  borderStartEndRadius: vars.radius.sheet,
  boxShadow: vars.shadow.overlay,
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  outline: "none",
  selectors: {
    "&[data-entering]": { animation: `${slideUp} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${slideUp} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
});
