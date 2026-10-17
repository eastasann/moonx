import { vars } from "@moonx/ui-tokens";
import { globalStyle, style } from "@vanilla-extract/css";
import * as frame from "../internal/frame.css";
import {
  desktopUp,
  focusRing,
  narrowQuery,
  tabletUp,
  typography,
} from "../styles/helpers";

/**
 * The frame of every signed-in screen (design-spec 6.0.1): the TabBar under the body on a
 * phone; the sidebar beside the header and body from the tablet breakpoint up. The page
 * scrolls as a whole; the header, the sidebar and the TabBar stay in view. It tells the
 * patterns inside where its header ends and, on a phone, where its TabBar begins.
 */
export const frameRoot = style({
  display: "flex",
  flexDirection: "column",
  minHeight: "100dvh",
  vars: {
    [frame.topInset]: vars.layout.headerHeight,
  },
  "@media": {
    [narrowQuery]: {
      vars: {
        [frame.bottomInset]: `calc(${vars.layout.tabBarHeight} + env(safe-area-inset-bottom))`,
        [frame.barSafeArea]: "0px",
      },
    },
    [tabletUp]: { flexDirection: "row" },
  },
});

// A classic scrollbar coming and going would change the body's width, and with it the
// arrangement of D and F beside a docked panel (4.1), which changes the page's height and
// so the scrollbar again. On a desktop, its gutter is kept whether the page scrolls or
// not.
globalStyle(`html:has(${frameRoot})`, {
  "@media": { [desktopUp]: { scrollbarGutter: "stable" } },
});

/** Without a header, nothing covers the top of the body. */
export const headerless = style({
  vars: { [frame.topInset]: "0px" },
});

export const column = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

/** The first stop of Tab: hidden until it has focus, then over the header. */
export const skipLink = style({
  ...typography("label"),
  position: "absolute",
  insetBlockStart: vars.space["100"],
  insetInlineStart: vars.space["100"],
  zIndex: vars.layout.zIndex.toast,
  paddingBlock: vars.space["100"],
  paddingInline: vars.space["200"],
  borderRadius: vars.radius.control,
  background: vars.color.surface.overlay,
  boxShadow: vars.shadow.overlay,
  color: vars.color.text.primary,
  transform: "translateY(-200%)",
  selectors: {
    "&:focus": { transform: "none", ...focusRing },
  },
});

/** The header (6.0.1): where the page is, then its save state and panels. */
export const header = style({
  position: "sticky",
  top: 0,
  zIndex: vars.layout.zIndex.nav,
  display: "flex",
  alignItems: "center",
  gap: vars.space["200"],
  minHeight: vars.layout.headerHeight,
  paddingInline: vars.layout.pageGutterMobile,
  background: vars.color.surface.canvas,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
});

export const headerStart = style({
  display: "flex",
  alignItems: "center",
  flex: 1,
  minWidth: 0,
});

/**
 * ← and where it leads, on a phone only: wider screens have the breadcrumbs. A link, or a
 * button when ListDetailPattern points it at its list, which must not keep the
 * browser's own button face.
 */
export const back = style({
  ...typography("label"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
  minWidth: 0,
  minHeight: vars.scale.component.targetMin,
  padding: 0,
  border: "none",
  background: "none",
  cursor: "pointer",
  color: vars.color.text.primary,
  textDecoration: "none",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-focus-visible]": {
      ...focusRing,
      borderRadius: vars.radius.control,
    },
  },
  "@media": {
    [tabletUp]: { display: "none" },
  },
});

export const backLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const tools = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  flexShrink: 0,
});

/** A pattern's tools in the header (11's Focus): from the tablet breakpoint up. */
export const patternTools = style({
  display: "none",
  "@media": {
    [tabletUp]: { display: "contents" },
  },
});

/**
 * "Saving…" and "Saved" give up their words on a phone, keeping the mark (4.3);
 * "Couldn't save" keeps its words everywhere.
 */
export const saveLabelPhone = style({
  "@media": {
    [narrowQuery]: {
      position: "absolute",
      width: "1px",
      height: "1px",
      margin: "-1px",
      overflow: "hidden",
      clip: "rect(0 0 0 0)",
      whiteSpace: "nowrap",
    },
  },
});

export const saveState = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
});

/** 💬, holding the count of unresolved threads over its corner. */
export const comments = style({
  position: "relative",
  display: "flex",
});

/** Over the top right corner of 💬, letting presses through to the button. */
export const commentsCount = style({
  position: "absolute",
  insetBlockStart: vars.space["50"],
  insetInlineEnd: vars.space["50"],
  display: "flex",
  pointerEvents: "none",
});

/** The body and, on a desktop, the open panel in the column at its right. */
export const body = style({
  display: "flex",
  flex: 1,
  minWidth: 0,
});

/** The screen's own content: its pattern fills the height so a bottom bar sits low. */
export const main = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
  outline: "none",
});

/** As wide as the body and no height: what AppFrame measures the body's width by. */
export const bodyWidth = style({
  flexShrink: 0,
  height: 0,
});

/**
 * The desktop's panel column (4.3, 4.5 Panel): below the header and as tall as the rest
 * of the window, while the body scrolls beside it. The Panel opens as a drawer or a tray
 * on narrower screens, leaving the column empty.
 */
export const panel = style({
  position: "sticky",
  top: frame.top,
  display: "flex",
  flexShrink: 0,
  height: `calc(100dvh - ${frame.top})`,
  selectors: {
    "&:empty": { display: "none" },
  },
});
