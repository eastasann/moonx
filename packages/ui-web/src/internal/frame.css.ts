import { vars } from "@moonx/ui-tokens";
import {
  createVar,
  fallbackVar,
  globalStyle,
  style,
  styleVariants,
} from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  desktopUp,
  focusRing,
  narrowQuery,
  tabletUp,
  typography,
} from "../styles/helpers";

// What a frame tells the patterns inside it, as CSS variables on its root: where its
// sticky header ends and where its TabBar begins. Outside a frame both are 0, so a
// pattern works on its own (in /dev/components, in PageFrame).

/** The height of AppFrame's sticky header: sticky panes stop under it. */
export const topInset = createVar();

/** On a phone, the TabBar and the safe area under it: bottom bars rest on its top edge. */
export const bottomInset = createVar();

/**
 * The safe area a bottom bar keeps under itself. Above a TabBar it is 0: the TabBar
 * keeps the safe area (design-spec 4.3); without one (login, public pages) the bar does.
 */
export const barSafeArea = createVar();

export const top = fallbackVar(topInset, "0px");
export const bottom = fallbackVar(bottomInset, "0px");
const safeArea = fallbackVar(barSafeArea, "env(safe-area-inset-bottom)");

/** The keyboard's overlap, measured on the element that rises above it. */
export const keyboardInset = createVar();
const keyboard = fallbackVar(keyboardInset, "0px");

/** AppFrame's root: on a phone its TabBar covers the bottom of the window. */
export const withTabBar = style({});

/** AppFrame's root while its sticky header covers the top of the window. */
export const withHeader = style({});

/** Every bottom bar, whatever its variant: what the scroll padding below looks for. */
export const bar = style({});

const barBase = {
  position: "sticky",
  // At the end of a short page too: the pattern fills the body's height.
  marginBlockStart: "auto",
  bottom: `max(${bottom}, ${keyboard})`,
  zIndex: vars.layout.zIndex.bottomAction,
  display: "flex",
  paddingInline: vars.layout.pageGutterMobile,
  background: vars.color.surface.canvas,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    // F's summary bar beside a docked panel, in line with the page's gutters.
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
} as const;

/**
 * A bar fixed to the bottom of the body (design-spec 4.1 A・B・C・F・G, 4.3): it rests on
 * the TabBar, or on the window's edge where there is none, and rises above the on-screen
 * keyboard by the height the keyboard covers.
 * - `actions`: the main actions (d1-moon.html .actionbar, s19-decision.html .formbar,
 *   s25-import.html .fixbar), 10px above and under the XL buttons on a phone.
 * - `footer`: a question form's previous section, AI ▼ and next (s11-form.html .footer).
 * - `navigation`: a phone's previous and next question (s11-form.html .mnav).
 * - `summary`: a worksheet's results in brief (s17-costs.html .sumbar), on the raised
 *   ground under the light frame.
 */
export const bottomBar = styleVariants({
  actions: {
    ...barBase,
    minHeight: `calc(${vars.layout.bottomActionHeight} + ${safeArea})`,
    paddingBlockStart: vars.layout.bottomBarPaddingY,
    paddingBlockEnd: `calc(${vars.layout.bottomBarPaddingY} + ${safeArea})`,
    "@media": {
      ...barBase["@media"],
      [tabletUp]: {
        ...barBase["@media"][tabletUp],
        minHeight: 0,
        paddingBlock: vars.layout.steps.barPaddingY,
      },
    },
  },
  footer: {
    ...barBase,
    paddingBlock: vars.layout.questionForm.footerPaddingY,
  },
  navigation: {
    ...barBase,
    minHeight: `calc(${vars.layout.bottomNavHeight} + ${safeArea})`,
    paddingInline: vars.layout.questionForm.bottomNavPaddingX,
    paddingBlockEnd: safeArea,
  },
  summary: {
    ...barBase,
    minHeight: `calc(${vars.layout.summaryBarHeight} + ${safeArea})`,
    paddingBlockEnd: safeArea,
    background: vars.color.surface.raised,
    borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  },
});

const columns = {
  reading: vars.layout.readingColumnMax,
  form: vars.layout.formColumnMax,
  comparison: vars.layout.comparisonMax,
  worksheet: vars.layout.worksheetMax,
} as const;

/**
 * What the bar holds: at the end of the line, its buttons side by side. From the tablet
 * breakpoint up a bar lines up with the page's column (the gutters are the bar's).
 */
