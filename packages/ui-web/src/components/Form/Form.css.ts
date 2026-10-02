import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const form = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious["field-gap"],
  margin: 0,
});
