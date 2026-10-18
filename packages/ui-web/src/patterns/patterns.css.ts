import { vars } from "@moonx/ui-tokens";
import { globalStyle, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { textMeasure } from "../components/typography.css";
import * as frame from "../internal/frame.css";
import {
  desktopUp,
  focusRing,
  hoverTransition,
  narrowQuery,
  publicStackQuery,
  tabletUp,
  typography,
} from "../styles/helpers";

// The arrangements of design-spec 4.1, A to J, at the three widths of 4.3, measured on
// docs/mockups (06 semantic.layout).

/** A pattern fills the body's height, so a bar it fixes to the bottom sits low. */
export const root = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

const gutter = {
  mobile: vars.layout.pageGutterMobile,
  tablet: vars.layout.pageGutterTablet,
  desktop: vars.layout.pageGutterDesktop,
} as const;

/**
 * The page's column: its content at most `max` wide (06 layout.*-max hold the content, the
 * gutters come on top), left-aligned (A, E, F, as the mockups) or centred, with the
 * pattern's space above and under it.
 */
const pageColumn = ({
  max,
  isCentred,
  top,
  topMobile,
  bottom,
}: {
  max: string;
  isCentred: boolean;
  top: string;
  topMobile: string;
  bottom: string;
}) =>
  ({
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
    maxWidth: `calc(${max} + 2 * ${gutter.mobile})`,
    marginInline: isCentred ? "auto" : 0,
    paddingBlockStart: topMobile,
    paddingBlockEnd: vars.layout.pagePaddingBottomMobile,
    paddingInline: gutter.mobile,
    "@media": {
      [tabletUp]: {
        maxWidth: `calc(${max} + 2 * ${gutter.tablet})`,
        paddingBlockStart: top,
        paddingBlockEnd: bottom,
        paddingInline: gutter.tablet,
      },
      [desktopUp]: {
        maxWidth: `calc(${max} + 2 * ${gutter.desktop})`,
        paddingInline: gutter.desktop,
      },
    },
  }) as const;

/** A title and the actions beside it, at the bottom of the title's block (s05 .head). */
export const headerRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  justifyContent: "space-between",
  columnGap: vars.space["300"],
  rowGap: vars.space["100"],
});

export const headerTitle = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  flex: "1 1 auto",
  minWidth: 0,
});

export const headerActions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space["100"],
});

// A: hub (s05-dashboard.html, d1-moon.html).

const hub = vars.layout.hub;

export const hubPage = style(
  pageColumn({
    max: vars.layout.contentMax,
    isCentred: false,
    top: hub.paddingTop,
    topMobile: hub.paddingTopMobile,
    bottom: hub.paddingBottom,
  }),
);

export const hubHeader = style({ marginBlockEnd: hub.headerGap });

export const hubMetrics = style({
  marginBlockEnd: hub.metricsGapMobile,
  "@media": { [tabletUp]: { marginBlockEnd: hub.metricsGap } },
});

/**
 * The hub's columns: on a desktop with room for two, the main column, then the side column
 * (7 : 5); otherwise the main column's element alone holds every block.
 */
export const hubColumns = recipe({
  variants: {
    isTwoColumns: {
      true: { display: "flex", alignItems: "flex-start", gap: hub.columnGap },
      false: {},
    },
  },
});

/**
 * A column of blocks; below the desktop breakpoint, and beside a docked panel that leaves
 * the body too narrow, the only one, the side column's element empty and out of the way.
 */
export const hubColumn = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: hub.blockGapMobile,
    minWidth: 0,
    "@media": { [tabletUp]: { gap: hub.blockGap } },
  },
  variants: {
    side: {
      main: { flex: `${hub.mainRatio} 1 0%` },
      aside: { flex: `${hub.asideRatio} 1 0%` },
      only: {},
      unused: { display: "none" },
    },
  },
});

export const hubBlock = style({ minWidth: 0 });

// B: focused (s19-decision.html).

const focus = vars.layout.focus;

export const focusPage = recipe({
  base: pageColumn({
    max: vars.layout.formColumnMax,
    isCentred: true,
    top: focus.paddingTop,
    topMobile: focus.paddingTopMobile,
    bottom: focus.paddingBottom,
  }),
  variants: {
    // The row of actions under the form keeps the page's space under it instead.
    hasActionRow: {
      true: { "@media": { [tabletUp]: { paddingBlockEnd: 0 } } },
      false: {},
    },
  },
});

export const focusHeader = style({ marginBlockEnd: focus.headerGap });

/** The material, then the fields (4.1 B), apart by the section's gap (.well's 32). */
export const focusContent = style({
  display: "flex",
  flexDirection: "column",
  gap: focus.sectionGap,
  minWidth: 0,
});

