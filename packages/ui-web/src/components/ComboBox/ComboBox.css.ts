import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

export const trayDialog = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  padding: vars.space["300"],
  outline: "none",
});

export const searchRow = style({
  display: "flex",
  gap: vars.space["100"],
  alignItems: "stretch",
});

export const searchInputWrap = style({ flex: 1, minWidth: 0, display: "flex" });
