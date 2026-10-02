import { type BadgeVariant, DECISION_VARIANTS, STATUS_VARIANTS } from "@moonx/ui-tokens";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

const colors = {
  ...Object.fromEntries(
    STATUS_VARIANTS.map((v) => [v, { background: vars.color[v].bg, color: vars.color[v].fg }]),
  ),
  ...Object.fromEntries(
    DECISION_VARIANTS.map((v) => [
      v,
      { background: vars.color.decision[v].bg, color: vars.color.decision[v].fg },
    ]),
  ),
} as Record<BadgeVariant, { background: string; color: string }>;

export const badge = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: vars.radius.chip,
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.label.lineHeight,
    whiteSpace: "nowrap",
  },
  variants: {
    variant: colors,
    size: {
      S: {
        paddingBlock: vars.space["25"],
        paddingInline: vars.space["75"],
        fontSize: vars.scale["font-size"]["50"],
      },
      M: {
        paddingBlock: vars.space["50"],
        paddingInline: vars.space["100"],
        fontSize: vars.scale["font-size"]["75"],
      },
      L: {
        paddingBlock: vars.space["75"],
        paddingInline: vars.space["200"],
        fontSize: vars.scale["font-size"]["100"],
      },
      XL: {
        paddingBlock: vars.space["85"],
        paddingInline: vars.space["300"],
        fontSize: vars.scale["font-size"]["200"],
      },
    },
  },
  defaultVariants: { variant: "neutral", size: "M" },
});

export type BadgeVariants = NonNullable<RecipeVariants<typeof badge>>;
