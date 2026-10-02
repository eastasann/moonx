import { recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

export const actionGroup = recipe({
  base: { display: "inline-flex", gap: vars.space["50"], alignItems: "center" },
  variants: {
    orientation: {
      horizontal: { flexDirection: "row" },
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
  },
  defaultVariants: { orientation: "horizontal" },
});
