import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

export const meter = style({
  margin: 0,
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
  fontFamily: vars.font.family.body,
  lineHeight: vars.typography.label.lineHeight,
  color: vars.color.text.primary,
});

/** The label and legend text follow the bar's size, as ProgressBar's do (06 meter). */
export const size = styleVariants(sized, (step) => ({
  fontSize: vars.scale.component.meter.fontSize[step],
}));

export const label = style({ fontWeight: vars.typography.label.fontWeight });

/**
 * The band: its segments side by side, a hairline apart so two shades never run into
 * each other. Without any count it is the empty track.
 */
export const band = styleVariants(sized, (step) => ({
  display: "flex",
  gap: vars.borderWidth.hairline,
  height: vars.scale.component.meter.thickness[step],
  overflow: "hidden",
  borderRadius: vars.radius.pill,
  background: vars.color.control.track,
}));

/**
 * The shade of each state (06 color.fau.*.strong): Unknown is hatched, Empty is the
 * track itself, Unclassified the amber of attention (design-spec 4.4・4.5).
 */
export const shade = styleVariants({
  fact: { background: vars.color.fau.fact.strong },
  assumption: { background: vars.color.fau.assumption.strong },
  unknown: {
    background: `repeating-linear-gradient(135deg, ${vars.color.fau.unknown.strong} 0 ${vars.borderWidth.focusRing}, transparent ${vars.borderWidth.focusRing} ${vars.space["75"]})`,
    boxShadow: `inset 0 0 0 ${vars.borderWidth.hairline} ${vars.color.fau.unknown.strong}`,
  },
  unclassified: { background: vars.color.fau.unclassified.strong },
  empty: { background: vars.color.fau.empty.strong },
});

/**
 * Empty's swatch is the track's colour, so the legend draws its edge: alone on the page it
 * would not show (the band shows it by its neighbours).
 */
export const swatchEdge = style({
  boxShadow: `inset 0 0 0 ${vars.borderWidth.strong} ${vars.color.border.strong}`,
});

export const legend = style({
  display: "flex",
  flexWrap: "wrap",
  columnGap: vars.space["300"],
  rowGap: vars.space["75"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const entry = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
});

/**
 * The swatch is the band's segment in small, the size of the marks beside labels at the
 * meter's step (06 component.status-light.dot-size).
 */
export const swatch = styleVariants(sized, (step) => ({
  display: "inline-block",
  flexShrink: 0,
  width: vars.scale.component.statusLight.dotSize[step],
  height: vars.scale.component.statusLight.dotSize[step],
  borderRadius: vars.radius.chip,
}));

export const count = style({
  fontFamily: vars.font.family.mono,
  fontVariantNumeric: "tabular-nums",
});

export const detail = style({ color: vars.color.text.secondary });
