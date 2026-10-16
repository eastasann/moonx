import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";

export const form = recipe({
  // Children keep their own width (fields their size's, buttons their label's); a field
  // with width="full" still fills the line.
  base: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    minWidth: 0,
  },
  variants: {
    density: {
      regular: { gap: vars.density.regular.fieldGap },
      spacious: { gap: vars.density.spacious.fieldGap },
    },
  },
  defaultVariants: { density: "regular" },
});
