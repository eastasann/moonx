import { style } from "@vanilla-extract/css";

/**
 * The box of an icon set before a text (a field's error or warning, an alert's sign):
 * one line of the text tall (`1lh`, the line height it inherits), with the icon in its
 * middle. Put at the start of a row that aligns its items to the top, the icon sits at
 * the middle of the text's first line however many lines the text wraps to (design-spec
 * 4.5).
 */
export const lineIcon = style({
  display: "inline-flex",
  alignItems: "center",
  flexShrink: 0,
  height: "1lh",
});
