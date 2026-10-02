import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const tile = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["50"],
  minWidth: 0,
  padding: vars.space["200"],
  background: vars.color.surface.raised,
  border: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.control,
  color: vars.color.text.primary,
});

export const label = style({
  margin: 0,
  color: vars.color.text.secondary,
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  fontWeight: vars.typography.caption.fontWeight,
  lineHeight: vars.typography.caption.lineHeight,
});

export const value = style({
  margin: 0,
  overflowWrap: "anywhere",
  fontFamily: vars.typography.metric.fontFamily,
  fontSize: vars.typography.metric.fontSize,
  fontWeight: vars.typography.metric.fontWeight,
  letterSpacing: vars.typography.metric.letterSpacing,
  lineHeight: vars.typography.metric.lineHeight,
  fontVariantNumeric: vars.font.numeric.tabular,
});

export const note = style({
  margin: 0,
  color: vars.color.text.secondary,
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
});
