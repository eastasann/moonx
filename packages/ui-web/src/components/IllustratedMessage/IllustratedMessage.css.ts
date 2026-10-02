import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const illustratedMessage = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.space["200"],
  maxWidth: vars.layout["reading-column-max"],
  marginInline: "auto",
  padding: vars.space["500"],
  textAlign: "center",
  color: vars.color.text.primary,
});

export const icon = style({
  width: vars.space["700"],
  height: vars.space["700"],
  color: vars.color.text.secondary,
  strokeWidth: vars.icon["stroke-width"],
});

export const heading = style({
  margin: 0,
  fontFamily: vars.typography["heading-3"].fontFamily,
  fontSize: vars.typography["heading-3"].fontSize,
  fontWeight: vars.typography["heading-3"].fontWeight,
  letterSpacing: vars.typography["heading-3"].letterSpacing,
  lineHeight: vars.typography["heading-3"].lineHeight,
});

export const description = style({
  margin: 0,
  color: vars.color.text.secondary,
  fontSize: vars.typography.body.fontSize,
  lineHeight: vars.typography.body.lineHeight,
});

export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: vars.space["100"],
  marginBlockStart: vars.space["100"],
});
