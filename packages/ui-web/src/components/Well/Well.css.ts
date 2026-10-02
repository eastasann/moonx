import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const well = style({
  padding: vars.space["300"],
  background: vars.color.surface.sunken,
  border: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.control,
  color: vars.color.text.primary,
});

// Long text stays inside the well and scrolls there, so a large export does not push the page's
// actions out of reach.
export const preformatted = style({
  margin: 0,
  maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
  overflow: "auto",
  fontFamily: vars.typography.id.fontFamily,
  fontSize: vars.typography.id.fontSize,
  fontWeight: vars.typography.id.fontWeight,
  lineHeight: vars.typography.id.lineHeight,
  overflowWrap: "anywhere",
  whiteSpace: "pre-wrap",
});
