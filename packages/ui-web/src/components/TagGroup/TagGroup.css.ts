import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget } from "../_internal/target";

export const tagList = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space["100"],
});

export const tag = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["75"],
    background: vars.color.control.secondary,
    color: vars.color.control["on-secondary"],
    borderRadius: vars.radius.chip,
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.label.lineHeight,
    outline: "none",
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": { color: vars.color.text.disabled },
    },
  },
  variants: {
    size: sizeVariants((s) => ({
      minBlockSize: atLeastTarget(vars.scale.component["action-button"].height[s]),
      paddingInlineStart: vars.scale.component.field["padding-x"][s],
      paddingInlineEnd: vars.scale.component.field["padding-x"][s],
      fontSize: vars.scale.component.field["font-size"][s],
    })),
  },
  defaultVariants: { size: "M" },
});

export const removeButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
  marginInlineEnd: `calc(-1 * ${vars.space["75"]})`,
  minInlineSize: vars.scale.component["target-min"],
  minBlockSize: vars.scale.component["target-min"],
  border: "none",
  background: "transparent",
  color: "inherit",
  borderRadius: vars.radius.chip,
  cursor: "pointer",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.control["secondary-hover"] },
    "&[data-pressed]": { background: vars.color.control["secondary-pressed"] },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});
