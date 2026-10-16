import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import * as frame from "../internal/frame.css";
import {
  atLeastTarget,
  desktopUp,
  focusRing,
  hoverTransition,
  narrowQuery,
  tabletUp,
  typography,
} from "../styles/helpers";

// The arrangements of design-spec 4.1, A to J, at the three widths of 4.3. Each pattern
// spaces its parts by the density 4.4 gives its screens: regular for tables, numbers and
// lists (A, D, E, F, I), spacious for writing and steps (B, C, G, H, J).

/** A pattern fills the body's height, so a bar it fixes to the bottom sits low. */
export const root = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

const gutters = {
  paddingInline: vars.layout.pageGutterMobile,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
} as const;

/**
 * The page's column: `content` up to `layout.content-max`, `reading` up to
 * `layout.reading-column-max` (forms, a focused decision, settings), with the page
 * gutters, its parts spaced by the density's section gap.
 */
export const page = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minWidth: 0,
    marginInline: "auto",
    paddingBlock: vars.space["400"],
    ...gutters,
    "@media": {
      ...gutters["@media"],
      [tabletUp]: {
        ...gutters["@media"][tabletUp],
        paddingBlock: vars.space["500"],
      },
    },
  },
  variants: {
    width: {
      content: { maxWidth: vars.layout.contentMax },
      reading: { maxWidth: vars.layout.readingColumnMax },
    },
    density: {
      regular: { gap: vars.density.regular.sectionGap },
      spacious: { gap: vars.density.spacious.sectionGap },
    },
  },
});

/** A title and the actions beside it, wrapping under it when the width runs out. */
export const headerRow = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: vars.space["300"],
});

export const headerTitle = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  flex: "1 1 auto",
  minWidth: 0,
});

export const headerActions = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: vars.space["100"],
});

// A: hub.

/** The hub's two columns on a desktop: the main column, then the side column. */
export const hubColumns = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
  alignItems: "start",
  columnGap: vars.density.regular.sectionGap,
});

/** A column of blocks; below the desktop breakpoint, the only one. */
export const hubColumn = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.sectionGap,
  minWidth: 0,
});

export const hubBlock = style({ minWidth: 0 });

// C: question form.

export const questions = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.blockGap,
});

/** The Focus switch where there is no AppFrame header to hold it: beside the heading. */
export const inlineTools = style({
  display: "flex",
});

/** The previous and next section, under the questions (6.2). */
export const sectionFooter = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
  paddingBlockStart: vars.space["300"],
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

/**
 * The phone's position among the questions, between ← and → (6.2's dots). Dots that do
 * not fit scroll sideways inside it, never the page (4.3), as a long row of tabs does.
 */
export const barMiddle = style({
  display: "flex",
  flex: 1,
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

// D: list and detail.

/** The list's header (title, filters, new item) over the panes, then the panes. */
export const listDetailRoot = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flex: 1,
  minWidth: 0,
});

/** On a desktop, the list on the left and the detail on the right; narrower, one pane. */
export const listDetail = style({
  display: "flex",
  flex: 1,
  minWidth: 0,
  gap: vars.density.regular.sectionGap,
});

export const listPane = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flex: 1,
  minWidth: 0,
  "@media": {
    [desktopUp]: {
      flex: "none",
      width: vars.layout.listPaneWidth,
    },
  },
});

/** Without a detail (8 Notifications): the list alone, as wide as the reading column. */
export const listOnly = style({
  "@media": {
    [desktopUp]: { flex: 1, width: "auto" },
  },
});

/**
 * The selected item. On a desktop it stays in view under the header while the list
 * scrolls, scrolling on its own when taller than the window.
 */
export const detailPane = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flex: 1,
  minWidth: 0,
  // Focus is put here when it opens in place of the list; the pane draws no ring.
  outline: "none",
  "@media": {
    [desktopUp]: {
      position: "sticky",
      top: `calc(${frame.top} + ${vars.space["500"]})`,
      alignSelf: "flex-start",
      maxHeight: `calc(100dvh - ${frame.top} - 2 * ${vars.space["500"]})`,
      overflowY: "auto",
      paddingInlineStart: vars.density.regular.sectionGap,
      borderInlineStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
  },
});

/** ← back to the list, above the detail on a tablet and a phone. */
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

// F: worksheet.

/** On a desktop, the inputs on the left and the results on the right. */
export const worksheet = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.density.regular.sectionGap,
});

export const inputs = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flex: 1,
  minWidth: 0,
});

/** The results stay in view while the inputs scroll (4.1 F). */
export const results = style({
  position: "sticky",
  top: `calc(${frame.top} + ${vars.space["500"]})`,
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flexShrink: 0,
  width: vars.layout.sidePanelWidth,
  maxHeight: `calc(100dvh - ${frame.top} - 2 * ${vars.space["500"]})`,
  overflowY: "auto",
});

/** The summary bar's button: the whole bar opens the results. */
export const summaryButton = style({
  ...hoverTransition,
  ...typography("label"),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["200"],
  flex: 1,
  minWidth: 0,
  minHeight: atLeastTarget(vars.scale.component.button.height.M),
  paddingInline: vars.space["100"],
  border: "none",
  borderRadius: vars.radius.control,
  background: "none",
  color: vars.color.text.primary,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered], &[data-pressed]": {
      background: vars.color.surface.hover,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
});

// G: steps.

/** The two sides of the diff (25 ③): side by side, one above the other on a phone. */
export const comparison = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
  gap: vars.density.spacious.gap,
  "@media": {
    [narrowQuery]: { gridTemplateColumns: "minmax(0, 1fr)" },
  },
});

export const comparisonSide = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.gap,
  minWidth: 0,
});

// H: settings.

/**
 * A group of settings: its name on the left and its fields on the right, from the
 * tablet breakpoint up; one above the other on a phone. Rules between the groups.
 */
export const settingsGroup = style({
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: vars.density.spacious.gap,
  paddingBlockStart: vars.density.spacious.sectionGap,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: {
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 2fr)",
      columnGap: vars.density.spacious.blockGap,
    },
  },
});

export const settingsLabel = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
});

export const settingsContent = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.fieldGap,
  minWidth: 0,
});

// I: presentation.

/** The thumbnails on the left and the slide on the right, its notes under it. */
export const presentation = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.density.regular.sectionGap,
});

export const thumbnails = style({
  position: "sticky",
  top: `calc(${frame.top} + ${vars.space["500"]})`,
  flexShrink: 0,
  width: vars.layout.thumbnailColumnWidth,
  maxHeight: `calc(100dvh - ${frame.top} - 2 * ${vars.space["500"]})`,
  overflowY: "auto",
});

export const stage = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
  flex: 1,
  minWidth: 0,
});

/** Every slide at the phone's width, one under another. */
export const slideStack = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.regular.blockGap,
});

// J: public page.

/** The public page's top bar and foot, at the content's width with its gutters. */
export const publicBar = style({
  width: "100%",
  maxWidth: vars.layout.contentMax,
  marginInline: "auto",
  paddingBlock: vars.space["300"],
  ...gutters,
});

export const publicFooter = style([
  publicBar,
  {
    borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  },
]);
