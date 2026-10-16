import { type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";

export const mark = style({
  display: "inline-block",
  flexShrink: 0,
  overflow: "visible",
});

/**
 * The colours of the marks (06 color.fau): Done / Partial / Not started share Fact /
 * Assumption / Unknown's (4.4「状態の形の共有」). Empty's dotted ring takes its label colour,
 * since its strong colour is the track's on purpose.
 */
export const color = styleVariants({
  fact: { color: vars.color.fau.fact.strong },
  assumption: { color: vars.color.fau.assumption.strong },
  unknown: { color: vars.color.fau.unknown.strong },
  unclassified: { color: vars.color.fau.unclassified.strong },
  empty: { color: vars.color.fau.empty.fg },
});

/** The ring and the dots stay one hairline wide at every size. */
export const line = style({
  fill: "none",
  stroke: "currentColor",
  strokeWidth: vars.borderWidth.strong,
  vectorEffect: "non-scaling-stroke",
});

export const lit = style({ fill: "currentColor" });

const sized = Object.fromEntries(sizes.map((size) => [size, size])) as Record<
  Size,
  Size
>;

/** The mark's size: StatusLight's dot at each step; MoonGlyph uses S and M (06 status-light). */
export const dot = styleVariants(sized, (size) => ({
  width: vars.scale.component.statusLight.dotSize[size],
  height: vars.scale.component.statusLight.dotSize[size],
}));

/**
 * The ring around the current question's dot (11 on a phone, design-spec 4.5): a hairline
 * circle a little outside the moon, in the ink of the text.
 */
export const current = style({
  display: "inline-flex",
  flexShrink: 0,
  padding: vars.space["50"],
  border: `${vars.borderWidth.strong} solid ${vars.color.text.primary}`,
  borderRadius: vars.radius.pill,
});
