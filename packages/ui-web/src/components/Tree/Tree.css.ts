import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

export const tree = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.compact["list-gap"],
  color: vars.color.text.primary,
  fontFamily: vars.typography.body.fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
  outline: "none",
  selectors: { "&[data-focus-visible]": focusRing },
});

export const item = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["75"],
  minHeight: vars.scale.component["target-min"],
  paddingInlineEnd: vars.space["100"],
  paddingInlineStart: `calc(${vars.space["100"]} + (var(--tree-item-level, 1) - 1) * ${vars.space["400"]})`,
  borderRadius: vars.radius.control,
  cursor: "default",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-selected]": { background: vars.color.surface.selected },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

const chevronSize = vars.scale.component.icon.size.S;

export const chevron = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  width: vars.scale.component["target-min"],
  height: vars.scale.component["target-min"],
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  selectors: { "&[data-focus-visible]": focusRing },
});

export const chevronSpacer = style({
  flexShrink: 0,
  width: vars.scale.component["target-min"],
});

export const chevronIcon = style({
  width: chevronSize,
  height: chevronSize,
  transition: `transform ${vars.motion.transition.expand}`,
  selectors: { [`${item}[data-expanded] &`]: { transform: "rotate(90deg)" } },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const title = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const trailing = style({
  flexShrink: 0,
  color: vars.color.text.secondary,
});

export const empty = style({
  padding: vars.space["400"],
  textAlign: "center",
  color: vars.color.text.secondary,
});
