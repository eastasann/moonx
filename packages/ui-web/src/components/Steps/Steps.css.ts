import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const list = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const step = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  color: vars.color.text.secondary,
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  selectors: {
    '&[data-status="current"]': { color: vars.color.text.primary },
    "&:not(:last-child)::after": {
      content: '""',
      width: vars.space["500"],
      borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.strong}`,
    },
  },
});

export const marker = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.avatar.size.S,
  height: vars.scale.component.avatar.size.S,
  borderRadius: vars.radius.pill,
  border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
  fontVariantNumeric: vars.font.numeric.tabular,
  selectors: {
    '[data-status="current"] > &': {
      background: vars.color.control.primary,
      color: vars.color.control["on-primary"],
      borderColor: vars.color.control.primary,
    },
    '[data-status="done"] > &': {
      background: vars.color.positive.bg,
      color: vars.color.positive.fg,
      borderColor: vars.color.positive.strong,
    },
  },
});
