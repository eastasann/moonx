import { vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

export const steps = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  rowGap: vars.space["100"],
  columnGap: vars.space["200"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A step; a short rule before each but the first: the → of 1 → 2 → 3. */
export const step = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["100"],
  minWidth: 0,
  selectors: {
    "& + &::before": {
      content: '""',
      width: vars.space["400"],
      height: vars.borderWidth.strong,
      marginInlineEnd: vars.space["100"],
      background: vars.color.border.strong,
    },
  },
});

export const stepState = styleVariants({
  done: { color: vars.color.text.secondary },
  current: { color: vars.color.text.primary },
  upcoming: { color: vars.color.text.secondary },
});

/** The step's number in a circle: filled with ink for the current one, a check once done. */
const markerBase = {
  ...typography("number"),
  display: "inline-flex",
  flexShrink: 0,
  alignItems: "center",
  justifyContent: "center",
  width: vars.space["400"],
  height: vars.space["400"],
  boxSizing: "border-box",
  borderRadius: vars.radius.pill,
  border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
  fontSize: vars.scale.fontSize["75"],
  fontVariantNumeric: "tabular-nums",
} as const;

export const marker = styleVariants({
  done: { ...markerBase, color: vars.color.text.primary },
  current: {
    ...markerBase,
    borderColor: vars.color.control.primary,
    background: vars.color.control.primary,
    color: vars.color.control.onPrimary,
  },
  upcoming: { ...markerBase, color: vars.color.text.secondary },
});

export const label = style({
  ...typography("label"),
  overflowWrap: "break-word",
});
