import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { breakpoints, vars } from "../../theme";

const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;

export const root = style({
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  position: "sticky",
  insetBlockStart: 0,
  height: "100dvh",
  width: vars.layout["sidebar-width"],
  paddingBlock: vars.space["200"],
  paddingInline: vars.space["100"],
  gap: vars.space["200"],
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  borderInlineEnd: hairline,
  overflowY: "auto",
  selectors: { '&[data-collapsed="true"]': { width: vars.layout["sidebar-width-collapsed"] } },
  "@media": { [`(max-width: ${breakpoints.tablet - 1}px)`]: { display: "none" } },
});

export const slot = style({ display: "flex", flexDirection: "column", minWidth: 0 });

export const nav = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  flex: 1,
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.compact["list-gap"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const separator = style({
  margin: 0,
  border: "none",
  borderBlockStart: hairline,
});

export const link = style({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  minHeight: vars.scale.component["target-min"],
  paddingInline: vars.space["200"],
  borderRadius: vars.radius.control,
  color: vars.color.text.secondary,
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  lineHeight: vars.typography.label.lineHeight,
  textDecoration: "none",
  cursor: "pointer",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover, color: vars.color.text.primary },
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-current]": { background: vars.color.surface.selected, color: vars.color.text.primary },
    "&[data-focus-visible]": focusRing,
    [`${root}[data-collapsed="true"] &`]: { justifyContent: "center", paddingInline: 0 },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const icon = style({
  flexShrink: 0,
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
});

export const label = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: {
    [`${root}[data-collapsed="true"] &`]: {
      position: "absolute",
      width: 1,
      height: 1,
      margin: -1,
      padding: 0,
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
    },
  },
});

export const badge = style({
  flexShrink: 0,
  selectors: {
    [`${root}[data-collapsed="true"] &`]: {
      position: "absolute",
      insetBlockStart: vars.space["50"],
      insetInlineEnd: vars.space["50"],
    },
  },
});

export const tooltip = style({
  background: vars.color.control.primary,
  color: vars.color.control["on-primary"],
  borderRadius: vars.radius.chip,
  paddingInline: vars.space["100"],
  paddingBlock: vars.space["75"],
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  lineHeight: vars.typography["label-sm"].lineHeight,
  boxShadow: vars.shadow.overlay,
});
