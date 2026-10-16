import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";

export const well = recipe({
  base: {
    minWidth: 0,
    background: vars.color.surface.sunken,
    borderRadius: vars.radius.card,
    color: vars.color.text.primary,
    overflowWrap: "break-word",
  },
  variants: {
    density: {
      regular: { padding: vars.density.regular.panelPadding },
      spacious: { padding: vars.density.spacious.panelPadding },
    },
  },
  defaultVariants: { density: "regular" },
});
