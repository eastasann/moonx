import { style } from "@vanilla-extract/css";
import { vars } from "../../theme";

const { color, slide, typography } = vars.print;
const hairline = `${vars["border-width"].hairline} solid ${color.border}`;

export const wrapper = style({ display: "flex", flexDirection: "column", gap: vars.space["100"] });

/** Keeps 16:9 at any width; the canvas inside is drawn at the reference size and scaled down. */
export const frame = style({
  position: "relative",
  width: "100%",
  aspectRatio: "16 / 9",
  overflow: "hidden",
  background: color.page,
  border: hairline,
  borderRadius: vars.radius.chip,
});

/** The slide at `print.slide` size, shared with the PDF. Its `transform` is set from the frame width. */
export const canvas = style({
  position: "absolute",
  insetBlockStart: 0,
  insetInlineStart: 0,
  transformOrigin: "top left",
  width: slide.width,
  height: slide.height,
  display: "flex",
  flexDirection: "column",
  gap: slide.gap,
  paddingInline: slide["margin-x"],
  paddingBlock: slide["margin-y"],
  background: color.page,
  color: color.text,
  fontFamily: vars.print.font.body,
});

export const content = style({
  flex: 1,
  minHeight: 0,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  gap: slide.gap,
});

export const contentTitle = style({ justifyContent: "center" });

function type(t: (typeof typography)[keyof typeof typography]) {
  return {
    margin: 0,
    fontFamily: t.fontFamily,
    fontSize: t.fontSize,
    fontWeight: t.fontWeight,
    letterSpacing: t.letterSpacing,
    lineHeight: t.lineHeight,
  } as const;
}

export const coverTitle = style(type(typography.title));
export const heading = style(type(typography.heading));

export const rule = style({
  width: vars.space["800"],
  height: vars.space["75"],
  background: color.accent,
});

export const subtitle = style({ ...type(typography.subtitle), color: color["text-secondary"] });

export const bullets = style({
  ...type(typography.bullet),
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  paddingInlineStart: vars.space["400"],
});

export const notes = style({
  ...type(typography.cell),
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  paddingInlineStart: vars.space["350"],
  color: color["text-secondary"],
});

export const empty = style({ color: color["text-placeholder"] });

export const figures = style({
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "1fr",
  gap: slide.gap,
  margin: 0,
});

export const figure = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  padding: slide.gap,
  background: color.panel,
  border: hairline,
  borderRadius: vars.radius.card,
  minWidth: 0,
});

/** The label comes first in the DOM for the definition list, the value is drawn above it. */
export const figureValue = style({
  ...type(typography.figure),
  fontVariantNumeric: typography.figure.fontVariantNumeric,
  order: 1,
  overflowWrap: "anywhere",
});

export const figureLabel = style({
  ...type(typography["figure-label"]),
  order: 2,
  color: color["text-secondary"],
});

export const table = style({
  ...type(typography.cell),
  width: "100%",
  borderCollapse: "collapse",
  fontVariantNumeric: typography.cell.fontVariantNumeric,
});

export const headCell = style({
  padding: vars.space["100"],
  textAlign: "start",
  background: color["table-header"],
  borderBlockEnd: `${vars["border-width"].strong} solid ${color["border-strong"]}`,
});

export const cell = style({
  padding: vars.space["100"],
  textAlign: "start",
  verticalAlign: "top",
  borderBlockEnd: hairline,
});

export const footer = style({
  ...type(typography.footer),
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: slide.gap,
  height: slide["footer-height"],
  flexShrink: 0,
  color: color["text-secondary"],
});

export const footerMeta = style({ display: "inline-flex", gap: vars.space["200"] });

export const notice = style({
  margin: 0,
  color: vars.color.notice.fg,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
});
