import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

export const divider = recipe({
  base: {
    margin: 0,
    border: "none",
    background: vars.color.border.hairline,
    flexShrink: 0,
  },
  variants: {
    orientation: {
      horizontal: { width: "100%" },
      vertical: { alignSelf: "stretch" },
    },
    size: { S: {}, M: {}, L: {} },
  },
  compoundVariants: [
    {
      variants: { orientation: "horizontal", size: "S" },
      style: { height: vars["border-width"].divider.S },
    },
    {
      variants: { orientation: "horizontal", size: "M" },
      style: { height: vars["border-width"].divider.M },
    },
    {
      variants: { orientation: "horizontal", size: "L" },
      style: { height: vars["border-width"].divider.L },
    },
    {
      variants: { orientation: "vertical", size: "S" },
      style: { width: vars["border-width"].divider.S },
    },
    {
      variants: { orientation: "vertical", size: "M" },
      style: { width: vars["border-width"].divider.M },
    },
    {
      variants: { orientation: "vertical", size: "L" },
      style: { width: vars["border-width"].divider.L },
    },
  ],
  defaultVariants: { orientation: "horizontal", size: "S" },
});

export type DividerVariants = NonNullable<RecipeVariants<typeof divider>>;
