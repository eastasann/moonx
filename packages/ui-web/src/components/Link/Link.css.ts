import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { targetMin } from "../_internal/target";

export const link = recipe({
  base: {
    font: "inherit",
    textDecoration: "underline",
    textUnderlineOffset: vars.space["50"],
    cursor: "pointer",
    borderRadius: vars.radius.chip,
    transition: `color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
        textDecoration: "none",
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    variant: {
      primary: {
        display: "inline-flex",
        alignItems: "center",
        minHeight: targetMin,
        color: vars.color.text.link,
        selectors: {
          "&[data-hovered]": { textDecorationThickness: vars["border-width"].divider.M },
        },
      },
      // Links inside running text wrap across lines, which a minimum height cannot describe;
      // WCAG 2.5.8 exempts them from the target size.
      secondary: {
        color: vars.color.text.secondary,
        selectors: { "&[data-hovered]": { color: vars.color.text.primary } },
      },
    },
  },
  defaultVariants: { variant: "primary" },
});