// C: question form (s11-form.html).

const form = vars.layout.questionForm;

export const questionPage = style(
  pageColumn({
    max: vars.layout.readingColumnMax,
    isCentred: true,
    top: form.paddingTop,
    topMobile: form.paddingTopMobile,
    bottom: form.paddingBottom,
  }),
);

/** Above the questions; the guidance runs 62 characters wide at most (s11's .guidance). */
export const questionHeader = style({
  vars: { [textMeasure]: `calc(${form.guidanceMeasure} * 1ch)` },
  marginBlockEnd: form.headerGapMobile,
  "@media": { [tabletUp]: { marginBlockEnd: form.headerGap } },
});

/**
 * The questions, one under another between hairlines (s11-form.html .qs): no space
 * between the quiet ones. A phone shows the one question alone, without lines.
 */
export const questions = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
  "@media": {
    [tabletUp]: {
      borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

export const question = style({
  minWidth: 0,
  "@media": {
    [tabletUp]: {
      borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

/** QuestionList: pattern C's hairlines at every width, as wide as s15's .qs. */
export const questionList = style({
  margin: 0,
  padding: 0,
  listStyle: "none",
  maxWidth: vars.layout.compare.questionsMax,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const questionListItem = style({
  minWidth: 0,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

/** The Focus switch where there is no AppFrame header to hold it: beside the heading. */
export const inlineTools = style({
  display: "flex",
});

/**
 * On a phone, the previous and next section and AI ▼ under the question (6.2); from the
 * tablet breakpoint up they are in the bar at the bottom.
 */
export const sectionFooter = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: form.footerGap,
  marginBlockStart: vars.space["400"],
});

/**
 * The header's Focus switch: its label in the caption's secondary text, beside the save
 * state (s11-form.html .switch).
 */
export const focusTool = style({ display: "inline-flex" });

globalStyle(`${focusTool} > label`, {
  fontSize: vars.typography.caption.fontSize,
  color: vars.color.text.secondary,
});

/** The previous or next section's place at an end of the footer's bar. */
export const sectionStep = style({ display: "flex" });

/** The phone's arrows: 48px with the light frame (s11-form.html .mnav .iconbtn). */
export const questionArrow = style({
  ...hoverTransition,
  display: "grid",
  placeItems: "center",
  width: vars.scale.component.actionButton.height.XL,
  height: vars.scale.component.actionButton.height.XL,
  padding: 0,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.control,
  background: "none",
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-pressed]": {
      background: vars.color.surface.hover,
      color: vars.color.text.primary,
    },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": {
      color: vars.color.text.disabled,
      cursor: "not-allowed",
    },
  },
});

/**
 * The phone's position among the questions, between ← and → (6.2's dots). Dots that do
 * not fit scroll sideways inside it, never the page (4.3), as a long row of tabs does.
 */
export const barMiddle = style({
  display: "flex",
  justifySelf: "stretch",
  minWidth: 0,
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  scrollbarWidth: "none",
});

/** Centred while the dots fit; from the start once they scroll. */
export const barStrip = style({
  display: "flex",
  flexShrink: 0,
  marginInline: "auto",
});

/** A dot: its moon in a target as large as 4.3 asks of anything pressed (6.2). */
export const questionDot = style({
  display: "grid",
  placeItems: "center",
  minWidth: vars.scale.component.targetMin,
  minHeight: vars.scale.component.targetMin,
  padding: 0,
  border: "none",
  borderRadius: vars.radius.control,
  background: "none",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-focus-visible]": focusRing,
  },
});

// D: list and detail (s06-ideas.html).

const pane = vars.layout.listDetail;

/**
 * The panes, to the frame's edges (s06-ideas.html .split). In two columns, the list on
 * the left (5 : 6, never narrower than `list-min-width`) and the detail on the right, a
 * hairline between them down the body's whole height. Which arrangement, the pattern
 * decides (a desktop, and room beside a docked panel), so the panes take their two-column
 * look from `isBeside`, not from the window.
 */
export const listDetail = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  variants: {
    isBeside: {
      true: { flexDirection: "row" },
      false: {},
    },
    /** 8 Notifications: the list alone, as wide as the reading column with the pane's insets. */
    isListOnly: {
      true: {
        width: "100%",
        maxWidth: `calc(${vars.layout.readingColumnMax} + 2 * ${pane.panePaddingX})`,
        marginInline: "auto",
      },
      false: {},
    },
  },
});

