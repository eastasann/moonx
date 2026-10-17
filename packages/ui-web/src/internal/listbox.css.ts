import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { atLeastTarget, hoverTransition, typography } from "../styles/helpers";

export const listBox = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["25"],
  padding: vars.space["75"],
  outline: "none",
  overflow: "auto",
});

export const option = style({
  ...hoverTransition,
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  minHeight: atLeastTarget(vars.scale.component.field.height.M),
  paddingInline: vars.scale.component.field.paddingX.M,
  paddingBlock: vars.space["75"],
  borderRadius: vars.radius.control,
  fontFamily: vars.font.family.body,
  fontSize: vars.scale.component.field.fontSize.M,
  lineHeight: vars.typography.body.lineHeight,
  color: vars.color.text.primary,
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered], &[data-focused]": {
      background: vars.color.surface.hover,
    },
    "&[data-focus-visible]": {
      outline: `${vars.borderWidth.focusRing} solid ${vars.color.border.focus}`,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
    "&[data-selected]": { fontWeight: vars.typography.label.fontWeight },
    "&[data-disabled]": { color: vars.color.text.disabled },
  },
});

export const optionText = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

export const optionDescription = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});

/** Keeps the column of the check mark even on rows that are not selected. */
export const check = style({
  display: "inline-flex",
  width: vars.scale.component.icon.size.S,
  flexShrink: 0,
});
