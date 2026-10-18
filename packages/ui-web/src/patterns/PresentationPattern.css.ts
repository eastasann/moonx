import { vars } from "@moonx/ui-tokens";
import { globalStyle, style } from "@vanilla-extract/css";
import { focusRing, hoverTransition, typography } from "../styles/helpers";

const deck = vars.layout.presentation;

/** The thumbnails, one under another (s23-deck.html .thumbs). */
export const list = style({
  display: "flex",
  flexDirection: "column",
  gap: deck.thumbnailGap,
  margin: 0,
  padding: 0,
  outline: "none",
});

/**
 * A thumbnail: its number outside it, its title under it. The slide on screen has the
 * raised ground and a light frame inside its edge (s23-deck.html .thumbs li a[aria-current]).
 */
export const item = style({
  ...hoverTransition,
  display: "grid",
  gridTemplateColumns: `${deck.thumbnailNumberWidth} minmax(0, 1fr)`,
  columnGap: deck.thumbnailNumberGap,
  rowGap: vars.space["75"],
  alignItems: "start",
  padding: deck.thumbnailItemPadding,
  borderRadius: vars.radius.control,
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-selected]": {
      background: vars.color.surface.raised,
      boxShadow: `inset 0 0 0 ${vars.borderWidth.hairline} ${vars.color.border.default}`,
    },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
});

export const number = style({
  ...typography("count"),
  paddingBlockStart: vars.space["50"],
  color: vars.color.text.tertiary,
});

/** The slide drawn small, framed by the print's hairline as the PDF's page (.mini). */
export const mini = style({
  display: "block",
  overflow: "hidden",
  border: `${vars.borderWidth.hairline} solid ${vars.print.color.border}`,
  borderRadius: deck.thumbnailRadius,
});

export const caption = style({
  ...typography("captionXs"),
  gridColumn: "2",
  color: vars.color.text.secondary,
});

/**
 * The slide on screen's title is semibold: the light ring alone would tell it apart too
 * faintly (design-spec 4.4: not by colour alone).
 */
globalStyle(`${item}[data-selected] ${caption}`, {
  fontWeight: vars.typography.heading4.fontWeight,
  color: vars.color.text.primary,
});
