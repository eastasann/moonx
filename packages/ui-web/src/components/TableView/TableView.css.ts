import { globalStyle, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { atLeastTarget, targetMin } from "../_internal/target";

/** Rows and cells sit inside a clipped table, so the ring is drawn inward. */
const insetFocusRing = {
  ...focusRing,
  outlineOffset: `calc(-1 * ${vars["border-width"]["focus-ring"]})`,
} as const;

const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;

function byDensity<T>(make: (d: "compact" | "regular" | "spacious") => T) {
  return { compact: make("compact"), regular: make("regular"), spacious: make("spacious") };
}

export const table = recipe({
  base: {
    color: vars.color.text.primary,
    fontFamily: vars.typography.table.fontFamily,
    fontSize: vars.typography.table.fontSize,
    fontWeight: vars.typography.table.fontWeight,
    lineHeight: vars.typography.table.lineHeight,
    outline: "none",
    selectors: { "&[data-focus-visible]": focusRing },
  },
  variants: {
    layout: {
      table: { display: "table", width: "100%", borderCollapse: "collapse" },
      cards: { display: "block", width: "100%" },
    },
  },
  defaultVariants: { layout: "table" },
});

export const header = recipe({
  base: {},
  variants: {
    layout: {
      table: { background: vars.color.surface.sunken, borderBlockEnd: hairline },
      cards: {
        display: "block",
        paddingBlockEnd: vars.space["100"],
      },
    },
  },
  defaultVariants: { layout: "table" },
});

/** RAC renders the header row without a class of its own, so the cards layout reaches it from here. */
globalStyle(`${header.classNames.variants.layout.cards} tr`, {
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space["100"],
});

/** In cards the column labels are repeated inside each card, so only sort controls stay visible. */
export const column = recipe({
  base: {
    textAlign: "start",
    color: vars.color.text.secondary,
    fontFamily: vars.typography["table-header"].fontFamily,
    fontSize: vars.typography["table-header"].fontSize,
    fontWeight: vars.typography["table-header"].fontWeight,
    letterSpacing: vars.typography["table-header"].letterSpacing,
    lineHeight: vars.typography["table-header"].lineHeight,
    outline: "none",
    selectors: {
      "&[data-focus-visible]": insetFocusRing,
      "&[data-hovered]": { color: vars.color.text.primary },
    },
  },
  variants: {
    density: byDensity((d) => ({
      paddingInline: vars.density[d]["cell-padding-x"],
      paddingBlock: vars.density[d]["cell-padding-y"],
    })),
    layout: {
      table: {},
      cards: {
        display: "block",
        background: vars.color.control.secondary,
        borderRadius: vars.radius.chip,
      },
    },
    numeric: { true: { textAlign: "end" }, false: {} },
    sortable: { true: { cursor: "pointer" }, false: {} },
    inCardsVisible: { true: {}, false: {} },
    selection: { true: { width: vars.scale.component["target-min"] }, false: {} },
  },
  compoundVariants: [
    {
      variants: { sortable: true },
      style: { minHeight: targetMin },
    },
    {
      variants: { sortable: true, layout: "table" },
      style: { height: targetMin },
    },
    {
      variants: { layout: "cards", inCardsVisible: false },
      style: {
        position: "absolute",
        width: 1,
        height: 1,
        margin: -1,
        padding: 0,
        overflow: "hidden",
        clip: "rect(0 0 0 0)",
        whiteSpace: "nowrap",
      },
    },
  ],
  defaultVariants: {
    density: "regular",
    layout: "table",
    numeric: false,
    sortable: false,
    inCardsVisible: false,
    selection: false,
  },
});

export const columnContent = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
});

export const sortIcon = recipe({
  base: {
    flexShrink: 0,
    width: vars.scale.component.icon.size.XS,
    height: vars.scale.component.icon.size.XS,
    transition: `opacity ${vars.motion.transition.hover}`,
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: { active: { true: { opacity: 1 }, false: { opacity: 0 } } },
  defaultVariants: { active: false },
});

export const body = recipe({
  base: {},
  variants: {
    layout: { table: {}, cards: { display: "flex", flexDirection: "column" } },
    density: byDensity((d) => ({ rowGap: vars.density[d]["list-gap"] })),
  },
  defaultVariants: { density: "regular", layout: "table" },
});

export const row = recipe({
  base: {
    outline: "none",
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-selected]": { background: vars.color.surface.selected },
      "&[data-focus-visible]": insetFocusRing,
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    density: byDensity((d) => ({ minHeight: atLeastTarget(vars.density[d]["row-height"]) })),
    layout: {
      table: { borderBlockEnd: hairline },
      cards: {
        display: "flex",
        flexDirection: "column",
        background: vars.color.surface.raised,
        border: hairline,
        borderRadius: vars.radius.card,
      },
    },
  },
  compoundVariants: (["compact", "regular", "spacious"] as const).map((d) => ({
    variants: { density: d, layout: "table" as const },
    // A table row ignores min-height; height acts as its minimum.
    style: { height: atLeastTarget(vars.density[d]["row-height"]) },
  })),
  defaultVariants: { density: "regular", layout: "table" },
});

export const cell = recipe({
  base: { outline: "none", selectors: { "&[data-focus-visible]": insetFocusRing } },
  variants: {
    density: byDensity((d) => ({
      paddingInline: vars.density[d]["cell-padding-x"],
      paddingBlock: vars.density[d]["cell-padding-y"],
    })),
    layout: {
      table: { verticalAlign: "middle" },
      cards: {
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
        gap: vars.space["200"],
        selectors: {
          "&::before": {
            content: "attr(data-label)",
            flexShrink: 0,
            color: vars.color.text.secondary,
            fontSize: vars.typography["label-sm"].fontSize,
            fontWeight: vars.typography["label-sm"].fontWeight,
            lineHeight: vars.typography["label-sm"].lineHeight,
          },
        },
      },
    },
    numeric: {
      true: { textAlign: "end", fontVariantNumeric: vars.typography.number.fontVariantNumeric },
      false: {},
    },
  },
  defaultVariants: { density: "regular", layout: "table", numeric: false },
});

export const selectionCell = recipe({
  base: {},
  variants: { layout: { table: { width: vars.scale.component["target-min"] }, cards: {} } },
  defaultVariants: { layout: "table" },
});

export const checkbox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  outline: "none",
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
});

export const checkboxBox = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.checkbox["control-size"].M,
  height: vars.scale.component.checkbox["control-size"].M,
  border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
  background: vars.color.surface.raised,
  color: vars.color.control["on-primary"],
  selectors: {
    [`${checkbox}[data-selected] &, ${checkbox}[data-indeterminate] &`]: {
      background: vars.color.control.primary,
      borderColor: vars.color.control.primary,
    },
    [`${checkbox}[data-focus-visible] &`]: focusRing,
    [`${checkbox}[data-disabled] &`]: {
      background: vars.color.control.disabled,
      borderColor: vars.color.border.hairline,
    },
  },
});

export const checkboxIcon = style({
  width: vars.scale.component.icon.size.XS,
  height: vars.scale.component.icon.size.XS,
});

export const empty = style({
  padding: vars.space["400"],
  textAlign: "center",
  color: vars.color.text.secondary,
});