/** The list's pane: its title, its filters and the list, each row to the pane's edges. */
export const listPane = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    flex: 1,
    minWidth: 0,
  },
  variants: {
    isBeside: {
      true: {
        // Its share of the panes' width as s06's grid gives it (5 of 5 + 6), never less
        // than its minimum; the detail takes the rest, its padding inside its share.
        flex: "none",
        width: `max(${pane.listMinWidth}, calc(100% * ${pane.listRatio} / (${pane.listRatio} + ${pane.detailRatio})))`,
        borderInlineEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
      },
      false: {},
    },
  },
});

/** The title and the new item (s06-ideas.html .lhead). */
export const listHead = style({
  display: "flex",
  alignItems: "center",
  gap: pane.headGap,
  paddingBlockStart: pane.headPaddingTopMobile,
  paddingBlockEnd: pane.headPaddingBottomMobile,
  paddingInline: pane.panePaddingXMobile,
  "@media": {
    [tabletUp]: {
      paddingBlockStart: pane.headPaddingTop,
      paddingBlockEnd: pane.headPaddingBottom,
      paddingInline: pane.panePaddingX,
    },
  },
});

export const listTitle = style({ flex: 1, minWidth: 0 });

/**
 * The filters and search under the title, a hairline under them (s06-ideas.html .filters):
 * wrapping from the tablet breakpoint up; on a phone they stay on one line and scroll
 * sideways inside it, never the page (4.3), as a long row of tabs does.
 */
export const listFilters = style({
  display: "flex",
  flexWrap: "nowrap",
  alignItems: "center",
  gap: pane.filtersGap,
  overflowX: "auto",
  overscrollBehaviorX: "contain",
  paddingBlockEnd: pane.filtersPaddingBottomMobile,
  paddingInline: pane.panePaddingXMobile,
  // Room above the filters for a focus ring the sideways scroll would clip, taken back
  // from the line above.
  paddingBlockStart: `calc(${vars.borderWidth.focusRing} + ${vars.borderWidth.focusOffset})`,
  marginBlockStart: `calc(-1 * (${vars.borderWidth.focusRing} + ${vars.borderWidth.focusOffset}))`,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: {
      flexWrap: "wrap",
      overflowX: "visible",
      paddingBlockStart: 0,
      marginBlockStart: 0,
      paddingBlockEnd: pane.filtersPaddingBottom,
      paddingInline: pane.panePaddingX,
    },
  },
});

export const listNote = style({
  paddingBlock: pane.rowPaddingY,
  paddingInline: pane.panePaddingXMobile,
  "@media": { [tabletUp]: { paddingInline: pane.panePaddingX } },
});

/** A filter keeps its width while the line scrolls on a phone. */
globalStyle(`${listFilters} > *`, {
  "@media": { [narrowQuery]: { flexShrink: 0 } },
});

/**
 * The selected item. Beside the list it stays in view under the header while the list
 * scrolls, scrolling on its own when taller than the window (s06-ideas.html .detail).
 */
export const detailPane = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    gap: vars.density.regular.blockGap,
    flex: 1,
    minWidth: 0,
    paddingBlockStart: pane.headPaddingTopMobile,
    paddingBlockEnd: vars.layout.pagePaddingBottomMobile,
    paddingInline: gutter.mobile,
    // Focus is put here when it opens in place of the list; the pane draws no ring.
    outline: "none",
    "@media": {
      [tabletUp]: {
        paddingBlockStart: pane.detailPaddingTop,
        paddingBlockEnd: pane.detailPaddingBottom,
        paddingInline: gutter.tablet,
      },
      [desktopUp]: { paddingInline: gutter.desktop },
    },
  },
  variants: {
    isBeside: {
      true: {
        position: "sticky",
        top: frame.top,
        alignSelf: "flex-start",
        maxHeight: `calc(100dvh - ${frame.top})`,
        overflowY: "auto",
        "@media": {
          [tabletUp]: { paddingInline: pane.detailPaddingX },
          [desktopUp]: { paddingInline: pane.detailPaddingX },
        },
      },
      false: {},
    },
  },
});

/** ← back to the list, above the detail in one pane. */
export const backButton = style({
  ...hoverTransition,
  ...typography("label"),
  display: "inline-flex",
  alignItems: "center",
  alignSelf: "flex-start",
  gap: vars.space["75"],
  minHeight: vars.scale.component.targetMin,
  paddingInline: 0,
  border: "none",
  background: "none",
  color: vars.color.text.primary,
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": { textDecoration: "underline" },
    "&[data-focus-visible]": {
      ...focusRing,
      borderRadius: vars.radius.control,
    },
  },
});

// E: card comparison (s15-competitors.html).

