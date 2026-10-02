import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { atLeastTarget } from "../_internal/target";

export const trigger = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: "none",
    borderRadius: vars.radius.control,
    background: "transparent",
    color: vars.color.text.primary,
    cursor: "pointer",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.surface.sunken },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: {
      S: {
        minWidth: atLeastTarget(vars.scale.component["action-button"].height.S),
        minHeight: atLeastTarget(vars.scale.component["action-button"].height.S),
        padding: vars.scale.component["action-button"]["padding-icon-only"].S,
      },
      M: {
        minWidth: atLeastTarget(vars.scale.component["action-button"].height.M),
        minHeight: atLeastTarget(vars.scale.component["action-button"].height.M),
        padding: vars.scale.component["action-button"]["padding-icon-only"].M,
      },
      L: {
        minWidth: atLeastTarget(vars.scale.component["action-button"].height.L),
        minHeight: atLeastTarget(vars.scale.component["action-button"].height.L),
        padding: vars.scale.component["action-button"]["padding-icon-only"].L,
      },
      XL: {
        minWidth: atLeastTarget(vars.scale.component["action-button"].height.XL),
        minHeight: atLeastTarget(vars.scale.component["action-button"].height.XL),
        padding: vars.scale.component["action-button"]["padding-icon-only"].XL,
      },
    },
  },
  defaultVariants: { size: "M" },
});

export const icon = recipe({
  base: { strokeWidth: vars.icon["stroke-width"] },
  variants: {
    size: {
      S: { width: vars.scale.component.icon.size.XS, height: vars.scale.component.icon.size.XS },
      M: { width: vars.scale.component.icon.size.S, height: vars.scale.component.icon.size.S },
      L: { width: vars.scale.component.icon.size.M, height: vars.scale.component.icon.size.M },
      XL: { width: vars.scale.component.icon.size.L, height: vars.scale.component.icon.size.L },
    },
  },
  defaultVariants: { size: "M" },
});
