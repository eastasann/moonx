import { type Density, densities, vars } from "@moonx/ui-tokens";
import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

const rowHeight = createVar();
const padX = createVar();
const padY = createVar();
const listGap = createVar();

/** compact / regular / spacious (06 semantic.density; design-spec 4.4). */
export const density = styleVariants(
  Object.fromEntries(densities.map((step) => [step, step])) as Record<
    Density,
    Density
  >,
  (step) => ({
    vars: {
      [rowHeight]: vars.density[step].rowHeight,
      [padX]: vars.density[step].cellPaddingX,
      [padY]: vars.density[step].cellPaddingY,
      [listGap]: vars.density[step].listGap,
    },
  }),
);

export const list = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    color: vars.color.text.primary,
    outline: "none",
  },
  variants: {
    isCard: { true: { gap: listGap }, false: {} },
  },
});

/**
 * Rows divided by hairlines, at least the density's row height. A chosen row has the
 * selected surface and the indicator line at its start (06 surface.selected).
 */
export const item = recipe({
  base: {
    ...hoverTransition,
    ...typography("body"),
    display: "flex",
    alignItems: "center",
    gap: vars.space["200"],
    // A row is a target too: never lower than the scale's minimum (design-spec 4.3).
    minHeight: atLeastTarget(rowHeight),
    paddingInline: padX,
    paddingBlock: padY,
    borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    outline: "none",
    selectors: {
      "&[data-selected]": {
        background: vars.color.surface.selected,
        boxShadow: `inset ${vars.borderWidth.selectedIndicator} 0 0 ${vars.color.control.primary}`,
      },
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      },
      "&[data-disabled]": { color: vars.color.text.disabled },
    },
  },
  variants: {
    // An item of the cards layout: framed and raised, apart from the next one.
    isCard: {
      true: {
        border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
        borderRadius: vars.radius.card,
        background: vars.color.surface.raised,
      },
      false: {},
    },
    isActionable: {
      true: {
        cursor: "pointer",
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
          "&[data-pressed]": { background: vars.color.surface.hover },
        },
      },
      false: {},
    },
  },
});

export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["50"],
  flex: 1,
  minWidth: 0,
  overflowWrap: "break-word",
});

export const chevron = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.text.secondary,
});

export const empty = style({
  paddingInline: padX,
  paddingBlock: vars.space["400"],
});
