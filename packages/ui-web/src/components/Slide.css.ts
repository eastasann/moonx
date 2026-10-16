import { vars } from "@moonx/ui-tokens";
import { print } from "@moonx/ui-tokens/print";
import { style } from "@vanilla-extract/css";
import { slideUnits as u } from "../internal/slideUnits";

const { slide: frame } = print;
const color = vars.print.color;

/**
 * The slide's box: the page's proportions at the width of its place, in the light colours
 * of the PDF at every theme (design-spec 6.14). Its lengths are shares of its width.
 */
export const slide = style({
  containerType: "inline-size",
  position: "relative",
  width: "100%",
  aspectRatio: `${frame.width} / ${frame.height}`,
  overflow: "hidden",
  borderRadius: vars.radius.card,
  // The page's colour is the light canvas's: a hairline drawn inside keeps its edge in
  // sight without taking any of its width.
  boxShadow: `inset 0 0 0 ${vars.borderWidth.hairline} ${color.borderStrong}`,
  background: color.page,
  color: color.text,
  fontFamily: vars.print.font.body,
});

export const page = style({
  position: "absolute",
  inset: 0,
  boxSizing: "border-box",
  paddingInline: u(frame.marginX),
  paddingBlock: u(frame.marginY),
});

/** The body above the footer; a slide still too tall is cut at its bottom, as in the PDF. */
export const body = style({
  display: "flex",
  flexDirection: "column",
  rowGap: u(frame.gap),
  height: u(frame.height - 2 * frame.marginY - frame.footerHeight - frame.gap),
  overflow: "hidden",
});

/** The title slide's texts in the middle of the body. */
export const titleBody = style([body, { justifyContent: "center" }]);

export const heading = style({
  margin: 0,
  color: color.text,
  overflowWrap: "anywhere",
});

export const subtitle = style({
  margin: 0,
  color: color.textSecondary,
  overflowWrap: "anywhere",
});

/** "Not written yet" and an empty title, in the placeholder's grey (design-spec 6.14). */
export const placeholder = style({ margin: 0, color: color.textPlaceholder });

export const rule = style({
  flexShrink: 0,
  width: "100%",
  height: u(frame.ruleWidth),
  margin: 0,
  border: "none",
  background: color.rule,
});

const list = {
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
} as const;

export const bullets = style(list);

/** The title slide's Prepared by, Date and Version: lines without a bullet. */
export const meta = style({ ...list, color: color.textSecondary });

export const bullet = style({ display: "flex" });

export const mark = style({ flexShrink: 0, width: u(frame.bulletIndent) });

export const bulletText = style({
  flex: 1,
  minWidth: 0,
  overflowWrap: "anywhere",
});

/** A bullet's source name, bold before its text ("Primary problem: …"). */
export const label = style({ fontWeight: print.typography.heading.fontWeight });

export const figures = style({
  display: "flex",
  columnGap: u(frame.gap),
  margin: 0,
});

/** A figure: the thick rule, the number, its label under it (6.14). */
export const figure = style({
  display: "flex",
  flexDirection: "column-reverse",
  justifyContent: "flex-end",
  flex: "none",
  boxSizing: "content-box",
  paddingTop: u(frame.figureGap),
  borderTop: `${u(frame.ruleWidth)} solid ${color.rule}`,
});

export const figureLabel = style({ color: color.textSecondary });

/** A number on one line, as the fit measured it. */
export const value = style({
  margin: 0,
  fontFamily: vars.print.font.mono,
  whiteSpace: "nowrap",
  color: color.text,
});

/** Numbers too wide to stand side by side break where they must. */
export const valueBreaking = style({
  margin: 0,
  fontFamily: vars.print.font.mono,
  overflowWrap: "anywhere",
  color: color.text,
});

/** Why there is no number: in the label's face, grey, breaking between its words. */
export const reason = style({
  margin: 0,
  overflowWrap: "anywhere",
  color: color.textPlaceholder,
});

export const table = style({
  width: "100%",
  tableLayout: "fixed",
  borderCollapse: "collapse",
  background: color.panel,
});

const row = {
  borderBottom: `${u(frame.hairlineWidth)} solid ${color.border}`,
} as const;

export const tableHead = style({ ...row, background: color.tableHeader });

export const tableRow = style(row);

export const cell = style({
  paddingInline: u(frame.cellPaddingX),
  paddingBlock: u(frame.cellPaddingY),
  textAlign: "start",
  verticalAlign: "top",
  overflowWrap: "anywhere",
});

export const numericCell = style([
  cell,
  { fontFamily: vars.print.font.mono, textAlign: "end" },
]);

/** A number column's heading: aligned with its numbers, in the body face (the PDF's). */
export const numericHead = style([cell, { textAlign: "end" }]);

export const footer = style({
  position: "absolute",
  insetInline: u(frame.marginX),
  bottom: u(frame.marginY),
  height: u(frame.footerHeight),
  margin: 0,
  overflow: "hidden",
  color: color.textSecondary,
});
