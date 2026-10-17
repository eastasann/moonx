import { vars } from "@moonx/ui-tokens";
import {
  createVar,
  fallbackVar,
  globalStyle,
  style,
} from "@vanilla-extract/css";
import { desktopUp, narrowQuery, tabletUp } from "../styles/helpers";

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

/**
 * A bar fixed to the bottom of the body (design-spec 4.1 A・B・C・F・G, 4.3): it rests on
 * the TabBar, or on the window's edge where there is none, and rises above the on-screen
 * keyboard by the height the keyboard covers.
 */
export const bottomBar = style({
  position: "sticky",
  // At the end of a short page too: the pattern fills the body's height.
  marginBlockStart: "auto",
  bottom: `max(${bottom}, ${keyboard})`,
  zIndex: vars.layout.zIndex.bottomAction,
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: vars.space["200"],
  minHeight: `calc(${vars.layout.bottomActionHeight} + ${safeArea})`,
  paddingInline: vars.layout.pageGutterMobile,
  paddingBlockStart: vars.space["100"],
  paddingBlockEnd: `calc(${vars.space["100"]} + ${safeArea})`,
  background: vars.color.surface.canvas,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    // F's summary bar beside a docked panel, in line with the page's gutters.
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
});

/**
 * A bottom bar on a phone only (4.1 B, 6.7): from the tablet breakpoint up it is an
 * ordinary row at the end of the page's column, under the form.
 */
export const phoneOnlyBar = style({
  "@media": {
    [tabletUp]: {
      position: "static",
      width: "100%",
      maxWidth: vars.layout.readingColumnMax,
      minHeight: 0,
      // Right under the content, however tall the body.
      marginBlockStart: 0,
      marginInline: "auto",
      paddingBlockStart: 0,
      paddingBlockEnd: vars.space["500"],
      background: "none",
      borderBlockStart: "none",
    },
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
});

/** A phone-only bar under a page of the content's width (G's diff step). */
export const phoneOnlyContent = style({
  "@media": {
    [tabletUp]: { maxWidth: vars.layout.contentMax },
  },
});

/**
 * The phone's new-item button at the bottom right of a list (4.1 D `floatingAction`): it
 * floats over the list as it scrolls, rests on the TabBar and rises above the keyboard;
 * the space it takes at the end keeps the last row clear of it.
 */
export const floatingAction = style({
  position: "sticky",
  bottom: `calc(max(${bottom}, ${keyboard}) + ${vars.layout.pageGutterMobile})`,
  zIndex: vars.layout.zIndex.bottomAction,
  alignSelf: "flex-end",
  marginBlockStart: "auto",
  paddingInline: vars.layout.pageGutterMobile,
  paddingBlockEnd: vars.layout.pageGutterMobile,
});

/**
 * The bands across the top of the body (6.0.6): under AppFrame's header, or at the top of
 * a PageFrame screen.
 */
export const bands = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  paddingBlockStart: vars.space["200"],
  paddingInline: vars.layout.pageGutterMobile,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
});

// A field brought into view (useKeepAboveKeyboard, the browser's own focus scrolling)
// stops clear of what covers the window's edges. The variables above live on the frame,
// not on html, so these rules spell the heights out. Without a frame, a bar alone:
const barHeight = `calc(${vars.layout.bottomActionHeight} + env(safe-area-inset-bottom))`;
globalStyle(`html:where(:has(${bottomBar}:not(${phoneOnlyBar})))`, {
  scrollPaddingBottom: barHeight,
});
globalStyle(`html:where(:has(${bottomBar}${phoneOnlyBar}))`, {
  "@media": { [narrowQuery]: { scrollPaddingBottom: barHeight } },
});
// In AppFrame on a phone, the TabBar, and a bar on top of it:
const tabBarHeight = `calc(${vars.layout.tabBarHeight} + env(safe-area-inset-bottom))`;
globalStyle(`html:has(${withTabBar})`, {
  "@media": { [narrowQuery]: { scrollPaddingBottom: tabBarHeight } },
});
globalStyle(`html:has(${withTabBar}):has(${bottomBar})`, {
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
