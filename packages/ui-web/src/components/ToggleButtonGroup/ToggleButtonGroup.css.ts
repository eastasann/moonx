import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";
import { atLeastTarget, targetMin } from "../_internal/target";

export const group = recipe({
  base: { display: "inline-flex", gap: vars.space["75"], alignItems: "center" },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row" },
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
  },
  defaultVariants: { orientation: "horizontal" },
});

export const item = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minInlineSize: targetMin,
    background: vars.color.surface.raised,
    color: vars.color.text.primary,
    border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.control,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.button.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    cursor: "pointer",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.control.secondary },
      "&[data-selected]": {
        background: vars.color.surface.selected,
        borderColor: vars.color.control["track-fill"],
        color: vars.color.text.primary,
      },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({
      minBlockSize: atLeastTarget(vars.scale.component["action-button"].height[s]),
      paddingInline: vars.scale.component["action-button"]["padding-x"][s],
      fontSize: vars.scale.component.button["font-size"][s],
    })),
  },
  defaultVariants: { size: "M" },
});
