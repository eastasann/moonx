import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

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

/** The block's small heading above the band (d1-moon.html: "Fact / Assumption / Unknown"). */
export const label = style({
  ...typography("headingLabel"),
  color: vars.color.text.secondary,
});

/**
 * The band: its segments side by side, a little apart so two shades never run into each
 * other (d1-moon.html .fau-bar). Without any count it is the empty track.
 */
export const band = styleVariants(sized, (step) => ({
  display: "flex",
  gap: vars.scale.component.meter.gap,
  height: vars.scale.component.meter.thickness[step],
  overflow: "hidden",
  borderRadius: vars.scale.component.meter.radius,
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
  columnGap: vars.scale.component.meter.legendColumnGap,
  rowGap: vars.scale.component.meter.legendRowGap,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A name in secondary text; Unclassified's whole entry in the amber of attention. */
export const entry = styleVariants(
  { other: vars.color.text.secondary, unclassified: vars.color.notice.fg },
  (color) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["85"],
    color,
  }),
);

/** The band's segment in small (d1-moon.html .legend i). */
export const swatch = style({
  display: "inline-block",
  flexShrink: 0,
  width: vars.scale.component.meter.swatchSize,
  height: vars.scale.component.meter.swatchSize,
  borderRadius: vars.scale.component.meter.swatchRadius,
});

/** The count in monospaced ink; inside Unclassified's entry, its amber. */
export const count = style({
  fontFamily: vars.font.family.mono,
  fontWeight: vars.typography.number.fontWeight,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.text.primary,
  selectors: { [`${entry.unclassified} &`]: { color: "inherit" } },
});

export const detail = style({
  color: vars.color.text.secondary,
  selectors: { [`${entry.unclassified} &`]: { color: "inherit" } },
});
