import { type Density, densities, vars } from "@moonx/ui-tokens";
import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

// The density's measures, set once on the table and read by its rows and cells.
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

/** A table wider than a tablet's column scrolls inside itself; the page does not (4.3). */
export const scroller = style({ maxWidth: "100%", overflowX: "auto" });

export const table = style({
  width: "100%",
  borderCollapse: "collapse",
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  outline: "none",
});

export const headerRow = style({ background: vars.color.surface.sunken });

const alignNumeric = {
  true: { textAlign: "end", fontVariantNumeric: "tabular-nums" },
  false: { textAlign: "start" },
} as const;

export const headerCell = recipe({
  base: {
    ...typography("tableHeader"),
    height: rowHeight,
    paddingInline: padX,
    paddingBlock: padY,
    color: vars.color.text.secondary,
    whiteSpace: "nowrap",
    outline: "none",
    selectors: {
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      },
    },
  },
  variants: { numeric: alignNumeric },
});

/**
 * Rows are divided by hairlines (design-spec 4.4). A chosen row has the selected surface
 * and the indicator line at its start (06 surface.selected).
 */
export const row = recipe({
  base: {
    ...hoverTransition,
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
    },
  },
  variants: {
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
    isEditing: {
      true: { background: vars.color.surface.raised, cursor: "auto" },
      false: {},
    },
  },
});

export const cell = recipe({
  base: {
    ...typography("table"),
    // A row is a target too: never lower than the scale's minimum (design-spec 4.3).
    height: atLeastTarget(rowHeight),
    paddingInline: padX,
    paddingBlock: padY,
    verticalAlign: "middle",
    overflowWrap: "break-word",
    outline: "none",
    selectors: {
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      },
    },
  },
  variants: {
    numeric: {
      true: {
        ...typography("tableNumber"),
        textAlign: "end",
        fontVariantNumeric: "tabular-nums",
      },
      false: {},
    },
  },
});

/** The last cell of a row that opens something: its content, then ›. */
export const withChevron = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
});

export const chevronContent = style({ flex: 1, minWidth: 0 });

/** An edited cell's input fills the cell. */
export const editing = style({ display: "flex", flexDirection: "column" });

export const empty = style({
  paddingInline: padX,
  paddingBlock: vars.space["400"],
});

/** A phone's rows: cards in one column (design-spec 4.3・4.5). */
export const cards = style({
  display: "flex",
  flexDirection: "column",
  gap: listGap,
  outline: "none",
});

export const card = recipe({
  base: {
    ...hoverTransition,
    display: "flex",
    alignItems: "center",
    gap: vars.space["200"],
    padding: padX,
    border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    borderRadius: vars.radius.card,
    background: vars.color.surface.raised,
    color: vars.color.text.primary,
    outline: "none",
    selectors: {
      "&[data-selected]": {
        boxShadow: `inset ${vars.borderWidth.selectedIndicator} 0 0 ${vars.color.control.primary}`,
      },
      "&[data-focus-visible]": focusRing,
    },
  },
  variants: {
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

export const cardBody = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  flex: 1,
  minWidth: 0,
});

export const cardTitle = style({
  ...typography("label"),
  overflowWrap: "break-word",
});

export const cardValues = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  margin: 0,
});

/** A value's label and the value on one line, the value at the end. */
export const cardValue = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: vars.space["200"],
});

export const cardLabel = style({
  ...typography("bodySm"),
  color: vars.color.text.secondary,
});

export const cardData = recipe({
  base: {
    ...typography("table"),
    margin: 0,
    minWidth: 0,
    textAlign: "end",
    overflowWrap: "break-word",
  },
  variants: {
    numeric: {
      true: {
        ...typography("tableNumber"),
        fontVariantNumeric: "tabular-nums",
      },
      false: {},
    },
  },
});

export const chevron = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.text.secondary,
});