const compare = vars.layout.compare;

export const comparePage = style(
  pageColumn({
    max: vars.layout.contentMax,
    isCentred: false,
    top: compare.paddingTop,
    topMobile: compare.paddingTopMobile,
    bottom: compare.paddingBottom,
  }),
);

/** The title, the count beside it, and the tools at the end (s15 .sechead). */
export const compareHeader = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-end",
  columnGap: compare.headerCountGap,
  rowGap: vars.space["100"],
  marginBlockEnd: compare.headerGap,
});

/** "● 4 competitors · aim for 3–5", on the title's baseline (.sechead .count). */
export const compareCount = style({
  ...typography("body"),
  display: "inline-flex",
  alignItems: "center",
  gap: compare.countGap,
  paddingBlockEnd: vars.space["75"],
  color: vars.color.text.secondary,
});

export const compareTools = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  marginInlineStart: "auto",
});

/** The cards or the table, then what follows (.cards' 40 under them). */
export const compareContent = style({
  display: "flex",
  flexDirection: "column",
  gap: compare.sectionGap,
  minWidth: 0,
});

// F: worksheet (s17-costs.html).

const sheet = vars.layout.worksheet;

export const worksheetPage = style(
  pageColumn({
    max: vars.layout.worksheetMax,
    isCentred: false,
    top: sheet.paddingTop,
    topMobile: sheet.paddingTopMobile,
    bottom: sheet.paddingBottom,
  }),
);

export const worksheetHeader = style({
  marginBlockEnd: sheet.headerGapMobile,
  "@media": { [tabletUp]: { marginBlockEnd: sheet.headerGap } },
});

/** In two columns, the inputs on the left and the results on the right. */
export const worksheet = style({
  display: "flex",
  alignItems: "flex-start",
  gap: sheet.columnGap,
});

export const inputs = style({
  display: "flex",
  flexDirection: "column",
  gap: sheet.inputsGapMobile,
  flex: 1,
  minWidth: 0,
  "@media": { [tabletUp]: { gap: sheet.inputsGap } },
});

/**
 * The results stay in view while the inputs scroll (4.1 F): a card with the light frame,
 * 288px wide (s17-costs.html .totals).
 */
export const results = style({
  position: "sticky",
  top: `calc(${frame.top} + ${sheet.stickyOffset})`,
  display: "flex",
  flexDirection: "column",
  flexShrink: 0,
  width: sheet.resultsWidth,
  maxHeight: `calc(100dvh - ${frame.top} - 2 * ${sheet.stickyOffset})`,
  overflowY: "auto",
  paddingBlockStart: sheet.resultsPaddingTop,
  paddingBlockEnd: sheet.resultsPaddingBottom,
  paddingInline: sheet.resultsPaddingX,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.card,
  background: vars.color.surface.raised,
  // Focus is put here when it takes the summary bar's place; the column draws no ring.
  outline: "none",
});

/** The results' name at the top of their card (.totals h2). */
export const resultsTitle = style({
  paddingBlockStart: vars.space["200"],
  paddingBlockEnd: vars.space["75"],
});

/** The summary bar's button: the whole bar opens the results (s17-costs.html .sumbar). */
export const summaryButton = style({
  ...hoverTransition,
  ...typography("caption"),
  display: "flex",
  alignItems: "center",
  gap: sheet.summaryGap,
  flex: 1,
  minWidth: 0,
  alignSelf: "stretch",
  paddingInline: 0,
  border: "none",
  background: "none",
  color: vars.color.text.secondary,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
});

/** The few numbers, each name and value kept whole (s17-costs.html .sumbar span). */
export const summaryContent = style({
  flex: 1,
  minWidth: 0,
  whiteSpace: "nowrap",
});

// G: steps (s25-import.html).

const steps = vars.layout.steps;

export const stepsPage = recipe({
  base: pageColumn({
    max: vars.layout.readingColumnMax,
    isCentred: true,
    top: steps.paddingTop,
    topMobile: steps.paddingTopMobile,
    bottom: steps.paddingBottom,
  }),
  variants: {
    // The diff check is wider (s25's .page).
    isComparison: {
      true: {
        maxWidth: `calc(${vars.layout.comparisonMax} + 2 * ${gutter.mobile})`,
        "@media": {
          [tabletUp]: {
            maxWidth: `calc(${vars.layout.comparisonMax} + 2 * ${gutter.tablet})`,
          },
          [desktopUp]: {
            maxWidth: `calc(${vars.layout.comparisonMax} + 2 * ${gutter.desktop})`,
          },
        },
      },
      false: {},
    },
  },
});

export const stepsHeader = style({ marginBlockEnd: steps.headerGap });

