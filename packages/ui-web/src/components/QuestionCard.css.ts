import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import {
  focusRing,
  hoverTransition,
  narrowQuery,
  tabletUp,
  typography,
} from "../styles/helpers";

const form = vars.layout.questionForm;

/**
 * The question being answered (s11-form.html .card): the light frame and the card's two
 * shadows mark where the answer goes (4.4), wider than the column by 16px each side.
 */
export const focused = style({
  display: "flex",
  flexDirection: "column",
  paddingBlock: form.cardPaddingYMobile,
  paddingInline: form.cardPaddingXMobile,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.card,
  background: vars.color.surface.raised,
  boxShadow: `${vars.shadow.questionCardEdge}, ${vars.shadow.questionCard}`,
  color: vars.color.text.primary,
  scrollMarginBlock: vars.space["400"],
  "@media": {
    [tabletUp]: {
      marginBlock: form.cardMarginY,
      marginInline: `calc(-1 * ${form.cardOutset})`,
      paddingBlockStart: form.cardPaddingTop,
      paddingBlockEnd: form.cardPaddingBottom,
      paddingInline: form.cardPaddingX,
    },
  },
});

/** Open without the focus: the same content, set apart by the lines between questions. */
export const open = style({
  display: "flex",
  flexDirection: "column",
  paddingBlock: form.rowPaddingY,
  paddingInline: form.rowPaddingX,
  color: vars.color.text.primary,
});

/**
 * A quiet question (s11-form.html .row): its mark, its name and the start of its answer
 * under it, its F/A/U and comments at the end; the whole row presses through its title's
 * button.
 */
export const quiet = style({
  ...hoverTransition,
  position: "relative",
  display: "grid",
  gridTemplateColumns: `${form.rowMarkWidth} minmax(0, 1fr) auto`,
  alignItems: "start",
  columnGap: form.rowColumnGap,
  rowGap: form.rowGap,
  paddingBlock: form.rowPaddingY,
  paddingInline: form.rowPaddingX,
  borderRadius: vars.radius.control,
  color: vars.color.text.primary,
  selectors: {
    "&:hover": { background: vars.color.surface.hover },
  },
});

/** The F/A/U moon, down the rows' left edge so the states line up (.row .g). */
export const glyph = style({
  gridColumn: "1",
  gridRow: "1 / 3",
  display: "grid",
  placeItems: "center",
  paddingBlockStart: vars.space["50"],
});

export const quietText = style({
  gridColumn: "2",
  gridRow: "1 / 3",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

/**
 * The quiet row's name takes a line of the body's height, as the mockup's inline name in
 * the body's line does (s11-form.html .row .code), so the rows keep their rhythm.
 */
export const quietTitle = style({
  display: "flex",
  alignItems: "center",
  minHeight: `calc(${vars.typography.body.fontSize} * ${vars.typography.body.lineHeight})`,
});

export const header = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: form.cardHeadGap,
  minWidth: 0,
});

/** The template's title, as written, in the monospaced face (design-spec 4.4・6.2). */
export const title = style({
  ...typography("id"),
  margin: 0,
  color: vars.color.text.secondary,
  overflowWrap: "anywhere",
});

/** The title's button covers the quiet row, so the row presses as a whole. */
export const press = style({
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  letterSpacing: "inherit",
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  "::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: vars.radius.control,
  },
  selectors: {
    "&[data-focus-visible]::after": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
});

/** The F/A/U label and the comments at the end of the quiet row (.meta). */
export const meta = style({
  ...typography("caption"),
  gridColumn: "3",
  gridRow: "1 / 3",
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["200"],
  paddingBlockStart: vars.space["25"],
  color: vars.color.text.secondary,
  whiteSpace: "nowrap",
});

export const comments = style({
  ...typography("count"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
  fontVariantNumeric: "tabular-nums",
});

/** The answer's first lines: two at most (4.1 C), in the text's ink (.excerpt). */
export const excerpt = style({
  ...typography("body"),
  margin: 0,
  marginBlockStart: form.rowGap,
  maxWidth: `calc(${form.excerptMeasure} * 1ch)`,
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflowWrap: "anywhere",
});

export const emptyExcerpt = style({
  ...typography("body"),
  margin: 0,
  marginBlockStart: form.rowGap,
  color: vars.color.text.tertiary,
});

export const status = style({
  ...typography("caption"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["85"],
  color: vars.color.text.secondary,
});

/** "Fact · No evidence" carries a warning in the amber of attention (06 notice). */
export const warning = style({
  display: "inline-flex",
  color: vars.color.notice.fg,
});

export const actions = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["25"],
  marginInlineStart: "auto",
});

/** The question, larger than everything around it (design-spec 6.2, .card h2). */
export const question = style({
  ...typography("headingQuestion"),
  margin: 0,
  marginBlockStart: form.questionMarginTop,
  marginBlockEnd: form.questionMarginBottom,
  overflowWrap: "break-word",
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.gap,
  minWidth: 0,
  "@media": {
    [narrowQuery]: { gap: vars.density.regular.gap },
  },
});
