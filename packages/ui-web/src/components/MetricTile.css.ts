import { vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { narrowQuery, typography } from "../styles/helpers";

const measures = vars.scale.component.metricGroup;
const hairline = `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`;

/** A band's tiles 2×2, as a phone draws them (d1-moon.html at 390px). */
const bandSquare = {
  gridAutoFlow: "row",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
} as const;

/**
 * `band`: one row of equal columns between a line (border.default) and a hairline; 2×2 on
 * a phone and in a `squareBand` (d1-moon.html .numbers). `compact`: columns as wide as their tiles, no lines
 * (s19-decision.html .kn). `column`: one under another, a hairline between them
 * (s17-costs.html .tot). `pair`: 2×2 at every width, smaller, for a detail beside a list
 * (s06-ideas.html .nums).
 */
export const group = styleVariants({
  band: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "minmax(0, 1fr)",
    borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
    borderBottom: hairline,
    "@media": { [narrowQuery]: bandSquare },
  },
  compact: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "max-content",
    justifyContent: "start",
    columnGap: measures.compactColumnGap,
    rowGap: vars.space["200"],
    "@media": {
      [narrowQuery]: {
        gridAutoFlow: "row",
        gridTemplateColumns: "repeat(2, minmax(0, max-content))",
      },
    },
  },
  column: {
    display: "flex",
    flexDirection: "column",
  },
  pair: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
    borderBottom: hairline,
  },
});

/**
 * A band 2×2 at any width: beside a desktop's docked panel that leaves the body too narrow
 * for the row, where a phone's 2×2 keeps the numbers whole (design-spec 4.1 A).
 */
export const squareBand = style(bandSquare);

/** A band's tiles in its 2×2: a cross of hairlines (d1-moon.html at 390px). */
const squareTile = {
  paddingBlock: measures.narrowPaddingY,
  paddingInlineEnd: measures.narrowPaddingEnd,
  selectors: {
    "& + &": { paddingInlineStart: 0, borderInlineStart: "none" },
    "&:nth-child(even)": {
      paddingInlineStart: measures.narrowPaddingStart,
      borderInlineStart: hairline,
    },
    "&:nth-child(n + 3)": { borderBlockStart: hairline },
  },
} as const;

/**
 * The tiles of a band are set apart by hairlines, a cross of them on a phone and in a
 * `squareBand`.
 */
export const tile = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: vars.space["75"],
    minWidth: 0,
    margin: 0,
  },
  variants: {
    variant: {
      none: {},
      band: {
        paddingBlockStart: measures.paddingTop,
        paddingBlockEnd: measures.paddingBottom,
        paddingInlineEnd: measures.paddingInline,
        selectors: {
          "& + &": {
            paddingInlineStart: measures.paddingInline,
            borderInlineStart: hairline,
          },
        },
        "@media": { [narrowQuery]: squareTile },
      },
      compact: { gap: measures.compactRowGap },
      column: {
        gap: 0,
        paddingBlock: measures.columnPaddingY,
        selectors: {
          "&:not(:last-child)": { borderBlockEnd: hairline },
        },
      },
      pair: {
        gap: 0,
        paddingBlock: measures.pairPaddingY,
        selectors: {
          "&:nth-child(even)": {
            paddingInlineStart: measures.pairPaddingStart,
            borderInlineStart: hairline,
          },
          "&:nth-child(n + 3)": { borderBlockStart: hairline },
        },
      },
    },
    /** In a `squareBand`. */
    isSquare: { true: {}, false: {} },
  },
  compoundVariants: [
    { variants: { variant: "band", isSquare: true }, style: squareTile },
  ],
});

export const label = recipe({
  base: { color: vars.color.text.secondary },
  variants: {
    variant: {
      none: typography("caption"),
      band: typography("caption"),
      compact: typography("captionSm"),
      column: typography("caption"),
      pair: typography("captionSm"),
    },
  },
});

export const value = recipe({
  base: {
    margin: 0,
    color: vars.color.text.primary,
    fontVariantNumeric: "tabular-nums",
  },
  variants: {
    variant: {
      none: typography("metric"),
      band: typography("metric"),
      compact: typography("metricSm"),
      column: typography("metricColumn"),
      pair: typography("metricPair"),
    },
  },
});

/**
 * A number stays on one line (d1-moon.html .metric .value); only one wider than its tile
 * breaks, so the page never scrolls sideways (design-spec 4.3・4.5).
 */
export const number = style({ overflowWrap: "anywhere" });

export const unit = recipe({
  base: { whiteSpace: "nowrap" },
  variants: {
    variant: {
      none: { ...typography("metricUnit"), color: vars.color.text.secondary },
      band: { ...typography("metricUnit"), color: vars.color.text.secondary },
      // s19's and s06's units are the numbers' size and colour ("14.4+ / day").
      compact: {},
      pair: {},
      // s17's are small and monospaced beside the total ("₱104.00+ / sale").
      column: {
        ...typography("caption"),
        fontFamily: vars.font.family.mono,
        color: vars.color.text.secondary,
      },
    },
  },
});

export const placeholder = style({
  ...typography("body"),
  margin: 0,
  color: vars.color.text.tertiary,
  overflowWrap: "break-word",
});

const supplementBase = {
  ...typography("captionSm"),
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["75"],
  margin: 0,
} as const;

export const supplement = styleVariants({
  neutral: { ...supplementBase, color: vars.color.text.tertiary },
  notice: { ...supplementBase, color: vars.color.notice.fg },
});
