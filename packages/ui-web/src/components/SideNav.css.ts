import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import {
  atLeastTarget,
  desktopUp,
  focusRing,
  hoverTransition,
  tabletUp,
  typography,
} from "../styles/helpers";

/** Hidden from sight, still read: the labels of the tablet's icon-only sidebar. */
const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  margin: "-1px",
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const side = vars.layout.sideNav;

/**
 * The sidebar (design-spec 4.3・6.0.1, moon-base.css .side): none on a phone, which has
 * the TabBar; icons only on a tablet (`layout.sidebar-width-collapsed`); names beside them
 * on a desktop (`layout.sidebar-width`). It stays in view while the page scrolls and
 * scrolls on its own when its items do not fit the window's height.
 */
export const sideNav = style({
  display: "none",
  "@media": {
    [tabletUp]: {
      position: "sticky",
      top: 0,
      zIndex: vars.layout.zIndex.nav,
      display: "flex",
      flexDirection: "column",
      gap: side.gap,
      flexShrink: 0,
      width: vars.layout.sidebarWidthCollapsed,
      height: "100dvh",
      overflowY: "auto",
      overscrollBehavior: "contain",
      paddingBlock: side.paddingY,
      paddingInline: side.paddingX,
      background: vars.color.surface.canvas,
      borderInlineEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
    [desktopUp]: { width: vars.layout.sidebarWidth },
  },
});

/** The crescent and "moonx" at the top (moon-base.css .brand): the mark alone on a tablet. */
export const brand = style({
  ...typography("heading4"),
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: side.brandGap,
  paddingBlockStart: side.brandPaddingTop,
  paddingBlockEnd: side.brandPaddingBottom,
  paddingInline: side.brandPaddingX,
  color: vars.color.text.primary,
  "@media": {
    [desktopUp]: { justifyContent: "flex-start" },
  },
});

export const brandMark = style({
  flexShrink: 0,
  width: side.brandMarkSize,
  height: side.brandMarkSize,
});

/** The pages under the workspace (moon-base.css .nav). */
export const pages = style({
  display: "flex",
  flexDirection: "column",
  gap: side.listGap,
  marginBlockStart: side.listMarginTop,
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: side.listGap,
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** The rule before Settings and Admin (moon-base.css .nav hr). */
export const rule = style({
  alignSelf: "stretch",
  marginBlock: side.ruleMarginY,
  marginInline: side.ruleMarginX,
  border: 0,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

/** A row of the sidebar: the workspace, a page, the account. */
const row = style({
  ...hoverTransition,
  ...typography("label"),
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: side.itemGap,
  width: "100%",
  minHeight: atLeastTarget("0px"),
  paddingBlock: side.itemPaddingY,
  paddingInline: side.itemPaddingX,
  border: "none",
  borderRadius: vars.radius.control,
  background: "none",
  color: vars.color.text.secondary,
  textAlign: "start",
  textDecoration: "none",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": {
      background: vars.color.surface.hover,
      color: vars.color.text.primary,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
  "@media": {
    [desktopUp]: { justifyContent: "flex-start" },
  },
});

/**
 * A page. The current one has the selected surface and a hairline frame inside its edge,
 * with no line at its start (moon-base.css .nav a[aria-current]; 06 surface.selected); its
 * name is semibold, as the TabBar's current tab's is, so it is told apart by more than the
 * faint frame and the darker colour (design-spec 4.4: not by colour alone).
 */
export const item = style([
  row,
  {
    selectors: {
      "&[aria-current=page]": {
        background: vars.color.surface.selected,
        boxShadow: `inset 0 0 0 ${vars.borderWidth.hairline} ${vars.color.border.hairline}`,
        color: vars.color.text.primary,
        fontWeight: vars.typography.heading4.fontWeight,
      },
    },
  },
]);

/**
 * The workspace's name, which opens M7: a box with a hairline frame and ▾ at its end
 * (moon-base.css .ws), ▾ alone on a tablet.
 */
export const workspace = style([
  row,
  {
    ...typography("heading4"),
    justifyContent: "center",
    border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    color: vars.color.text.primary,
    "@media": {
      [desktopUp]: { justifyContent: "space-between" },
    },
  },
]);

/** The account at the bottom, under the pages: the avatar and the name (moon-base.css .user). */
export const account = style([
  row,
  {
    marginBlockStart: "auto",
    color: vars.color.text.primary,
  },
]);

/** A row's name: beside its icon on a desktop, only read on a tablet. */
export const label = style({
  ...visuallyHidden,
  "@media": {
    [desktopUp]: {
      position: "static",
      width: "auto",
      height: "auto",
      margin: 0,
      overflow: "hidden",
      clip: "auto",
      flex: 1,
      minWidth: 0,
      textOverflow: "ellipsis",
    },
  },
});

/**
 * The unread count: at the end of the row on a desktop; on a tablet, where the row is
 * the icon alone, over the icon's top right corner, reaching into the sidebar's
 * padding but not across its rule.
 */
export const badge = style({
  position: "absolute",
  insetBlockStart: 0,
  insetInlineEnd: `calc(-1 * ${vars.space["75"]})`,
  display: "flex",
  "@media": {
    [desktopUp]: { position: "static" },
  },
});
