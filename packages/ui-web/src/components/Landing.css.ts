import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { publicStackQuery, typography } from "../styles/helpers";

// The landing's examples (design-spec 6.16 の 1, s01-landing.html): IdeaPreview,
// PhaseRoute and CostPreview.

const pub = vars.layout.public;

/** The floating card (.preview): a hairline, a large corner, a large soft shadow. */
export const preview = style({
  margin: 0,
  paddingBlockStart: pub.previewPaddingTop,
  paddingBlockEnd: pub.previewPaddingBottom,
  paddingInline: pub.previewPaddingX,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  borderRadius: pub.previewRadius,
  background: vars.color.surface.raised,
  boxShadow: vars.shadow.preview,
  color: vars.color.text.primary,
});

export const previewHead = style({
  display: "flex",
  alignItems: "baseline",
  gap: pub.previewHeadGap,
  marginBlockEnd: pub.previewBlockGap,
});

export const previewName = style({ ...typography("brand") });

export const previewStage = style({
  ...typography("caption"),
  marginInlineStart: "auto",
  color: vars.color.text.secondary,
});

/** Two numbers side by side, the light line above and a hairline under (.p-nums). */
export const previewNumbers = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  marginBlockEnd: pub.previewBlockGap,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const previewNumber = style({
  minWidth: 0,
  paddingBlock: pub.previewNumberPaddingY,
  selectors: {
    "& + &": {
      paddingInlineStart: pub.previewNumberGap,
      borderInlineStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

export const previewLabel = style({
  ...typography("captionSm"),
  color: vars.color.text.secondary,
});

export const previewValue = style({
  ...typography("previewMetric"),
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});

export const previewChecks = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A check: its moon, its name, its state at the end, a hairline above (.preview li). */
export const previewCheck = style({
  ...typography("bodyCompact"),
  display: "grid",
  gridTemplateColumns: `${vars.layout.questionForm.rowMarkWidth} minmax(0, 1fr) auto`,
  alignItems: "center",
  gap: vars.space["100"],
  paddingBlock: pub.previewRowPaddingY,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const previewMoon = style({
  width: pub.previewMoonSize,
  height: pub.previewMoonSize,
});

export const previewStatus = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});

export const previewCaption = style({
  ...typography("captionSm"),
  marginBlockStart: pub.previewBlockGap,
  color: vars.color.text.tertiary,
});

/**
 * The three parts on a line (.route): across; at `stack-max-width` and narrower, down. Each part
 * but the last draws the light line from its moon to the next one's.
 */
export const route = style({
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  margin: 0,
  padding: 0,
  listStyle: "none",
  "@media": {
    [publicStackQuery]: {
      gridTemplateColumns: "minmax(0, 1fr)",
      gap: pub.routeStackGap,
    },
  },
});

export const routeItem = style({
  position: "relative",
  paddingInlineEnd: pub.routeItemPaddingEnd,
  selectors: {
    // Across: from this moon's middle to the next one's, a part's width away.
    "&:not(:last-child)::before": {
      content: '""',
      position: "absolute",
      insetBlockStart: `calc(${pub.routeMarkBox} / 2)`,
      insetInlineStart: `calc(${pub.routeMarkBox} / 2)`,
      width: "100%",
      height: vars.borderWidth.hairline,
      background: vars.color.border.default,
    },
  },
  "@media": {
    [publicStackQuery]: {
      display: "grid",
      gridTemplateColumns: `${pub.routeMarkBox} minmax(0, 1fr)`,
      columnGap: pub.routeStackColumnGap,
      paddingInlineEnd: 0,
      selectors: {
        // Down: to the next part's moon, past the gap between them.
        "&:not(:last-child)::before": {
          width: vars.borderWidth.hairline,
          height: `calc(100% + ${pub.routeStackGap})`,
        },
      },
    },
  },
});

/** The moon's box on the canvas, so the line stops at its edge (.route .phase). */
export const routeMark = style({
  position: "relative",
  display: "grid",
  placeItems: "center",
  width: pub.routeMarkBox,
  height: pub.routeMarkBox,
  marginBlockEnd: pub.routeMarkGap,
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
  "@media": {
    [publicStackQuery]: { marginBlockEnd: 0 },
  },
});

export const routeMoon = style({
  width: pub.routeMarkSize,
  height: pub.routeMarkSize,
});

export const routeTitle = style({
  ...typography("heading3"),
  margin: 0,
  marginBlockEnd: vars.space["85"],
});

export const routeText = style({
  ...typography("body"),
  margin: 0,
  maxWidth: `calc(${pub.routeMeasure} * 1ch)`,
  color: vars.color.text.secondary,
});

/** The worksheet's example (.sheet): rows between hairlines, the totals' band under them. */
export const sheet = style({
  ...typography("bodyCompact"),
  overflow: "hidden",
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  borderRadius: pub.previewRadius,
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
});

export const sheetRow = style({
  display: "grid",
  gridTemplateColumns: `calc(${pub.sheetMarkWidth} - ${pub.sheetRowPaddingX}) minmax(0, 1fr) auto`,
  alignItems: "center",
  columnGap: pub.sheetRowPaddingX,
  paddingBlock: pub.sheetRowPaddingY,
  paddingInline: pub.sheetRowPaddingX,
  selectors: {
    "& + &": {
      borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

export const sheetMoon = style({
  width: pub.sheetMoonSize,
  height: pub.sheetMoonSize,
});

export const sheetAmount = style({
  fontFamily: vars.font.family.mono,
  fontVariantNumeric: "tabular-nums",
  textAlign: "end",
});

export const sheetMuted = style({ color: vars.color.text.tertiary });

/** The totals on the sunken band, the light line above it (.sheet .tot). */
export const sheetTotals = style({
  display: "flex",
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  background: vars.color.surface.sunken,
});

export const sheetTotal = style({
  flex: 1,
  minWidth: 0,
  paddingBlock: pub.sheetTotalPaddingY,
  paddingInline: pub.sheetRowPaddingX,
  selectors: {
    "& + &": {
      borderInlineStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

export const sheetValue = style({
  ...typography("previewTotal"),
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
});