export const stepsBar = style({ marginBlockEnd: steps.stepsGap });

export const stepsContent = style({
  display: "flex",
  flexDirection: "column",
  gap: steps.itemGap,
  minWidth: 0,
});

/** A question of the diff check in its frame (s25-import.html .item). */
export const comparisonItem = style({
  minWidth: 0,
  overflow: "hidden",
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.card,
  background: vars.color.surface.raised,
});

/** ☑ · "01 · WHO" · the question · "Updated by …" (s25-import.html .item-head). */
export const comparisonHead = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: steps.itemHeadGap,
  paddingBlock: steps.itemHeadPaddingY,
  paddingInline: steps.itemHeadPaddingX,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const comparisonCode = style({
  ...typography("id"),
  flexShrink: 0,
  color: vars.color.text.secondary,
});

/** Beside the code at every width: on a phone it wraps there (s25-import.html .item-head). */
export const comparisonQuestion = style({
  ...typography("body"),
  fontWeight: vars.typography.heading4.fontWeight,
  flex: "1 1 0",
  minWidth: 0,
  margin: 0,
});

/**
 * "Updated by Kenji just now": at the end of the head; on a phone on a line of its own
 * under it, where s25 leaves it out (the edit by someone else is not hidden).
 */
export const comparisonMeta = style({
  ...typography("caption"),
  flexShrink: 0,
  marginInlineStart: "auto",
  color: vars.color.text.secondary,
  "@media": { [narrowQuery]: { flexBasis: "100%", marginInlineStart: 0 } },
});

/** The two sides, a vertical hairline between them; on a phone one above the other. */
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  "@media": {
    [narrowQuery]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});

export const comparisonSide = style({
  display: "flex",
  flexDirection: "column",
  gap: steps.itemLabelGap,
  minWidth: 0,
  paddingBlockStart: steps.itemSidePaddingTop,
  paddingBlockEnd: steps.itemSidePaddingBottom,
  paddingInline: steps.itemSidePaddingX,
  selectors: {
    "& + &": {
      borderInlineStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
  "@media": {
    [narrowQuery]: {
      selectors: {
        "& + &": {
          borderInlineStart: "none",
          borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
        },
      },
    },
  },
});

/** On a phone, the bar's note at the end of the content (s25-import.html .fixbar .note). */
export const stepsNote = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});

// H: settings (s09-settings.html).

const settings = vars.layout.settings;

export const settingsPage = style(
  pageColumn({
    max: vars.layout.formColumnMax,
    isCentred: true,
    top: settings.paddingTop,
    topMobile: settings.paddingTopMobile,
    bottom: settings.paddingBottom,
  }),
);

export const settingsHeader = style({ marginBlockEnd: settings.headerGap });

/**
 * A group of settings: its name on the left and its fields on the right, from the
 * tablet breakpoint up; one above the other on a phone. A hairline above each group and
 * the same space above and under its line (s09-settings.html .group).
 */
export const settingsGroup = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: settings.columnGapMobile,
  paddingBlock: settings.groupPaddingY,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: {
      gridTemplateColumns: `${settings.labelWidth} minmax(0, 1fr)`,
      gap: settings.columnGap,
    },
  },
});

export const settingsLabel = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["50"],
  minWidth: 0,
});

export const settingsContent = style({
  display: "flex",
  flexDirection: "column",
  gap: settings.fieldGap,
  minWidth: 0,
});

/**
 * Fields side by side ending in their button (s09-settings.html .invite): the first fills
 * the line, the second takes its column, the rest their own width; one under another at
 * full width on a phone.
 */
export const settingsFieldRow = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  alignItems: "end",
  gap: settings.fieldRowGap,
  "@media": {
    [tabletUp]: {
      gridTemplateColumns: `minmax(0, 1fr) ${settings.fieldRowControlWidth}`,
      gridAutoFlow: "column",
      gridAutoColumns: "auto",
    },
  },
});

