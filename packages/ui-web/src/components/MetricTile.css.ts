import { vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/** No frame: tiles are set apart by the screen's dividers and space (design-spec 4.4). */
export const tile = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  minWidth: 0,
  margin: 0,
});

export const label = style({
  ...typography("label"),
  color: vars.color.text.secondary,
});

/**
 * A number breaks only when it is wider than its tile (a phone's 2×2 with a very large
 * amount): the page never scrolls sideways (design-spec 4.3).
 */
export const value = style({
  ...typography("metric"),
  margin: 0,
  color: vars.color.text.primary,
  fontVariantNumeric: "tabular-nums",
  overflowWrap: "anywhere",
});

export const placeholder = style({
  ...typography("body"),
  margin: 0,
  color: vars.color.text.tertiary,
  overflowWrap: "break-word",
});

const supplementBase = {
  ...typography("bodySm"),
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["75"],
  margin: 0,
} as const;

export const supplement = styleVariants({
  neutral: { ...supplementBase, color: vars.color.text.secondary },
  notice: { ...supplementBase, color: vars.color.notice.fg },
});
