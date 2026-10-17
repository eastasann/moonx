import { vars } from "@moonx/ui-tokens";
import { createVar, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  narrowQuery,
  typography,
} from "../styles/helpers";

const measures = vars.scale.component.rowList;
const counter = "moonx-row";
const hairline = `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`;

export const list = recipe({
  base: { margin: 0, padding: 0, listStyle: "none", minWidth: 0 },
  variants: {
    ordered: { true: { counterReset: counter }, false: {} },
  },
});

/**
 * A hairline above the first row and under every row (d1-moon.html .rows); an emphasised
 * row is a card instead, with space under it (.next li:first-child).
 */
export const item = recipe({
  base: {
    counterIncrement: counter,
    borderBottom: hairline,
    selectors: { "&:first-child": { borderTop: hairline } },
  },
  variants: {
    isEmphasized: {
      true: {
        marginBlockEnd: measures.emphasisGap,
        border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
        borderInlineStart: `${vars.borderWidth.selectedIndicator} solid ${vars.color.control.primary}`,
        borderRadius: vars.radius.callout,
        background: vars.color.surface.raised,
        selectors: {
          "&:first-child": {
            borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
          },
        },
      },
      false: {},
    },
  },
});

/** The height of a row's first line: its name's line (the emphasised name's is taller). */
const firstLine = createVar();

/** The space between a row's columns: wider than after an ordered row's number. */
const columnGap = createVar();

/** Beside a row with a second line, a side part keeps to the first line's height. */
const besideFirstLine = {
  true: { alignSelf: "flex-start", height: firstLine },
  false: {},
} as const;

export const start = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: measures.markWidth,
  },
  variants: { hasDescription: besideFirstLine },
});

const listClass = list.classNames.base;
const startClass = start.classNames.base;

/**
 * The row: number, mark, text, end and ›, in a line at least the minimum target tall
 * (design-spec 4.3; 48px on a phone, d1-moon.html). A pressable row presses as a whole.
 */
export const row = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    columnGap,
    boxSizing: "border-box",
    width: "100%",
    minHeight: vars.scale.component.targetMin,
    paddingBlock: measures.paddingY,
    border: "none",
    background: "transparent",
    color: vars.color.text.primary,
    font: "inherit",
    textAlign: "start",
    textDecoration: "none",
    outline: "none",
    vars: {
      [firstLine]: `calc(${vars.typography.label.fontSize} * ${vars.typography.label.lineHeight})`,
      [columnGap]: measures.gap,
    },
    "@media": {
      [narrowQuery]: { minHeight: atLeastTarget(measures.narrowMinHeight) },
    },
  },
  variants: {
    ordered: {
      true: {
        vars: { [columnGap]: measures.numberGap },
        paddingBlock: measures.orderedPaddingY,
        "::before": {
          ...typography("numberEmphasis"),
          fontSize: vars.typography.caption.fontSize,
          content: `counter(${counter})`,
          display: "inline-flex",
          alignItems: "center",
          flexShrink: 0,
          width: measures.numberWidth,
          color: vars.color.text.tertiary,
          fontVariantNumeric: "tabular-nums",
        },
      },
      false: {},
    },
    isPressable: {
      true: {
        cursor: "pointer",
        selectors: {
          "&[data-focus-visible]": { ...focusRing, outlineOffset: 0 },
        },
      },
      false: {},
    },
    hasDescription: {
      true: { "::before": { alignSelf: "flex-start", height: firstLine } },
      false: {},
    },
    isEmphasized: {
      true: {
        vars: {
          [firstLine]: `calc(${vars.typography.labelEmphasis.fontSize} * ${vars.typography.labelEmphasis.lineHeight})`,
        },
        paddingBlock: measures.emphasisPaddingY,
        paddingInlineStart: measures.emphasisPaddingStart,
        paddingInlineEnd: measures.emphasisPaddingEnd,
        "::before": {
          color: vars.color.text.primary,
          fontWeight: vars.typography.labelEmphasis.fontWeight,
        },
      },
      false: {},
    },
  },
});

const rowClass = row.classNames.base;

export const main = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["25"],
  flex: 1,
  minWidth: 0,
  selectors: {
    // A row without a mark in a list with marks keeps the mark's column empty.
    [`${listClass}:has(${startClass}) ${rowClass}:not(:has(${startClass})) > &`]:
      {
        marginInlineStart: `calc(${measures.markWidth} + ${columnGap})`,
      },
  },
});

/** The name; under the pointer a pressable row underlines it (d1-moon.html .rows a:hover). */
export const text = recipe({
  base: {
    ...hoverTransition,
    ...typography("label"),
    overflowWrap: "break-word",
    textDecorationLine: "underline",
    textDecorationColor: "transparent",
    textUnderlineOffset: measures.underlineOffset,
    selectors: {
      [`${rowClass}[data-hovered] &`]: {
        textDecorationColor: "currentColor",
      },
    },
  },
  variants: {
    isEmphasized: { true: typography("labelEmphasis"), false: {} },
  },
});

export const description = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
});

export const end = recipe({
  base: {
    ...typography("caption"),
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    color: vars.color.text.secondary,
    fontVariantNumeric: "tabular-nums",
    textAlign: "end",
  },
  variants: {
    hasDescription: besideFirstLine,
    // A count ("7/10", "5 entries") in the monospaced face (d1-moon.html .rows .num).
    isNumeric: { true: { fontFamily: vars.font.family.mono }, false: {} },
  },
});

export const chevron = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    color: vars.color.text.tertiary,
  },
  variants: { hasDescription: besideFirstLine },
});

/** An open task's ☐ at a row's start (s05-dashboard.html .due .box). */
export const taskMark = style({
  display: "block",
  boxSizing: "border-box",
  width: vars.scale.component.rowList.taskMarkSize,
  height: vars.scale.component.rowList.taskMarkSize,
  border: `${vars.scale.component.rowList.taskMarkBorder} solid ${vars.color.text.tertiary}`,
  borderRadius: vars.scale.component.rowList.taskMarkRadius,
});
