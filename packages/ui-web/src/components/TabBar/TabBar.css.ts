import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { breakpoints, vars } from "../../theme";

export const root = style({
  position: "fixed",
  insetInline: 0,
  insetBlockEnd: 0,
  zIndex: vars.layout["z-index"].nav,
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "1fr",
  minHeight: vars.layout["tab-bar-height"],
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  margin: 0,
  paddingInline: 0,
  listStyle: "none",
  background: vars.color.surface.raised,
  borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  "@media": { [`(min-width: ${breakpoints.tablet}px)`]: { display: "none" } },
});

export const cell = style({ display: "flex", minWidth: 0 });

export const item = style({
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space["50"],
  width: "100%",
  height: "100%",
  minHeight: vars.layout["tab-bar-height"],
  minWidth: vars.scale.component["target-min"],
  paddingInline: vars.space["50"],
  paddingBlock: vars.space["75"],
  border: "none",
  borderBlockStart: `${vars["border-width"].divider.M} solid transparent`,
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  fontWeight: vars.typography["label-sm"].fontWeight,
  lineHeight: vars.typography["label-sm"].lineHeight,
  textDecoration: "none",
  cursor: "pointer",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-current]": {
      color: vars.color.text.primary,
      borderBlockStartColor: vars.color.control["track-fill"],
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars["border-width"]["focus-ring"]})`,
    },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const iconWrap = style({ position: "relative", display: "inline-flex" });

export const icon = style({
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
});

export const badge = style({
  position: "absolute",
  insetBlockStart: `calc(-1 * ${vars.space["75"]})`,
  insetInlineStart: "100%",
  marginInlineStart: `calc(-1 * ${vars.space["100"]})`,
});

export const label = style({
  maxWidth: "100%",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