/** The members and the invitations of 9 (s09-settings.html .members, .inv). */
export const settingsList = style({
  display: "flex",
  flexDirection: "column",
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/**
 * Avatar | name, "(you)" and the email under it | the role | ⋯, lined up down the list,
 * and a note under the email across to the role ("This workspace needs at least one
 * Owner"). Without an avatar (an invitation): the email and what was sent | its actions.
 * A row without a control keeps no empty column for one.
 */
export const settingsRow = recipe({
  base: {
    display: "grid",
    alignItems: "center",
    columnGap: settings.rowGap,
    paddingBlock: settings.rowPaddingY,
    borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    selectors: {
      "&:first-child": {
        borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
      },
    },
  },
  variants: {
    hasAvatar: { true: {}, false: {} },
    hasControl: { true: {}, false: {} },
  },
  // Without a control (an invitation), no empty column and its gap take the title's room.
  compoundVariants: [
    {
      variants: { hasAvatar: true, hasControl: true },
      style: {
        gridTemplateColumns: `${settings.rowAvatarWidth} minmax(0, 1fr) auto ${settings.rowMenuWidth}`,
      },
    },
    {
      variants: { hasAvatar: true, hasControl: false },
      style: {
        gridTemplateColumns: `${settings.rowAvatarWidth} minmax(0, 1fr) ${settings.rowMenuWidth}`,
      },
    },
    {
      variants: { hasAvatar: false, hasControl: true },
      style: { gridTemplateColumns: "minmax(0, 1fr) auto auto" },
    },
    {
      variants: { hasAvatar: false, hasControl: false },
      style: { gridTemplateColumns: "minmax(0, 1fr) auto" },
    },
  ],
});

export const settingsRowAvatar = style({
  gridRow: "1 / 4",
  gridColumn: "1",
  alignSelf: "start",
  display: "flex",
});

/** The columns of the text, the control and the actions, with and without an avatar. */
const column = (withAvatar: string, without: string) =>
  ({
    true: { gridColumn: withAvatar },
    false: { gridColumn: without },
  }) as const;

export const settingsRowTitle = recipe({
  base: {
    ...typography("label"),
    gridRow: "1",
    minWidth: 0,
    overflowWrap: "anywhere",
  },
  variants: { hasAvatar: column("2", "1") },
});

export const settingsRowTitleNote = style({
  fontWeight: vars.typography.body.fontWeight,
  color: vars.color.text.tertiary,
});

export const settingsRowDescription = recipe({
  base: {
    ...typography("caption"),
    gridRow: "2",
    minWidth: 0,
    color: vars.color.text.secondary,
    overflowWrap: "anywhere",
  },
  variants: { hasAvatar: column("2", "1") },
});

export const settingsRowNote = recipe({
  base: {
    ...typography("captionSm"),
    gridRow: "3",
    color: vars.color.text.tertiary,
  },
  variants: { hasAvatar: column("2 / 4", "1 / 3") },
});

export const settingsRowControl = recipe({
  base: {
    gridRow: "1 / 3",
    display: "flex",
    justifySelf: "end",
  },
  variants: { hasAvatar: column("3", "2") },
});

export const settingsRowActions = recipe({
  base: {
    gridRow: "1 / 3",
    display: "flex",
    justifySelf: "end",
    gap: vars.space["50"],
  },
  variants: {
    hasAvatar: { true: {}, false: {} },
    hasControl: { true: {}, false: {} },
  },
  compoundVariants: [
    {
      variants: { hasAvatar: true, hasControl: true },
      style: { gridColumn: "4" },
    },
    {
      variants: { hasAvatar: true, hasControl: false },
      style: { gridColumn: "3" },
    },
    {
      variants: { hasAvatar: false, hasControl: true },
      style: { gridColumn: "3" },
    },
    {
      variants: { hasAvatar: false, hasControl: false },
      style: { gridColumn: "2" },
    },
  ],
});

// I: presentation (s23-deck.html).

const deck = vars.layout.presentation;

/** The tools' line across the body, a hairline under it (s23-deck.html .bar). */
export const deckBar = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: deck.barGap,
  paddingBlock: deck.barPaddingYMobile,
  paddingInline: gutter.mobile,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: {
      paddingBlock: deck.barPaddingY,
      paddingInline: deck.barPaddingX,
    },
  },
});

/** The title takes the whole first line on a phone (s23's .bar h1). */
export const deckTitle = style({
  marginInlineEnd: deck.barTitleGap,
  "@media": { [narrowQuery]: { flexBasis: "100%" } },
});

/** The main action at the end of the line; on a phone beside the tools, in place. */
export const deckAction = style({
  display: "flex",
  "@media": { [tabletUp]: { marginInlineStart: "auto" } },
});

/** The thumbnails on the left, down the body's height, and the slide on the right. */
export const presentation = style({
  display: "flex",
  flex: 1,
  minWidth: 0,
});

/**
 * The thumbnails' column (s23-deck.html .thumbs), in the page's flow: the page scrolls,
 * not the column too.
 */
export const thumbnails = style({
  flexShrink: 0,
  // The column's width holds the rule after it (s23-deck.html .thumbs' border-right).
  width: `calc(${deck.thumbnailColumnWidth} - ${vars.borderWidth.hairline})`,
  paddingBlock: deck.thumbnailPaddingY,
  paddingInline: deck.thumbnailPaddingX,
});

