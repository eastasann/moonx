import { vars } from "@moonx/ui-tokens";
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
