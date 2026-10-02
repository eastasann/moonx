import { keyframes, style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const slide = keyframes({
  from: { insetInlineStart: "-40%" },
  to: { insetInlineStart: "100%" },
});

export const progressBar = style({
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

export const valueLabel = style({
  fontFamily: vars.typography.number.fontFamily,
  fontWeight: vars.typography.number.fontWeight,
  fontFeatureSettings: vars.font.numeric.tabular,
  fontVariantNumeric: vars.font.numeric.tabular,
  color: vars.color.text.secondary,
});

export const track = recipe({
  base: {
    position: "relative",
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

export const fill = style({
  height: "100%",
  background: vars.color.control["track-fill"],
  borderRadius: vars.radius.pill,
  transition: `width ${vars.motion.transition.expand}`,
  "@media": { [reducedMotion]: { transition: "none" } },
});

/**
 * Keeps sliding under reduced motion: the movement is the only signal that work is in progress,
 * and a static bar would read as a stalled or half-finished value.
 */
export const fillIndeterminate = style({
  position: "absolute",
  top: 0,
  width: "40%",
  animation: `${slide} ${vars.motion.loop.indeterminate} linear infinite`,
});

export type ProgressBarVariants = NonNullable<RecipeVariants<typeof track>>;
