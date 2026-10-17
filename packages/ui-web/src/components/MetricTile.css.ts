import { vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { narrowQuery, typography } from "../styles/helpers";

const measures = vars.scale.component.metricGroup;
const hairline = `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`;

/**
 * `band`: one row of equal columns between a line (border.default) and a hairline; 2×2 on
 * a phone (d1-moon.html .numbers). `compact`: columns as wide as their tiles, no lines
 * (s19-decision.html .kn).
 */
export const group = styleVariants({
  band: {
    display: "grid",
    gridAutoFlow: "column",
    gridAutoColumns: "minmax(0, 1fr)",
    borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
    borderBottom: hairline,
    "@media": {
      [narrowQuery]: {
        gridAutoFlow: "row",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
      },
    },
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
});

/** The tiles of a band are set apart by hairlines, a cross of them on a phone. */
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
        "@media": {
          [narrowQuery]: {
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
          },
        },
      },
      compact: { gap: measures.compactRowGap },
    },
  },
});

export const label = recipe({
  base: { color: vars.color.text.secondary },
  variants: {
    variant: {
      none: typography("caption"),
      band: typography("caption"),
      compact: typography("captionSm"),
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
      // s19's units are the numbers' size and colour ("14.4+ / day").
      compact: {},
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
