import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";

export const divider = recipe({
  base: {
    flexShrink: 0,
    alignSelf: "stretch",
    margin: 0,
    border: "none",
    background: vars.color.border.hairline,
  },
  variants: {
    orientation: {
      horizontal: {},
      vertical: {},
    },
    size: {
      S: {},
      M: {},
      // The heavy rule under a section, as Spectrum's large divider, in the light line of
      // the mockups' rules (design-spec 4.4, 06 border.default).
      L: { background: vars.color.border.default },
    },
  },
  compoundVariants: (["S", "M", "L"] as const).flatMap((size) => [
    {
      variants: { orientation: "horizontal" as const, size },
      style: { height: vars.borderWidth.divider[size] },
    },
    {
      variants: { orientation: "vertical" as const, size },
      style: { width: vars.borderWidth.divider[size] },
    },
  ]),
  defaultVariants: { orientation: "horizontal", size: "M" },
});
