import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

// Looks the gallery needs that no component offers: the toolbar band and the boxes that
// make layout components visible. Only this page uses them.

export const page = style({
  paddingBlock: vars.space["500"],
});

export const toolbar = style({
  position: "sticky",
  top: 0,
  zIndex: vars.layout.zIndex.nav,
  paddingBlock: vars.space["300"],
  background: vars.color.surface.canvas,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["400"],
  paddingBlock: vars.space["600"],
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const specimen = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  minWidth: 0,
});

export const caption = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  fontFamily: vars.font.family.mono,
});

export const box = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: vars.space["700"],
  minHeight: vars.space["700"],
  paddingInline: vars.space["200"],
  background: vars.color.surface.sunken,
  border: `${vars.borderWidth.hairline} dashed ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
  ...typography("caption"),
  color: vars.color.text.secondary,
});

export const frame = style({
  border: `${vars.borderWidth.hairline} dashed ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
});

export const verticalRule = style({
  display: "flex",
  alignItems: "stretch",
  gap: vars.space["300"],
  height: vars.space["700"],
});

/** A narrow box that squeezes what it holds. */
export const narrowBox = style({
  width: vars.space["1000"],
});

/** Where the gallery's Panel docks on a desktop: a column of a screen's height. */
export const panelPlace = style({
  display: "flex",
  height: vars.layout.popoverMaxHeight,
});

/** Slides at the width of 23's slide column, and of its thumbnails. */
export const slidePlace = style({
  width: "100%",
  maxWidth: vars.layout.readingColumnMax,
});

export const thumbnailPlace = style({
  width: vars.layout.thumbnailColumnWidth,
});

/**
 * Where a layout pattern or a frame is shown: a dashed box it fills as it fills the
 * body. No overflow of its own, so the pattern's sticky bars stick to the window.
 */
export const patternBox = style({
  display: "flex",
  flexDirection: "column",
  border: `${vars.borderWidth.hairline} dashed ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
});

/**
 * A frame as wide as the window, outside the gallery's column: AppFrame measures its body
 * to arrange D and F beside a docked panel, and the column would make it narrower than
 * the window under test.
 */
export const windowBox = style([
  patternBox,
  { borderInline: "none", borderRadius: 0 },
]);