/** The hairline down the whole body between the thumbnails and the slide. */
export const thumbnailRule = style({
  flexShrink: 0,
  width: vars.borderWidth.hairline,
  background: vars.color.border.hairline,
});

/** The column of the slide: the links over it, the slide, the notes (s23 .stage). */
export const stage = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  paddingBlockStart: gutter.mobile,
  paddingBlockEnd: vars.layout.pagePaddingBottomMobile,
  paddingInline: gutter.mobile,
  "@media": {
    [tabletUp]: {
      paddingBlockStart: deck.stagePaddingTop,
      paddingBlockEnd: deck.stagePaddingBottom,
      paddingInline: deck.stagePaddingX,
    },
  },
});

/**
 * The links over the slide, the slide and the notes. Focus is put here when the
 * arrangement takes the thumbnails away and neither the previous nor the next can be
 * pressed; the column draws no ring.
 */
export const stageColumn = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
  maxWidth: deck.slideMax,
  minWidth: 0,
  outline: "none",
});

/** The quiet links over the slide, at its end (s23-deck.html .slide-tools). */
export const slideTools = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: deck.toolsGap,
  marginBlockEnd: deck.toolsMarginBottom,
  "@media": { [narrowQuery]: { justifyContent: "flex-start" } },
});

/**
 * The quiet links over the slide (s23-deck.html .slide-tools a): secondary, without an
 * underline, a little padding around each, a small box on hover.
 */
globalStyle(`${slideTools} > a`, {
  paddingBlock: deck.toolPaddingY,
  paddingInline: deck.toolPaddingX,
  borderRadius: vars.radius.chip,
  color: vars.color.text.secondary,
  textDecorationLine: "none",
});

globalStyle(`${slideTools} > a[data-hovered]`, {
  background: vars.color.surface.hover,
  color: vars.color.text.primary,
  textDecorationLine: "none",
});

export const notes = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  maxWidth: `calc(${deck.notesMeasure} * 1ch)`,
  marginBlockStart: deck.notesGap,
});

/**
 * The previous and next slide under the slide: on a phone, and beside a docked panel that
 * leaves the body too narrow for the thumbnails.
 */
export const slideNav = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
  marginBlockStart: deck.navGap,
});

export const slidePosition = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  fontVariantNumeric: "tabular-nums",
});

// J: public page (s01-landing.html).

const pub = vars.layout.public;

/** The public page's column: 1160px with its gutters, centred (.wrap). */
const publicColumn = {
  width: "100%",
  maxWidth: `calc(${vars.layout.publicMax} + 2 * ${gutter.mobile})`,
  marginInline: "auto",
  paddingInline: gutter.mobile,
  "@media": {
    [tabletUp]: {
      maxWidth: `calc(${vars.layout.publicMax} + 2 * ${gutter.tablet})`,
      paddingInline: gutter.tablet,
    },
    [desktopUp]: {
      maxWidth: `calc(${vars.layout.publicMax} + 2 * ${gutter.desktop})`,
      paddingInline: gutter.desktop,
    },
  },
} as const;

/** A public page's body text is 16px at every width (s01-landing.html body). */
export const publicRoot = style({
  vars: {
    [vars.typography.body.fontSize]: pub.bodyFontSize,
    [vars.typography.bodyLong.fontSize]: pub.bodyFontSize,
  },
});

/** The top bar: the crescent and "moonx", then Log in at the end, no line (.lnav). */
export const publicBar = style({
  ...publicColumn,
  display: "flex",
  alignItems: "center",
  gap: vars.space["300"],
  minHeight: pub.barHeightMobile,
  "@media": {
    ...publicColumn["@media"],
    [tabletUp]: {
      ...publicColumn["@media"][tabletUp],
      minHeight: pub.barHeight,
    },
  },
});

export const publicBrand = style({
  ...typography("brand"),
  display: "inline-flex",
  alignItems: "center",
  gap: pub.brandGap,
  color: vars.color.text.primary,
});

export const publicBrandMark = style({
  flexShrink: 0,
  width: pub.brandMarkSize,
  height: pub.brandMarkSize,
});

export const publicBarAction = style({
  display: "flex",
  marginInlineStart: "auto",
});

export const publicMain = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  outline: "none",
});

/**
 * A section of the page, a hairline above every one after the first: across the column
 * (.pair, .close) or, `isFullBleed`, from edge to edge (.stages).
 */
export const publicSection = recipe({
  base: {
    selectors: {
      "& + &": {
        borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
      },
    },
  },
  variants: {
    isFullBleed: { true: {}, false: publicColumn },
  },
});

