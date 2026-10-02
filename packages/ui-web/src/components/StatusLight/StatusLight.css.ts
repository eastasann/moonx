import {
  CHECK_VARIANTS,
  FAU_VARIANTS,
  STATUS_VARIANTS,
  type StatusLightVariant,
} from "@moonx/ui-tokens";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

/** The dot color of every StatusLight variant; Meter segments reuse it so both read the same. */
export const strongColor: Record<StatusLightVariant, string> = {
  ...Object.fromEntries(STATUS_VARIANTS.map((v) => [v, vars.color[v].strong])),
  ...Object.fromEntries(FAU_VARIANTS.map((v) => [v, vars.color.fau[v].strong])),
  ...Object.fromEntries(CHECK_VARIANTS.map((v) => [v, vars.color.check[v].strong])),
} as Record<StatusLightVariant, string>;

const dots = Object.fromEntries(
  Object.entries(strongColor).map(([variant, color]) => [variant, { background: color }]),
) as Record<StatusLightVariant, { background: string }>;

export const statusLight = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["100"],
    color: vars.color.text.primary,
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.label.lineHeight,
  },
  variants: {
    size: {
      S: { fontSize: vars.scale["font-size"]["75"] },
      M: { fontSize: vars.scale["font-size"]["100"] },
      L: { fontSize: vars.scale["font-size"]["200"] },
      XL: { fontSize: vars.scale["font-size"]["300"] },
    },
  },
  defaultVariants: { size: "M" },
});

export const dot = recipe({
  base: {
    flexShrink: 0,
    borderRadius: vars.radius.pill,
  },
  variants: {
    variant: dots,
    size: {
      S: {
        width: vars.scale.component["status-light"]["dot-size"].S,
        height: vars.scale.component["status-light"]["dot-size"].S,
      },
      M: {
        width: vars.scale.component["status-light"]["dot-size"].M,
        height: vars.scale.component["status-light"]["dot-size"].M,
      },
      L: {
        width: vars.scale.component["status-light"]["dot-size"].L,
        height: vars.scale.component["status-light"]["dot-size"].L,
      },
      XL: {
        width: vars.scale.component["status-light"]["dot-size"].XL,
        height: vars.scale.component["status-light"]["dot-size"].XL,
      },
    },
  },
  defaultVariants: { size: "M" },
});

export type StatusLightVariants = NonNullable<RecipeVariants<typeof statusLight>>;
