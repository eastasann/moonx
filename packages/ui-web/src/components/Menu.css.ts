import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { atLeastTarget, hoverTransition, typography } from "../styles/helpers";

export const menu = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["25"],
  padding: vars.space["75"],
  outline: "none",
  overflow: "auto",
});

const item = style({
  ...hoverTransition,
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  paddingBlock: vars.space["75"],
  borderRadius: vars.radius.control,
  fontFamily: vars.font.family.body,
  lineHeight: vars.typography.body.lineHeight,
  color: vars.color.text.primary,
  textDecoration: "none",
  cursor: "default",
  outline: "none",
  selectors: {
    "&[data-hovered], &[data-focused]": {
      background: vars.color.surface.hover,
    },
    "&[data-pressed]": { background: vars.color.control.secondaryPressed },
    "&[data-focus-visible]": {
      outline: `${vars.borderWidth.focusRing} solid ${vars.color.border.focus}`,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
    "&[data-disabled]": { color: vars.color.text.disabled },
    "&[href]": { cursor: "pointer" },
  },
});

/** Menu items by size (06 component.menu); each stays a full target on touch. */
export const menuItem = styleVariants(
  Object.fromEntries(sizes.map((size) => [size, size])) as Record<Size, Size>,
  (size) => [
    item,
    {
      minHeight: atLeastTarget(vars.scale.component.menu.itemHeight[size]),
      paddingInline: vars.scale.component.menu.paddingX[size],
      fontSize: vars.scale.component.menu.fontSize[size],
    },
  ],
);

export const itemText = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

export const itemDescription = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});
