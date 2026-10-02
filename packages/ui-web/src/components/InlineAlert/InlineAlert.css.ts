import { INLINE_ALERT_VARIANTS, type InlineAlertVariant } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";

const colors = Object.fromEntries(
  INLINE_ALERT_VARIANTS.map((v) => [
    v,
    { background: vars.color[v].bg, borderColor: vars.color[v].strong },
  ]),
) as Record<InlineAlertVariant, { background: string; borderColor: string }>;

export const inlineAlert = recipe({
  base: {
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space["200"],
    padding: vars.space["300"],
    borderWidth: vars["border-width"].strong,
    borderStyle: "solid",
    borderRadius: vars.radius.control,
    color: vars.color.text.primary,
    fontFamily: vars.typography["body-sm"].fontFamily,
    fontSize: vars.typography["body-sm"].fontSize,
    lineHeight: vars.typography["body-sm"].lineHeight,
  },
  variants: { variant: colors },
  defaultVariants: { variant: "informative" },
});

export const iconColor = recipe({
  base: {
    flexShrink: 0,
    width: vars.scale.component.icon.size.M,
    height: vars.scale.component.icon.size.M,
    strokeWidth: vars.icon["stroke-width"],
  },
  variants: {
    variant: Object.fromEntries(
      INLINE_ALERT_VARIANTS.map((v) => [v, { color: vars.color[v].fg }]),
    ) as Record<InlineAlertVariant, { color: string }>,
  },
});

export const body = style({ display: "flex", flexDirection: "column", gap: vars.space["50"] });

export const heading = style({
  fontWeight: vars.typography.label.fontWeight,
  lineHeight: vars.typography.label.lineHeight,
});

export type InlineAlertVariants = NonNullable<RecipeVariants<typeof inlineAlert>>;
