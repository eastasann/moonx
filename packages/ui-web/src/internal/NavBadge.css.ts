import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/** SideNav's count: the number alone, monospaced and secondary (moon-base.css .nav .count). */
export const count = style({
  ...typography("count"),
  color: vars.color.text.secondary,
  fontVariantNumeric: "tabular-nums",
});
