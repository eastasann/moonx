import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import {
  focusRing,
  hoverTransition,
  tabletUp,
  typography,
} from "../styles/helpers";

/**
 * The phone's tabs (design-spec 4.3): under the body, taking their own height
 * (`layout.tab-bar-height`) and the safe area under them, never over the body. Tablet and
 * wider have the sidebar instead.
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
  background: vars.color.surface.canvas,
  borderBlockStart: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  "@media": {
    [tabletUp]: { display: "none" },
  },
});

/**
 * A tab: its icon over its name. The name is never cut short: it wraps to a second line,
 * hyphenated, where the width runs out (4.3), and keeps the tab-label size at every scale.
 * The current tab has the selected surface and the ink line, on its top edge where the
 * sidebar's current page has it at its start (06 surface.selected,
 * border-width.selected-indicator).
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
  gap: vars.space["50"],
  minWidth: 0,
  paddingBlockStart: vars.space["100"],
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
      background: vars.color.surface.selected,
      color: vars.color.text.primary,
    },
    "&[aria-current]::before": {
      content: '""',
      position: "absolute",
      insetInline: vars.space["200"],
      insetBlockStart: 0,
      height: vars.borderWidth.selectedIndicator,
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
  insetBlockStart: vars.space["50"],
  insetInlineStart: `calc(50% + ${vars.space["75"]})`,
  display: "flex",
});
