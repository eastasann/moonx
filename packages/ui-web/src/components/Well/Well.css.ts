import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const well = style({
  padding: vars.space["300"],
  background: vars.color.surface.sunken,
  border: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.control,
  color: vars.color.text.primary,
});
