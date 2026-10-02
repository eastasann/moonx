import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

const face = (name: "body" | "body-long" | "body-sm" | "caption" | "label") => ({
  fontFamily: vars.typography[name].fontFamily,
  fontSize: vars.typography[name].fontSize,
  fontWeight: vars.typography[name].fontWeight,
  letterSpacing: vars.typography[name].letterSpacing,
  lineHeight: vars.typography[name].lineHeight,
});

export const text = recipe({
  base: { margin: 0 },
  variants: {
    variant: {
      body: face("body"),
      "body-long": face("body-long"),
      "body-sm": face("body-sm"),
      caption: face("caption"),
      label: face("label"),
    },
    tone: {
      primary: { color: vars.color.text.primary },
      secondary: { color: vars.color.text.secondary },
      negative: { color: vars.color.negative.fg },
    },
  },
  defaultVariants: { variant: "body", tone: "primary" },
});

export type TextVariants = NonNullable<RecipeVariants<typeof text>>;