export const barInner = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: vars.layout.steps.barGap,
    flex: 1,
    minWidth: 0,
    marginInline: "auto",
  },
  variants: {
    variant: {
      actions: {},
      footer: {
        justifyContent: "space-between",
        gap: vars.layout.questionForm.footerGap,
      },
      navigation: {
        display: "grid",
        gridTemplateColumns: `${vars.layout.questionForm.bottomNavColumn} minmax(0, 1fr) ${vars.layout.questionForm.bottomNavColumn}`,
        justifyItems: "center",
        gap: 0,
      },
      summary: {
        justifyContent: "flex-start",
        gap: vars.layout.worksheet.summaryGap,
      },
    },
    column: Object.fromEntries(
      Object.entries(columns).map(([name, max]) => [
        name,
        { "@media": { [tabletUp]: { maxWidth: max } } },
      ]),
    ) as Record<keyof typeof columns, { "@media": Record<string, object> }>,
  },
});

/** G's note at the start of its bar (s25-import.html .fixbar .note). */
export const barNote = style({
  ...typography("caption"),
  marginInlineEnd: "auto",
  color: vars.color.text.secondary,
});

/**
 * A bottom bar on a phone only (4.1 B): from the tablet breakpoint up it is an ordinary
 * row right under the form, in the page's column, with the page's space under it.
 */
export const phoneOnlyBar = style({
  "@media": {
    [tabletUp]: {
      position: "static",
      minHeight: 0,
      marginBlockStart: 0,
      paddingBlockStart: 0,
      paddingBlockEnd: vars.layout.focus.paddingBottom,
      background: "none",
      borderBlockStart: "none",
    },
  },
});

/**
 * The phone's new-item button at the bottom right of a list (4.1 D, s06-ideas.html .fab):
 * it floats over the list as it scrolls, 16px above the TabBar or the keyboard and from
 * the right edge; the space it takes at the end keeps the last row clear of it.
 */
export const floatingAction = style({
  position: "sticky",
  bottom: `max(${bottom}, ${keyboard})`,
  zIndex: vars.layout.zIndex.bottomAction,
  alignSelf: "flex-end",
  marginBlockStart: "auto",
  paddingInlineEnd: vars.layout.listDetail.floatingActionOffset,
  paddingBlockEnd: vars.layout.listDetail.floatingActionOffset,
  pointerEvents: "none",
});

/** 56×56, the ink fill, a soft shadow (06 shadow.floating-action). */
export const floatingButton = style({
  display: "grid",
  placeItems: "center",
  width: vars.layout.listDetail.floatingActionSize,
  height: vars.layout.listDetail.floatingActionSize,
  padding: 0,
  border: "none",
  borderRadius: vars.layout.listDetail.floatingActionRadius,
  background: vars.color.control.primary,
  boxShadow: vars.shadow.floatingAction,
  color: vars.color.control.onPrimary,
  cursor: "pointer",
  outline: "none",
  pointerEvents: "auto",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-pressed]": { background: vars.color.control.primaryPressed },
    "&[data-focus-visible]": focusRing,
  },
});

/**
 * The bands across the top of the body (6.0.6): under AppFrame's header, or at the top of
 * a PageFrame screen, from edge to edge, each with its own rule under it.
 */
export const bands = style({
  display: "flex",
  flexDirection: "column",
});

// A field brought into view (useKeepAboveKeyboard, the browser's own focus scrolling)
// stops clear of what covers the window's edges. The variables above live on the frame,
// not on html, so these rules spell the heights out, each bar as tall as the tallest
// (`actions` on a phone). Without a frame, a bar alone:
const barHeight = `calc(${vars.layout.bottomActionHeight} + env(safe-area-inset-bottom))`;
globalStyle(`html:where(:has(${bar}:not(${phoneOnlyBar})))`, {
  scrollPaddingBottom: barHeight,
});
globalStyle(`html:where(:has(${bar}${phoneOnlyBar}))`, {
  "@media": { [narrowQuery]: { scrollPaddingBottom: barHeight } },
});
// In AppFrame on a phone, the TabBar, and a bar on top of it:
const tabBarHeight = `calc(${vars.layout.tabBarHeight} + env(safe-area-inset-bottom))`;
globalStyle(`html:has(${withTabBar})`, {
  "@media": { [narrowQuery]: { scrollPaddingBottom: tabBarHeight } },
});
globalStyle(`html:has(${withTabBar}):has(${bar})`, {
  "@media": {
    [narrowQuery]: {
      scrollPaddingBottom: `calc(${vars.layout.bottomActionHeight} + ${tabBarHeight})`,
    },
  },
});
// And the header at the top; AppFrame writes its measured height over this one.
globalStyle(`html:has(${withHeader})`, {
  scrollPaddingTop: vars.layout.headerHeight,
});
