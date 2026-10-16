import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { atLeastTarget, hoverTransition } from "../styles/helpers";

/** The members under the field, as a Picker's list looks (listbox.css). */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["25"],
  padding: vars.space["75"],
  outline: "none",
});

export const option = style({
  ...hoverTransition,
  display: "flex",
  alignItems: "center",
  minHeight: atLeastTarget(vars.scale.component.field.height.M),
  paddingInline: vars.scale.component.field.paddingX.M,
  borderRadius: vars.radius.control,
  fontFamily: vars.font.family.body,
  fontSize: vars.scale.component.field.fontSize.M,
  lineHeight: vars.typography.body.lineHeight,
  color: vars.color.text.primary,
  cursor: "default",
  selectors: {
    "&:hover": { background: vars.color.surface.hover },
    '&[aria-selected="true"]': {
      background: vars.color.surface.hover,
      boxShadow: `inset ${vars.borderWidth.selectedIndicator} 0 0 ${vars.color.control.primary}`,
    },
  },
});