/** How wide a section's text runs (s01-landing.html: .stages .lead, .pair p, .close p). */
const measure = (characters: string) => ({
  vars: { [textMeasure]: `calc(${characters} * 1ch)` },
});

/** The space above and under a section (72 to 88; 56 on a phone) and its arrangement. */
export const publicInner = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    paddingBlock: pub.sectionPaddingYMobile,
  },
  variants: {
    isFullBleed: { true: publicColumn, false: {} },
    layout: {
      // The hero: two columns in the middle of a window's height (.hero).
      hero: {
        flexDirection: "row",
        alignItems: "center",
        gap: pub.splitGap,
        "@media": {
          [tabletUp]: {
            // As tall as the window under the bar, up to its cap (min() and no
            // max-height, so text zoomed past the cap grows the hero, not over it).
            minHeight: `min(calc(100dvh - ${pub.barHeight} - ${pub.heroMinHeightOffset}), ${pub.heroMaxHeight})`,
            paddingBlockStart: pub.heroPaddingTop,
            paddingBlockEnd: pub.heroPaddingBottom,
          },
          [publicStackQuery]: {
            flexDirection: "column",
            alignItems: "stretch",
            gap: pub.stackGap,
            minHeight: 0,
            paddingBlockStart: pub.stackPaddingTop,
          },
        },
      },
      // Text beside an example (.pair).
      pair: {
        flexDirection: "row",
        alignItems: "center",
        gap: pub.splitGap,
        "@media": {
          [tabletUp]: {
            paddingBlockStart: pub.sectionPaddingTop,
            paddingBlockEnd: pub.sectionPaddingBottom,
          },
          [publicStackQuery]: {
            flexDirection: "column",
            alignItems: "stretch",
            gap: pub.stackGap,
            paddingBlockStart: pub.stackPaddingTop,
          },
          // A phone gives the section its usual space above again (s01's 767px rule).
          [narrowQuery]: { paddingBlockStart: pub.sectionPaddingYMobile },
        },
      },
      // One under another (.stages; 29 and 30's text).
      stack: {
        ...measure(pub.stackMeasure),
        "@media": {
          [tabletUp]: {
            paddingBlockStart: pub.sectionPaddingTop,
            paddingBlockEnd: pub.sectionPaddingBottomStack,
          },
        },
      },
      // The last word and its action, at the end of the line (.close).
      close: {
        ...measure(pub.closeMeasure),
        flexDirection: "row",
        flexWrap: "wrap",
        alignItems: "flex-end",
        gap: pub.closeGap,
        "@media": {
          [tabletUp]: {
            paddingBlockStart: pub.sectionPaddingTop,
            paddingBlockEnd: pub.sectionPaddingBottomClose,
          },
        },
      },
    },
  },
});

/** The columns of a hero (6 : 5) and of a pair (5 : 6). */
export const publicColumnStart = recipe({
  base: { minWidth: 0 },
  variants: {
    layout: {
      hero: { flex: `${pub.heroStartRatio} 1 0%` },
      pair: { flex: `${pub.pairStartRatio} 1 0%`, ...measure(pub.pairMeasure) },
    },
  },
});

export const publicColumnEnd = recipe({
  base: { minWidth: 0 },
  variants: {
    layout: {
      hero: { flex: `${pub.heroEndRatio} 1 0%` },
      pair: { flex: `${pub.pairEndRatio} 1 0%` },
    },
  },
});

/** The close's action at the end of the line; at the start once it wraps on a phone. */
export const publicCloseAction = style({
  display: "flex",
  "@media": { [tabletUp]: { marginInlineStart: "auto" } },
});

/** The foot: a hairline across, "moonx" and the links at the end (s01 footer). */
export const publicFooter = style({
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const publicFooterInner = style({
  ...publicColumn,
  ...typography("callout"),
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  // "moonx" at the start whether or not the links follow it (they push to the end).
  justifyContent: "flex-start",
  gap: pub.footerGapMobile,
  paddingBlock: pub.footerPaddingYMobile,
  color: vars.color.text.secondary,
  "@media": {
    ...publicColumn["@media"],
    [tabletUp]: {
      ...publicColumn["@media"][tabletUp],
      flexDirection: "row",
      alignItems: "center",
      gap: pub.footerGap,
      minHeight: pub.footerHeight,
      paddingBlock: 0,
    },
  },
});

export const publicFooterLinks = style({
  display: "flex",
  flexWrap: "wrap",
  gap: pub.footerLinksGap,
  "@media": { [tabletUp]: { marginInlineStart: "auto" } },
});
