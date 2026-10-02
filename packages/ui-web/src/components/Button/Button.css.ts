import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { atLeastTarget } from "../_internal/target";

export const button = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["100"],
    border: "none",
    borderRadius: vars.radius.control,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.button.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    cursor: "pointer",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        background: vars.color.control.disabled,
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
      "&[data-pending]": { cursor: "progress" },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    variant: {
      accent: {
        background: vars.color.accent.default,
        color: vars.color.text["on-accent"],
        selectors: {
          "&[data-hovered]": { background: vars.color.accent.hover },
          "&[data-pressed]": { background: vars.color.accent.pressed },
        },
      },
      primary: {
        background: vars.color.control.primary,
        color: vars.color.control["on-primary"],
        selectors: {
          "&[data-hovered]": { background: vars.color.control["primary-hover"] },
          "&[data-pressed]": { background: vars.color.control["primary-pressed"] },
        },
      },
      secondary: {
        background: vars.color.control.secondary,
        color: vars.color.control["on-secondary"],
        selectors: {
          "&[data-hovered]": { background: vars.color.control["secondary-hover"] },
          "&[data-pressed]": { background: vars.color.control["secondary-pressed"] },
        },
      },
      negative: {
        background: vars.color.negative.strong,
        color: vars.color.negative["on-strong"],
        selectors: {
          "&[data-hovered]": { background: vars.color.negative["strong-hover"] },
          "&[data-pressed]": { background: vars.color.negative["strong-pressed"] },
        },
      },
    },
    size: {
      S: {
        minHeight: atLeastTarget(vars.scale.component.button.height.S),
        paddingInline: vars.scale.component.button["padding-x"].S,
        fontSize: vars.scale.component.button["font-size"].S,
      },
      M: {
        minHeight: atLeastTarget(vars.scale.component.button.height.M),
        paddingInline: vars.scale.component.button["padding-x"].M,
        fontSize: vars.scale.component.button["font-size"].M,
      },
      L: {
        minHeight: atLeastTarget(vars.scale.component.button.height.L),
        paddingInline: vars.scale.component.button["padding-x"].L,
        fontSize: vars.scale.component.button["font-size"].L,
      },
      XL: {
        minHeight: atLeastTarget(vars.scale.component.button.height.XL),
        paddingInline: vars.scale.component.button["padding-x"].XL,
        fontSize: vars.scale.component.button["font-size"].XL,
      },
    },
  },
  defaultVariants: { variant: "primary", size: "M" },
});

export type ButtonVariants = NonNullable<RecipeVariants<typeof button>>;
