import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import {
  focusRing,
  hoverTransition,
  tabletUp,
  typography,
} from "../styles/helpers";

/**
 * The phone's tabs (design-spec 4.3, moon-base.css .tabbar): under the body, taking their
 * own height (`layout.tab-bar-height`) and the safe area under them, never over the body.
 * Tablet and wider have the sidebar instead.
 */
export const tabBar = style({
  position: "sticky",
  bottom: 0,
  zIndex: vars.layout.zIndex.nav,
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "minmax(0, 1fr)",
  height: `calc(${vars.layout.tabBarHeight} + env(safe-area-inset-bottom))`,
  paddingBlockEnd: "env(safe-area-inset-bottom)",
  background: vars.color.surface.raised,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: { display: "none" },
  },
});

/**
 * A tab: its icon over its name. The name is never cut short: it wraps to a second line,
 * hyphenated, where the width runs out (4.3), and keeps the tab-label size at every scale.
 * The current tab is not filled: its name is semibold and an ink line marks its top edge,
 * 40% of the tab wide (moon-base.css .tabbar a[aria-current]).
 */
export const tab = style({
  ...hoverTransition,
  ...typography("tabLabel"),
  position: "relative",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  // From the top, so the icons line up whether a name takes one line or two.
  justifyContent: "flex-start",
  gap: vars.layout.tabBar.gap,
  minWidth: 0,
  paddingBlockStart: vars.layout.tabBar.paddingTop,
  paddingInline: vars.space["50"],
  border: "none",
  background: "none",
  color: vars.color.text.secondary,
  textAlign: "center",
  textDecoration: "none",
  hyphens: "auto",
  overflowWrap: "break-word",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
    "&[aria-current]": {
      ...typography("tabLabelCurrent"),
      color: vars.color.text.primary,
    },
    "&[aria-current]::before": {
      content: '""',
      position: "absolute",
      insetBlockStart: 0,
      insetInlineStart: `calc((1 - ${vars.layout.tabBar.indicatorRatio}) * 50%)`,
      width: `calc(${vars.layout.tabBar.indicatorRatio} * 100%)`,
      height: vars.borderWidth.tabIndicator,
      borderEndStartRadius: vars.layout.tabBar.indicatorRadius,
      borderEndEndRadius: vars.layout.tabBar.indicatorRadius,
      background: vars.color.control.primary,
    },
  },
});

/**
 * The name: as wide as the tab at most, so a long one wraps instead of pushing past it
 * (a flex item would otherwise keep its longest word's width).
 */
export const label = style({
  maxWidth: "100%",
  minWidth: 0,
});

/** The unread count over the icon's top right corner (the icon is centred in the tab). */
export const badge = style({
  position: "absolute",
  insetBlockStart: vars.space["100"],
  insetInlineStart: `calc(${vars.layout.tabBar.badgeInsetRatio} * 100%)`,
  display: "flex",
});
