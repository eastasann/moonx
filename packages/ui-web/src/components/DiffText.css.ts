import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/** Answers keep their line breaks, as `Text variant="body-long"` does. */
export const text = style({
  ...typography("bodyLong"),
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
});

/** Removed text struck through in secondary, on the sunken surface (s25-import.html del). */
export const removed = style({
  background: vars.color.surface.sunken,
  color: vars.color.text.secondary,
  textDecorationLine: "line-through",
  textDecorationThickness: vars.scale.component.diffText.removedThickness,
  textDecorationColor: vars.color.text.secondary,
});

/** Added text underlined a little below the letters, on the sunken surface (ins). */
export const added = style({
  background: vars.color.surface.sunken,
  color: vars.color.text.primary,
  textDecorationLine: "underline",
  textDecorationThickness: vars.scale.component.diffText.addedThickness,
  textDecorationColor: vars.color.text.primary,
  textUnderlineOffset: vars.scale.component.diffText.addedOffset,
});
