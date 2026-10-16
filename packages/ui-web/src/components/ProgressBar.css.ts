import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { keyframes, style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { reducedMotion } from "../styles/helpers";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

/**
 * Label above the bar, its value at the end of the same line (Spectrum's layout). Without
 * either, the bar is the only row, with no gap above it.
 */
export const root = recipe({
  base: {
    display: "grid",
    gridTemplateColumns: "1fr auto",
    columnGap: vars.space["200"],
    width: "100%",
    fontFamily: vars.font.family.body,
    lineHeight: vars.typography.label.lineHeight,
    color: vars.color.text.primary,
  },
  variants: {
    hasTextRow: {
      true: {
        gridTemplateAreas: '"label value" "track track"',
        rowGap: vars.space["75"],
      },
      false: { gridTemplateAreas: '"track track"' },
    },
  },
});

/** ProgressBar shares the Meter's tokens: Spectrum 2 sizes both bars alike (06 meter). */
export const size = styleVariants(sized, (step) => ({
  fontSize: vars.scale.component.meter.fontSize[step],
}));

export const label = style({
  gridArea: "label",
  fontWeight: vars.typography.label.fontWeight,
  minWidth: 0,
});

export const value = style({
  gridArea: "value",
  fontFamily: vars.font.family.mono,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.text.secondary,
});

export const track = styleVariants(sized, (step) => ({
  gridArea: "track",
  position: "relative",
  height: vars.scale.component.meter.thickness[step],
  overflow: "hidden",
  borderRadius: vars.radius.pill,
  background: vars.color.control.track,
}));

export const fill = style({
  height: "100%",
  borderRadius: vars.radius.pill,
  background: vars.color.control.trackFill,
});

const sweep = keyframes({
  from: { transform: "translateX(-100%)" },
  to: { transform: "translateX(250%)" },
});

/** An indeterminate bar: a short fill that sweeps across; still when motion is reduced. */
export const indeterminate = style({
  position: "absolute",
  insetBlock: 0,
  width: "40%",
  borderRadius: vars.radius.pill,
  background: vars.color.control.trackFill,
  animation: `${sweep} ${vars.motion.loop.indeterminate} ease-in-out infinite`,
  "@media": {
    [reducedMotion]: { animation: "none", transform: "translateX(75%)" },
  },
});
