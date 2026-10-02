import { keyframes, style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;

const slideUp = keyframes({ from: { transform: "translateY(100%)" }, to: { transform: "none" } });
const slideIn = keyframes({ from: { transform: "translateX(100%)" }, to: { transform: "none" } });
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const surface = {
  display: "flex",
  flexDirection: "column",
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  outline: "none",
} as const;

export const side = style({
  ...surface,
  flexShrink: 0,
  alignSelf: "flex-start",
  // Stays in view while a long page scrolls beside it.
  position: "sticky",
  insetBlockStart: 0,
  width: vars.layout["side-panel-width"],
  height: "100dvh",
  borderInlineStart: hairline,
});

export const overlayBackdrop = style({
  position: "fixed",
  inset: 0,
  zIndex: vars.layout["z-index"].overlay,
  background: vars.color.surface.scrim,
  display: "flex",
  justifyContent: "flex-end",
  alignItems: "stretch",
  selectors: {
    "&[data-entering]": { animation: `${fadeIn} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${fadeIn} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
});

export const trayBackdrop = style({
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

export const drawer = style({
  ...surface,
  width: vars.layout["side-panel-width"],
  maxWidth: "100%",
  boxShadow: vars.shadow.overlay,
  selectors: {
    "&[data-entering]": { animation: `${slideIn} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${slideIn} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
});

export const tray = style({
  ...surface,
  width: "100%",
  maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
  borderStartStartRadius: vars.radius.sheet,
  borderStartEndRadius: vars.radius.sheet,
  boxShadow: vars.shadow.overlay,
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  selectors: {
    "&[data-entering]": { animation: `${slideUp} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${slideUp} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
});

export const dialog = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  flex: 1,
  outline: "none",
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["100"],
  minHeight: vars.layout["header-height"],
  paddingInline: vars.density.regular["panel-padding"],
  borderBlockEnd: hairline,
});

export const title = style({
  margin: 0,
  fontFamily: vars.typography["heading-4"].fontFamily,
  fontSize: vars.typography["heading-4"].fontSize,
  fontWeight: vars.typography["heading-4"].fontWeight,
  lineHeight: vars.typography["heading-4"].lineHeight,
  letterSpacing: vars.typography["heading-4"].letterSpacing,
});

export const close = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
  padding: 0,
  border: "none",
  borderRadius: vars.radius.control,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover, color: vars.color.text.primary },
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-focus-visible]": focusRing,
  },
});

export const closeIcon = style({
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  padding: vars.density.regular["panel-padding"],
});

export const footer = style({
  padding: vars.density.regular["panel-padding"],
  borderBlockStart: hairline,
});
