import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

export const segments = style({
  display: "flex",
  flex: 1,
  alignItems: "center",
  minWidth: 0,
  fontFamily: vars.typography.number.fontFamily,
  fontVariantNumeric: vars.typography.number.fontVariantNumeric,
});

export const segment = style({
  paddingInline: vars.space["25"],
  borderRadius: vars.radius.chip,
  outline: "none",
  caretColor: "transparent",
  selectors: {
    "&[data-type='literal']": { paddingInline: 0 },
    "&[data-placeholder]": { color: vars.color.text.placeholder },
    "&[data-focused]": {
      background: vars.color.control.primary,
      color: vars.color.control["on-primary"],
    },
    "&[data-invalid]:not([data-focused])": { color: vars.color.negative.fg },
    "&[data-disabled]": { color: vars.color.text.disabled },
  },
});

export const dialog = style({
  padding: vars.space["300"],
  outline: "none",
});

export const calendar = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  inlineSize: "100%",
  fontFamily: vars.typography.body.fontFamily,
  color: vars.color.text.primary,
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["100"],
});

export const heading = style({
  margin: 0,
  fontFamily: vars.typography.label.fontFamily,
  fontWeight: vars.typography.label.fontWeight,
  fontSize: vars.typography.body.fontSize,
  textAlign: "center",
  flex: 1,
});

export const navButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minInlineSize: vars.scale.component["target-min"],
  minBlockSize: vars.scale.component["target-min"],
  border: "none",
  background: "transparent",
  color: vars.color.text.primary,
  borderRadius: vars.radius.control,
  cursor: "pointer",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.control.secondary },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
});

export const grid = style({
  borderCollapse: "collapse",
  inlineSize: "100%",
});

export const headerCell = style({
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  color: vars.color.text.secondary,
  paddingBlockEnd: vars.space["100"],
});

export const cell = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minInlineSize: vars.scale.component["target-min"],
  minBlockSize: vars.scale.component["target-min"],
  margin: "auto",
  borderRadius: vars.radius.control,
  fontVariantNumeric: vars.typography.number.fontVariantNumeric,
  cursor: "pointer",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.control.secondary },
    "&[data-selected]": {
      background: vars.color.control.primary,
      color: vars.color.control["on-primary"],
    },
    "&[data-today]:not([data-selected])": {
      boxShadow: `inset 0 0 0 ${vars["border-width"].strong} ${vars.color.border.strong}`,
    },
    "&[data-outside-month]": { display: "none" },
    "&[data-unavailable]": {
      color: vars.color.text.disabled,
      textDecoration: "line-through",
      cursor: "not-allowed",
    },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    "&[data-focus-visible]": focusRing,
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});
