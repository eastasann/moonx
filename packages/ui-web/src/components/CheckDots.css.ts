import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";

export const dots = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
  verticalAlign: "middle",
});
