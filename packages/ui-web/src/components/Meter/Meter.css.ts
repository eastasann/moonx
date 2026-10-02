import { STATUS_LIGHT_VARIANTS, type StatusLightVariant } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { vars } from "../../theme";
import { strongColor } from "../StatusLight/StatusLight.css";

export const meter = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  color: vars.color.text.primary,
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  lineHeight: vars.typography.label.lineHeight,
});

export const header = style({
  display: "flex",
  justifyContent: "space-between",
  gap: vars.space["200"],
});

export const description = style({
  fontFamily: vars.typography.number.fontFamily,
  fontWeight: vars.typography.number.fontWeight,
  fontVariantNumeric: vars.font.numeric.tabular,
  color: vars.color.text.secondary,
});

export const band = recipe({
  base: {
    display: "flex",
    gap: vars.space["25"],
    overflow: "hidden",
    width: "100%",
    background: vars.color.control.track,
    borderRadius: vars.radius.pill,
  },
  variants: {
    size: {
      S: { height: vars.scale.component.meter.thickness.S },
      M: { height: vars.scale.component.meter.thickness.M },
      L: { height: vars.scale.component.meter.thickness.L },
      XL: { height: vars.scale.component.meter.thickness.XL },
    },
  },
  defaultVariants: { size: "M" },
});

export const segment = recipe({
  base: { flexShrink: 1, minWidth: 0, height: "100%" },
  variants: {
    variant: Object.fromEntries(
      STATUS_LIGHT_VARIANTS.map((v) => [v, { background: strongColor[v] }]),
    ) as Record<StatusLightVariant, { background: string }>,
  },
});

export const legend = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space["100"],
  columnGap: vars.space["300"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const legendItem = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["100"],
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
});

export const legendValue = style({
  fontVariantNumeric: vars.font.numeric.tabular,
  color: vars.color.text.secondary,
});

export const swatch = recipe({
  base: {
    flexShrink: 0,
    width: vars.scale.component["status-light"]["dot-size"].S,
    height: vars.scale.component["status-light"]["dot-size"].S,
    borderRadius: vars.radius.pill,
  },
  variants: {
    variant: Object.fromEntries(
      STATUS_LIGHT_VARIANTS.map((v) => [v, { background: strongColor[v] }]),
    ) as Record<StatusLightVariant, { background: string }>,
  },
});

export type MeterVariants = NonNullable<RecipeVariants<typeof band>>;
