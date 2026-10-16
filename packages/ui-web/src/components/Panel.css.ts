import { vars } from "@moonx/ui-tokens";
import { keyframes, style } from "@vanilla-extract/css";
import { reducedMotion } from "../styles/helpers";

/** Below the title, the threads or the changes scroll on their own. */
export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
  flexShrink: 0,
  paddingInline: vars.density.regular.panelPadding,
  paddingBlock: vars.space["200"],
  borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.gap,
  flex: 1,
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  padding: vars.density.regular.panelPadding,
});

/** The desktop's column: as tall as its place, `layout.side-panel-width` wide. */
export const docked = style({
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  width: vars.layout.sidePanelWidth,
  maxWidth: "100%",
  height: "100%",
  minHeight: 0,
  borderInlineStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  outline: "none",
});

export const dialog = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  outline: "none",
});

const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });
const fadeOut = keyframes({ from: { opacity: 1 }, to: { opacity: 0 } });
const slideIn = keyframes({
  from: { transform: "translateX(100%)" },
  to: { transform: "translateX(0)" },
});
const slideOut = keyframes({
  from: { transform: "translateX(0)" },
  to: { transform: "translateX(100%)" },
});
const enter = (name: string) =>
  `${name} ${vars.motion.transition.enter.duration} ${vars.motion.transition.enter.timingFunction}`;
const exit = (name: string) =>
  `${name} ${vars.motion.transition.exit.duration} ${vars.motion.transition.exit.timingFunction}`;
const reducedFade = (name: string) =>
  `${name} ${vars.motion.reduced.fade} linear`;

/** The tablet's scrim; the drawer stands at its right edge (design-spec 4.3). */
export const drawerOverlay = style({
  position: "fixed",
  inset: 0,
  display: "flex",
  justifyContent: "flex-end",
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

/** The tablet's drawer: the panel's width, the window's height, sliding in from the right. */
export const drawer = style({
  display: "flex",
  flexDirection: "column",
  boxSizing: "border-box",
  width: vars.layout.sidePanelWidth,
  maxWidth: "100%",
  height: "100%",
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  background: vars.color.surface.overlay,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  outline: "none",
  selectors: {
    "&[data-entering]": { animation: enter(slideIn) },
    "&[data-exiting]": { animation: exit(slideOut) },
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
