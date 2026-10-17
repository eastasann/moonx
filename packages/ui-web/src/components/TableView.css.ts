import { type Density, densities, vars } from "@moonx/ui-tokens";
import {
  createVar,
  globalStyle,
  style,
  styleVariants,
} from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { frame } from "../internal/field.css";
import { cellPaddingX as padX } from "../internal/tableCell.css";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

const measures = vars.scale.component.tableView;

// The density's measures, set once on the table and read by its rows and cells.
const rowHeight = createVar();

/** compact / regular / spacious (06 component.table-view; design-spec 4.4). */
export const density = styleVariants(
  Object.fromEntries(densities.map((step) => [step, step])) as Record<
    Density,
    Density
  >,
  (step) => ({
    vars: {
      [rowHeight]: measures.rowHeight[step],
      [padX]: measures.cellPaddingX[step],
    },
  }),
);

/** A table wider than a tablet's column scrolls inside itself; the page does not (4.3). */
export const scroller = style({ maxWidth: "100%", overflowX: "auto" });

/**
 * No ground and a fixed layout: the columns keep the widths of the header's cells, so a
 * row turning into inputs moves neither them nor the table's width (s17-costs.html).
 */
export const table = style({
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
  color: vars.color.text.primary,
  outline: "none",
});

const kinds = {
  mark: {
    width: measures.markWidth,
    paddingInlineStart: measures.markPaddingStart,
    paddingInlineEnd: 0,
  },
  actions: {
    width: measures.actionsWidth,
    paddingInline: 0,
    textAlign: "center",
  },
  header: {},
  numeric: { textAlign: "end" },
  text: {},
} as const;

/** The header: its names in the small medium weight over a line (border.default). */
export const headerCell = recipe({
  base: {
    ...typography("tableHeader"),
    paddingInline: padX,
    paddingBlock: measures.headerPaddingY,
    borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
    color: vars.color.text.secondary,
    textAlign: "start",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    outline: "none",
    selectors: {
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      },
    },
  },
  variants: { kind: kinds },
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
    // An edited row stays white under the pointer (s17-costs.html tr.editing).
    isEditing: {
      true: {
        background: vars.color.surface.raised,
        cursor: "auto",
        selectors: {
          "&[data-hovered], &[data-pressed]": {
            background: vars.color.surface.raised,
          },
        },
      },
      false: {},
    },
  },
});

const rowClass = row.classNames.base;

export const cell = recipe({
  base: {
    ...typography("table"),
    // A row is a target too: never lower than the scale's minimum (design-spec 4.3).
    height: atLeastTarget(rowHeight),
    paddingInline: padX,
    paddingBlock: 0,
    verticalAlign: "middle",
    outline: "none",
    selectors: {
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
      },
    },
  },
  variants: {
    kind: {
      ...kinds,
      header: typography("label"),
      numeric: {
        ...typography("tableNumber"),
        textAlign: "end",
        fontVariantNumeric: "tabular-nums",
      },
    },
  },
});

/**
 * An editable row's value as text on one line, cut with "…" when the column is too narrow
 * for it: the input shows it whole once the row is edited (s17-costs.html). It is cut at
 * the cell's edges, not its padding's, as the mockup's cell is, so a focus ring or a
 * button's hover inside the padding stays whole.
 */
export const value = style({
  minWidth: 0,
  marginInline: `calc(-1 * ${padX})`,
  paddingInline: padX,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

/** A value no edit can show whole wraps instead (7, 28, 15's table; design-spec 4.5). */
export const wrapped = style({ minWidth: 0, overflowWrap: "break-word" });

export const mark = style({ display: "flex", justifyContent: "center" });

/** The last cell of a row that opens something: its content, then ›. */
export const withChevron = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
});

export const chevronContent = style([wrapped, { flex: 1 }]);

/** An edited cell's input fills the cell, which keeps its height. */
export const editing = style({ display: "flex", flexDirection: "column" });

// An edited cell's field takes the cell's type, as the value it replaces (s17-costs.html);
// never below the touch floor (06 field.font-size-min), as in any field. A number keeps its
// place too (NumberField's end frame).
globalStyle(`${editing} ${frame.classNames.base}`, {
  fontSize: `max(1em, ${vars.scale.component.field.fontSizeMin})`,
  fontWeight: "inherit",
});

/**
 * The row's ⋯ with a mouse: out of sight until the row is under the pointer, has focus
 * or has its menu open. On touch (the large scale) it always shows.
 */
export const actions = style({
  display: "inline-flex",
  justifyContent: "center",
  selectors: {
    [`:root[data-scale="medium"] ${rowClass}:not(:hover):not(:focus-within):not(:has([aria-expanded="true"])) &`]:
      { opacity: 0 },
  },
  "@media": {
    "not all and (pointer: coarse)": {
      selectors: {
        [`:root:not([data-scale]) ${rowClass}:not(:hover):not(:focus-within):not(:has([aria-expanded="true"])) &`]:
          { opacity: 0 },
      },
    },
  },
});

export const empty = style({
  paddingInline: padX,
  paddingBlock: vars.space["400"],
});

/** A phone's rows: a line above, hairlines between and under them (s17-costs.html). */
export const lines = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  outline: "none",
});

export const line = recipe({
  base: {
    ...hoverTransition,
    display: "flex",
    alignItems: "center",
    gap: measures.narrowGap,
    minHeight: atLeastTarget(measures.narrowRowMinHeight),
    paddingBlock: measures.narrowRowPaddingY,
    paddingInline: measures.narrowRowPaddingX,
    borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    color: vars.color.text.primary,
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
  },
});

/** The mark beside the name's line (s17-costs.html .cards: the mark in the name's row). */
export const lineMark = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  alignSelf: "flex-start",
  flexShrink: 0,
  width: measures.narrowMarkWidth,
  height: `calc(${vars.typography.label.fontSize} * ${vars.typography.label.lineHeight})`,
});

export const lineBody = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

export const lineTitle = style({
  ...typography("label"),
  overflowWrap: "break-word",
});

export const lineBelow = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
});

/** The one value at the end of the line; an amount in the monospaced face. */
export const lineEnd = recipe({
  base: {
    ...typography("table"),
    flexShrink: 0,
    // The name keeps at least half the line.
    maxWidth: "50%",
    textAlign: "end",
    overflowWrap: "break-word",
  },
  variants: {
    numeric: {
      true: {
        ...typography("rowNumber"),
        fontVariantNumeric: "tabular-nums",
      },
      false: {},
    },
  },
});

export const lineValues = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  margin: 0,
  marginBlockStart: vars.space["75"],
});

/** A value's label and the value on one line, the value at the end. */
export const lineValue = style({
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: vars.space["200"],
});

export const lineLabel = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});

export const lineData = recipe({
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
  color: vars.color.text.tertiary,
});
