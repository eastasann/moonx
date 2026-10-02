import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const diffText = style({
  margin: 0,
  color: vars.color.text.primary,
  fontFamily: vars.typography["body-sm"].fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
});

// Underline and strike-through carry the meaning too, so it does not rest on color alone.
export const added = style({
  background: vars.color.positive.bg,
  color: vars.color.positive.fg,
  textDecoration: "underline",
});

export const removed = style({
  background: vars.color.negative.bg,
  color: vars.color.negative.fg,
  textDecoration: "line-through",
});
