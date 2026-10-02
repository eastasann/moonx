import { style } from "@vanilla-extract/css";
import { breakpoints, vars } from "../theme";

const hairline = `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`;
const narrow = `(max-width: ${breakpoints.tablet - 1}px)`;
const tablet = `(min-width: ${breakpoints.tablet}px)`;
const desktop = `(min-width: ${breakpoints.desktop}px)`;

export const gallery = style({ minHeight: "100dvh", background: vars.color.surface.canvas });

export const header = style({
  position: "sticky",
  insetBlockStart: 0,
  zIndex: 60,
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  paddingBlock: vars.space["200"],
  paddingInline: vars.layout["page-gutter-mobile"],
  background: vars.color.surface.raised,
  borderBlockEnd: hairline,
  "@media": {
    [tablet]: { paddingInline: vars.layout["page-gutter-tablet"] },
    [desktop]: { paddingInline: vars.layout["page-gutter-desktop"] },
  },
});

export const headerRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["300"],
});

export const title = style({
  margin: 0,
  fontFamily: vars.typography["heading-4"].fontFamily,
  fontSize: vars.typography["heading-4"].fontSize,
  fontWeight: vars.typography["heading-4"].fontWeight,
  lineHeight: vars.typography["heading-4"].lineHeight,
  color: vars.color.text.primary,
});

export const controls = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space["400"],
});

export const control = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
});

export const controlLabel = style({
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  fontWeight: vars.typography["label-sm"].fontWeight,
  lineHeight: vars.typography["label-sm"].lineHeight,
  color: vars.color.text.secondary,
});

export const readout = style({
  margin: 0,
  fontFamily: vars.typography.number.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
  color: vars.color.text.secondary,
});

export const jumpList = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space["200"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

export const main = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["900"],
  width: "100%",
  maxWidth: vars.layout["content-max"],
  marginInline: "auto",
  paddingBlock: vars.space["600"],
  paddingInline: vars.layout["page-gutter-mobile"],
  "@media": {
    [narrow]: { paddingBlockEnd: `calc(${vars.layout["tab-bar-height"]} + ${vars.space["600"]})` },
    [tablet]: { paddingInline: vars.layout["page-gutter-tablet"] },
    [desktop]: { paddingInline: vars.layout["page-gutter-desktop"] },
  },
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["600"],
  // Keeps the heading clear of the sticky header when a jump link scrolls to it.
  scrollMarginBlockStart: vars.space["1000"],
});

export const sectionTitle = style({
  margin: 0,
  paddingBlockEnd: vars.space["100"],
  borderBlockEnd: hairline,
  fontFamily: vars.typography["heading-2"].fontFamily,
  fontSize: vars.typography["heading-2"].fontSize,
  fontWeight: vars.typography["heading-2"].fontWeight,
  lineHeight: vars.typography["heading-2"].lineHeight,
  color: vars.color.text.primary,
});

export const component = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["300"],
  minWidth: 0,
});

export const componentTitle = style({
  margin: 0,
  fontFamily: vars.typography["heading-4"].fontFamily,
  fontSize: vars.typography["heading-4"].fontSize,
  fontWeight: vars.typography["heading-4"].fontWeight,
  lineHeight: vars.typography["heading-4"].lineHeight,
  color: vars.color.text.primary,
});

export const note = style({
  margin: 0,
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
  color: vars.color.text.secondary,
});

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
});

export const groupLabel = style({
  margin: 0,
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  fontWeight: vars.typography["label-sm"].fontWeight,
  lineHeight: vars.typography["label-sm"].lineHeight,
  color: vars.color.text.secondary,
});

export const cases = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  gap: vars.space["300"],
  minWidth: 0,
});

/** Without `nowrap` a wrapping column container sizes its one line to the widest item and overflows. */
export const casesColumn = style([
  cases,
  { flexDirection: "column", flexWrap: "nowrap", alignItems: "stretch" },
]);

/** Form fields need room for their label and message, so each case gets a minimum column. */
export const casesFields = style({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(calc(${vars.space["1000"]} * 3), 1fr))`,
  alignItems: "start",
  gap: vars.space["400"],
});

export const caseBox = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  minWidth: 0,
});

export const caseLabel = style({
  fontFamily: vars.typography["label-sm"].fontFamily,
  fontSize: vars.typography["label-sm"].fontSize,
  lineHeight: vars.typography["label-sm"].lineHeight,
  color: vars.color.text.secondary,
});

export const caseBody = style({ minWidth: 0 });

export const scrollable = style({ overflowX: "auto" });

export const frame = style({
  minWidth: 0,
  border: hairline,
  borderRadius: vars.radius.control,
  background: vars.color.surface.canvas,
  overflow: "auto",
});

/** The sidebar is `100dvh` tall by design; the frame scrolls it instead of stretching the page. */
export const navFrame = style([
  frame,
  { display: "flex", maxHeight: `calc(${vars.space["1000"]} * 4)` },
]);

export const panelRow = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["300"],
  minWidth: 0,
});

export const slideBox = style({ width: "100%", maxWidth: vars.layout["reading-column-max"] });

export const widthFull = style({ width: "100%", minWidth: 0 });

export const readingBox = style({ width: "100%", maxWidth: vars.layout["reading-column-max"] });

export const verticalBox = style({
  display: "flex",
  alignItems: "stretch",
  height: vars.space["800"],
});

/** No `overflow` here: the patterns pin their action bars with `position: sticky`. */
export const patternFrame = style({
  minWidth: 0,
  border: hairline,
  borderRadius: vars.radius.control,
  background: vars.color.surface.canvas,
});
