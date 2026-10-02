import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const content = style({
  padding: vars.space["300"],
  outline: "none",
  color: vars.color.text.primary,
  fontFamily: vars.typography.body.fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
});
