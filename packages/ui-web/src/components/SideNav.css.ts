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

/**
 * The sidebar (design-spec 4.3・6.0.1): none on a phone, which has the TabBar; icons
 * only on a tablet (`layout.sidebar-width-collapsed`); names beside them on a desktop
 * (`layout.sidebar-width`). It stays in view while the page scrolls and scrolls on its
 * own when its items do not fit the window's height.
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
      gap: vars.space["200"],
      width: vars.layout.sidebarWidthCollapsed,
      height: "100dvh",
      overflowY: "auto",
      overscrollBehavior: "contain",
      paddingBlock: vars.space["200"],
      paddingInline: vars.space["100"],
      background: vars.color.surface.canvas,
      borderInlineEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    },
    [desktopUp]: {
      width: vars.layout.sidebarWidth,
      paddingInline: vars.space["200"],
    },
  },
});

export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["25"],
  margin: 0,
  padding: 0,
  listStyle: "none",
});

/** A row of the sidebar: the workspace, a page, the account. */
const row = style({
  ...hoverTransition,
  ...typography("label"),
  position: "relative",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: vars.space["100"],
  width: "100%",
  minHeight: atLeastTarget(vars.density.regular.rowHeight),
  paddingInline: vars.space["100"],
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
 * A page. The current one has the selected surface and the ink line at its start
 * (06 surface.selected, border-width.selected-indicator).
 */
export const item = style([
  row,
  {
    selectors: {
      "&[aria-current=page]": {
        background: vars.color.surface.selected,
        boxShadow: `inset ${vars.borderWidth.selectedIndicator} 0 0 0 ${vars.color.control.primary}`,
        color: vars.color.text.primary,
      },
    },
  },
]);

/** The workspace's name at the top, which opens M7. */
export const workspace = style([
  row,
  {
    color: vars.color.text.primary,
    fontWeight: vars.typography.heading4.fontWeight,
  },
]);

/** The account at the bottom, under the pages. */
export const account = style([row, { marginBlockStart: "auto" }]);

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

/** The account's ⇕ after its name, on a desktop: the avatar alone stands for it on a tablet. */
export const chevron = style({
  display: "none",
  color: vars.color.text.secondary,
  "@media": { [desktopUp]: { display: "flex" } },
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
