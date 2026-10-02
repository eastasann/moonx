import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

export const avatar = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: vars.radius.pill,
    background: vars.color.control.secondary,
    color: vars.color.control["on-secondary"],
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: 1,
    userSelect: "none",
  },
  variants: {
    size: {
      S: {
        width: vars.scale.component.avatar.size.S,
        height: vars.scale.component.avatar.size.S,
        fontSize: vars.scale["font-size"]["50"],
      },
      M: {
        width: vars.scale.component.avatar.size.M,
        height: vars.scale.component.avatar.size.M,
        fontSize: vars.scale["font-size"]["100"],
      },
    },
  },
  defaultVariants: { size: "M" },
});

export type AvatarVariants = NonNullable<RecipeVariants<typeof avatar>>;
