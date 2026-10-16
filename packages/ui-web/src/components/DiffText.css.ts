import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/** Answers keep their line breaks, as `Text variant="body-long"` does. */
export const text = style({
  ...typography("bodyLong"),
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
});

const changed = {
  background: vars.color.surface.sunken,
  color: vars.color.text.primary,
  textDecorationThickness: vars.borderWidth.focusRing,
  textDecorationColor: vars.color.text.primary,
} as const;

export const removed = style({
  ...changed,
  textDecorationLine: "line-through",
});

export const added = style({
  ...changed,
  textDecorationLine: "underline",
  textUnderlineOffset: vars.space["50"],
});
