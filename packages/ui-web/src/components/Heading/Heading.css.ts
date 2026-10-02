import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

const level = (name: "display" | "heading-1" | "heading-2" | "heading-3" | "heading-4") => ({
  fontFamily: vars.typography[name].fontFamily,
  fontSize: vars.typography[name].fontSize,
  fontWeight: vars.typography[name].fontWeight,
  letterSpacing: vars.typography[name].letterSpacing,
  lineHeight: vars.typography[name].lineHeight,
});

export const heading = recipe({
  base: { margin: 0, color: vars.color.text.primary },
  variants: {
    variant: {
      display: level("display"),
      "heading-1": level("heading-1"),
      "heading-2": level("heading-2"),
      "heading-3": level("heading-3"),
      "heading-4": level("heading-4"),
    },
  },
  defaultVariants: { variant: "heading-1" },
});

export type HeadingVariants = NonNullable<RecipeVariants<typeof heading>>;
