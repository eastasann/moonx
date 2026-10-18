import { type MoonGlyphSize, vars } from "@moonx/ui-tokens";
import { styleVariants } from "@vanilla-extract/css";

export const dots = styleVariants(
  { S: "S", M: "M" } as const satisfies Record<MoonGlyphSize, MoonGlyphSize>,
  (size) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.scale.component.checkDots.gap[size],
    verticalAlign: "middle",
  }),
);
