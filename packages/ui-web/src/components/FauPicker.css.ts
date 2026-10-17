import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

/** The mark, the label and, for a Fact without evidence, the warning sign. */
export const summary = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["100"],
  minWidth: 0,
});

/** "Fact · No evidence" carries a warning in the amber of attention (06 notice). */
export const warning = style({
  display: "inline-flex",
  color: vars.color.notice.fg,
});

/** The cell's button: quiet, starting at the cell's edge like the values beside it. */
export const trigger = style({ justifyContent: "flex-start" });

/** The state alone (read only, and above the phone's buttons), in ActionButton's type size. */
export const readOnly = styleVariants(sized, (size) => ({
  display: "inline-flex",
  alignItems: "center",
  minHeight: vars.scale.component.actionButton.height[size],
  fontFamily: vars.typography.label.fontFamily,
  fontWeight: vars.typography.label.fontWeight,
  fontSize: vars.scale.component.actionButton.fontSize[size],
  color: vars.color.text.secondary,
}));

/** A phone's sheet: the state, then the buttons, in a fieldset without a frame. */
export const inline = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
});

/** The F/A/U buttons and the confidence, each as wide as the popover or the sheet (6.0.3). */
export const controls = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: vars.space["200"],
});

export const toggleGlyph = style({ display: "inline-flex" });
