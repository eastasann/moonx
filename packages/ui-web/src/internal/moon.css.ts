import { type MoonGlyphSize, type Size, sizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";

export const mark = style({
  display: "inline-block",
  flexShrink: 0,
  overflow: "visible",
});

/**
 * The colours of the marks (06 color.fau): the moons are ink whatever the state, since
 * the shape tells them apart (2026-10-17, docs/mockups); Unclassified's diamond is amber.
 * Empty's dotted ring takes its label colour, since its strong colour is the track's on
 * purpose.
 */
export const color = styleVariants({
  fact: { color: vars.color.text.primary },
  assumption: { color: vars.color.text.primary },
  unknown: { color: vars.color.text.primary },
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

/** The mark's size at StatusLight's steps (06 status-light.dot-size). */
export const dot = styleVariants(sized, (size) => ({
  width: vars.scale.component.statusLight.dotSize[size],
  height: vars.scale.component.statusLight.dotSize[size],
}));

/** MoonGlyph's own S and M (06 moon-glyph.size). */
export const glyph = styleVariants(
  { S: "S", M: "M" } as const satisfies Record<MoonGlyphSize, MoonGlyphSize>,
  (size) => ({
    width: vars.scale.component.moonGlyph.size[size],
    height: vars.scale.component.moonGlyph.size[size],
  }),
);

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

/**
 * The colour of a state's label beside its mark, as StatusLight's (06 color.fau.*.fg):
 * the check states take their F/A/U counterpart's, Unclassified the amber of attention.
 */
export const labelColor = styleVariants({
  fact: { color: vars.color.fau.fact.fg },
  done: { color: vars.color.fau.fact.fg },
  assumption: { color: vars.color.fau.assumption.fg },
  partial: { color: vars.color.fau.assumption.fg },
  unknown: { color: vars.color.fau.unknown.fg },
  "not-started": { color: vars.color.fau.unknown.fg },
  unclassified: { color: vars.color.fau.unclassified.fg },
  empty: { color: vars.color.fau.empty.fg },
});
