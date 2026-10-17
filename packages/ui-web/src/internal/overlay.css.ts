import { vars } from "@moonx/ui-tokens";
import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { reducedMotion } from "../styles/helpers";

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });
const riseIn = keyframes({
  from: { opacity: 0, transform: `translateY(${vars.space["100"]})` },
  to: { opacity: 1, transform: "translateY(0)" },
});
const slideUp = keyframes({
  from: { transform: "translateY(100%)" },
  to: { transform: "translateY(0)" },
});
const slideDown = keyframes({
  from: { transform: "translateY(0)" },
  to: { transform: "translateY(100%)" },
});

const enter = (name: string) =>
  `${name} ${vars.motion.transition.enter.duration} ${vars.motion.transition.enter.timingFunction}`;
const exit = (name: string) =>
  `${name} ${vars.motion.transition.exit.duration} ${vars.motion.transition.exit.timingFunction}`;
const reducedFade = (name: string) =>
  `${name} ${vars.motion.reduced.fade} linear`;

/**
 * A popover on tablet and wider: anchored to its trigger, at least as wide as it. Its
 * height cap is the Popover's `maxHeight` prop (`popoverMaxHeight`), which React Aria
 * writes inline after lowering it to the space the window has.
 */
export const popover = style({
  minWidth: "var(--trigger-width)",
  overflow: "auto",
  background: vars.color.surface.overlay,
  // The light frame of s17-costs.html's .pop (06 border.default).
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.card,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  outline: "none",
  zIndex: vars.layout.zIndex.overlay,
  selectors: {
    "&[data-entering]": { animation: enter(riseIn) },
    "&[data-exiting]": { animation: exit(fadeOut) },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": { animation: reducedFade(fadeIn) },
        "&[data-exiting]": { animation: reducedFade(fadeOut) },
      },
    },
  },
});

/**
 * The scrim behind a tray; the tray sits on its bottom edge. It is as tall as the visual
 * viewport, which React Aria measures into --visual-viewport-height: when the on-screen
 * keyboard opens, the tray rises above it instead of staying under it (design-spec 4.3).
 */
export const trayOverlay = style({
  position: "fixed",
  top: 0,
  left: 0,
  width: "100%",
  height: "var(--visual-viewport-height)",
  display: "flex",
  alignItems: "flex-end",
  justifyContent: "center",
  background: vars.color.surface.scrim,
  zIndex: vars.layout.zIndex.overlay,
  selectors: {
    "&[data-entering]": { animation: enter(fadeIn) },
    "&[data-exiting]": { animation: exit(fadeOut) },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": { animation: reducedFade(fadeIn) },
        "&[data-exiting]": { animation: reducedFade(fadeOut) },
      },
    },
  },
});

/**
 * A tray (bottom sheet) below `semantic.breakpoint.tablet`: full width, at most
 * `layout.sheet-max-height-ratio` of the visible height, its content scrolling, clear of
 * the home indicator.
 */
export const tray = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxHeight: `calc(${vars.layout.sheetMaxHeightRatio} * var(--visual-viewport-height))`,
  overflow: "auto",
  overscrollBehavior: "contain",
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  background: vars.color.surface.overlay,
  borderStartStartRadius: vars.radius.sheet,
  borderStartEndRadius: vars.radius.sheet,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  outline: "none",
  selectors: {
    "&[data-entering]": { animation: enter(slideUp) },
    "&[data-exiting]": { animation: exit(slideDown) },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": { animation: reducedFade(fadeIn) },
        "&[data-exiting]": { animation: reducedFade(fadeOut) },
      },
    },
  },
});

/** Content of a tray that is a dialog (DatePicker's calendar, ComboBox's search). */
export const trayDialog = style({
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
  outline: "none",
});

/** Content of a popover or tray that is a dialog (Popover, Tray): its own padding. */
export const popoverDialog = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.gap,
  minHeight: 0,
  padding: vars.density.regular.panelPadding,
  outline: "none",
});

/**
 * Popover widths (06 component.popover.width), kept inside the window. On a phone the
 * tray is the window's width instead.
 */
export const popoverWidth = styleVariants(
  vars.scale.component.popover.width,
  (width) => ({
    width,
    maxWidth: `calc(100vw - 2 * ${vars.layout.pageGutterMobile})`,
  }),
);

/**
 * The scrim behind a Dialog on tablet and wider, centring it in the visual viewport, so
 * the on-screen keyboard of a tablet does not cover it.
 */
export const centeredOverlay = style([
  trayOverlay,
  {
    alignItems: "center",
    padding: vars.layout.pageGutterTablet,
  },
]);

/** A Dialog in the middle of the screen: a card at most 85% of the visible height. */
export const centeredFrame = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxHeight: `calc(${vars.layout.sheetMaxHeightRatio} * var(--visual-viewport-height))`,
  overflow: "hidden",
  background: vars.color.surface.overlay,
  // Framed as a Popover and a Toast are (design-spec 4.4「画面の組み方」).
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.sheet,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  outline: "none",
  selectors: {
    "&[data-entering]": { animation: enter(riseIn) },
    "&[data-exiting]": { animation: exit(fadeOut) },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": { animation: reducedFade(fadeIn) },
        "&[data-exiting]": { animation: reducedFade(fadeOut) },
      },
    },
  },
});

/** Dialog widths: small, medium and large (06 layout.dialog-max-width, design-spec 3.8). */
export const dialogWidth = styleVariants(
  vars.layout.dialogMaxWidth,
  (width) => ({
    maxWidth: width,
  }),
);

/**
 * The scrim of a full-screen sheet: a large Dialog on a phone, and a fullscreen Dialog at
 * every width (design-spec 3.8). As tall as the visual viewport, like the tray's.
 */
export const sheetOverlay = style([trayOverlay, { alignItems: "stretch" }]);

/** A sheet that fills the visible window, clear of the notch and the home indicator. */
export const sheet = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  overflow: "hidden",
  paddingBlockStart: "env(safe-area-inset-top)",
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  background: vars.color.surface.overlay,
  color: vars.color.text.primary,
  outline: "none",
  selectors: {
    "&[data-entering]": { animation: enter(slideUp) },
    "&[data-exiting]": { animation: exit(slideDown) },
  },
  "@media": {
    [reducedMotion]: {
      selectors: {
        "&[data-entering]": { animation: reducedFade(fadeIn) },
        "&[data-exiting]": { animation: reducedFade(fadeOut) },
      },
    },
  },
});
