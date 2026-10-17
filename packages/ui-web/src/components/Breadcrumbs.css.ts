import { type BreadcrumbsSize, breadcrumbsSizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  narrowQuery,
} from "../styles/helpers";

const sized = Object.fromEntries(
  breadcrumbsSizes.map((size) => [size, size]),
) as Record<BreadcrumbsSize, BreadcrumbsSize>;

/**
 * One line of crumbs (06 component.breadcrumbs). Phones do not show it: the screen shows
 * ← and the place it goes back to instead (design-spec 4.5・6.0.1).
 */
export const list = styleVariants(sized, (size) => ({
  display: "flex",
  alignItems: "center",
  gap: vars.scale.component.breadcrumbs.gap[size],
  // The line's width, not the crumbs': the current crumb's half (`item`) is of the room
  // the header gives, so a short trail is never cut ("Dashboard" alone).
  flex: "1 1 auto",
  minWidth: 0,
  margin: 0,
  padding: 0,
  listStyle: "none",
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.scale.component.breadcrumbs.fontSize[size],
  lineHeight: vars.typography.label.lineHeight,
  "@media": { [narrowQuery]: { display: "none" } },
}));

/** A crumb shrinks to an ellipsis before the line would wrap; the current one last. */
export const item = styleVariants(sized, (size) => ({
  display: "flex",
  alignItems: "center",
  gap: vars.scale.component.breadcrumbs.gap[size],
  minWidth: 0,
  color: vars.color.text.secondary,
  selectors: { "&:last-child": { flexShrink: 0, maxWidth: "50%" } },
}));

/**
 * A crumb's text fills the row's height, so the link is a full target (design-spec 4.5)
 * and still ends in an ellipsis when it is too long.
 */
export const linkSize = styleVariants(sized, (size) => ({
  lineHeight: atLeastTarget(vars.scale.component.breadcrumbs.height[size]),
}));

export const link = style({
  ...hoverTransition,
  display: "block",
  // A short crumb ("Plan") is still a full target across, as well as down.
  minWidth: vars.scale.component.targetMin,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  borderRadius: vars.radius.chip,
  color: vars.color.text.secondary,
  textDecoration: "none",
  outline: "none",
  selectors: {
    "&[data-hovered]": {
      color: vars.color.text.primary,
      textDecoration: "underline",
    },
    "&[data-focus-visible]": focusRing,
  },
});

/** The current page reads stronger than the levels above it. */
export const current = style({
  color: vars.color.text.primary,
  fontWeight: vars.typography.label.fontWeight,
});

export const separator = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.text.secondary,
});
