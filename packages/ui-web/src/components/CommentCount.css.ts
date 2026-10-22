import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";

/** The mark and the number, in the type of the line it sits in (s15-competitors.html .cmt). */
export const commentCount = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["50"],
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
