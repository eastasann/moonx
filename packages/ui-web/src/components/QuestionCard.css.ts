import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { focusRing, hoverTransition, typography } from "../styles/helpers";

/** The focused question: the card's frame and shadow mark where the answer goes (4.4). */
export const focused = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.gap,
  padding: vars.density.spacious.panelPadding,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.card,
  background: vars.color.surface.raised,
  boxShadow: vars.shadow.raised,
  color: vars.color.text.primary,
  scrollMarginBlock: vars.space["400"],
});

/** Open without the focus: the same content, set apart by space alone. */
export const open = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.gap,
  paddingBlock: vars.density.spacious.panelPadding,
  paddingInline: vars.density.spacious.panelPadding,
  color: vars.color.text.primary,
});

/**
 * A quiet question: quieter text, still readable (4.1 C), the whole card pressing through
 * its title's button.
 */
export const quiet = style({
  ...hoverTransition,
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  paddingBlock: vars.space["200"],
  paddingInline: vars.density.spacious.panelPadding,
  borderRadius: vars.radius.card,
  color: vars.color.text.secondary,
  selectors: {
    "&:hover": { background: vars.color.surface.hover },
  },
});

export const quietHeader = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  minWidth: 0,
});

/** The F/A/U moon at the quiet card's start: down the left edge, the states line up. */
export const glyph = style({ display: "inline-flex", flexShrink: 0 });

export const header = style({
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  columnGap: vars.space["200"],
  rowGap: vars.space["75"],
  minWidth: 0,
});

/** The template's title, as written, in the monospaced face (design-spec 4.4・6.2). */
export const title = style({
  ...typography("id"),
  margin: 0,
  color: vars.color.text.secondary,
  overflowWrap: "anywhere",
});

/** The title's button covers the quiet card, so the card presses as a whole. */
export const press = style({
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  letterSpacing: "inherit",
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  "::after": {
    content: '""',
    position: "absolute",
    inset: 0,
    borderRadius: vars.radius.card,
  },
  selectors: {
    "&[data-focus-visible]::after": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars.borderWidth.focusRing})`,
    },
  },
});

export const meta = style({
  ...typography("labelSm"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["200"],
  marginInlineStart: "auto",
  flexShrink: 0,
});

export const comments = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["50"],
  fontVariantNumeric: "tabular-nums",
});

/** The answer's first lines: two at most (4.1 C). */
export const excerpt = style({
  ...typography("bodySm"),
  margin: 0,
  display: "-webkit-box",
  overflow: "hidden",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  overflowWrap: "anywhere",
});

export const emptyExcerpt = style({
  ...typography("bodySm"),
  margin: 0,
  color: vars.color.text.tertiary,
});

export const status = style({
  ...typography("labelSm"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
  color: vars.color.text.secondary,
});

export const actions = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["50"],
  marginInlineStart: "auto",
});

/** The question, larger than everything around it (design-spec 6.2). */
export const question = style({
  ...typography("heading4"),
  margin: 0,
  fontWeight: vars.typography.body.fontWeight,
  overflowWrap: "break-word",
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious.gap,
  minWidth: 0,
});
