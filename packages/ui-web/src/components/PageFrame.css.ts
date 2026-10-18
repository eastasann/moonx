import { style } from "@vanilla-extract/css";

/**
 * The main landmark of a screen without the app's frame. It has no look of its own: it
 * fills the window's height so the pattern inside can put its main action at the
 * bottom on a phone (4.1 B).
 */
export const pageFrame = style({
  display: "flex",
  flexDirection: "column",
  minHeight: "100dvh",
  outline: "none",
});
