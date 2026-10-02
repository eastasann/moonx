import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";
import { strongColor } from "../StatusLight/StatusLight.css";

export const dots = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["50"],
    fontFamily: vars.typography.label.fontFamily,
    lineHeight: vars.typography.label.lineHeight,
  },
  variants: {
    size: {
      S: { fontSize: vars.scale["font-size"]["75"] },
      M: { fontSize: vars.scale["font-size"]["100"] },
    },
  },
  defaultVariants: { size: "M" },
});

export const dot = recipe({
  variants: {
    state: {
      done: { color: strongColor.done },
      partial: { color: strongColor.partial },
      "not-started": { color: strongColor["not-started"] },
    },
  },
});

export type CheckDotsVariants = NonNullable<RecipeVariants<typeof dots>>;
