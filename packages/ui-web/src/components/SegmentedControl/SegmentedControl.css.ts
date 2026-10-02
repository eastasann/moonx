import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget, targetMin } from "../_internal/target";

export const control = recipe({
  base: {
    display: "inline-flex",
    padding: vars.space["50"],
    gap: vars.space["50"],
    background: vars.color.control.secondary,
    borderRadius: vars.radius.control,
    alignItems: "stretch",
  },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row" },
      vertical: { flexDirection: "column" },
    },
  },
  defaultVariants: { orientation: "horizontal" },
});

export const segment = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
    border: "none",
    background: "transparent",
    color: vars.color.control["on-secondary"],
    borderRadius: vars.radius.chip,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.button.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    cursor: "pointer",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-hovered]": { background: vars.color.control["secondary-hover"] },
      "&[data-pressed]": { background: vars.color.control["secondary-pressed"] },
      "&[data-selected]": {
        background: vars.color.control.primary,
        color: vars.color.control["on-primary"],
      },
      "&[data-selected][data-hovered]": { background: vars.color.control["primary-hover"] },
      "&[data-selected][data-pressed]": { background: vars.color.control["primary-pressed"] },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        background: "transparent",
        cursor: "not-allowed",
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({
      minBlockSize: atLeastTarget(vars.scale.component["action-button"].height[s]),
      minInlineSize: targetMin,
      paddingInline: vars.scale.component["action-button"]["padding-x"][s],
      fontSize: vars.scale.component.button["font-size"][s],
    })),
  },
  defaultVariants: { size: "M" },
});
