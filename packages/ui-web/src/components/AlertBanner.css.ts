import { statusVariants, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { desktopUp, tabletUp, typography } from "../styles/helpers";

/**
 * From edge to edge under the header: the sunken ground, a hairline under it, the page's
 * gutters, secondary text (d1-moon.html .banner). Several stand one under another.
 */
export const banner = style({
  ...typography("callout"),
  display: "flex",
  alignItems: "center",
  gap: vars.layout.band.gap,
  paddingBlock: vars.layout.band.paddingY,
  paddingInline: vars.layout.pageGutterMobile,
  background: vars.color.surface.sunken,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  color: vars.color.text.secondary,
  "@media": {
    [tabletUp]: { paddingInline: vars.layout.pageGutterTablet },
    [desktopUp]: { paddingInline: vars.layout.pageGutterDesktop },
  },
});

/** The icon in its status colour: informative is the secondary ink (06 *.fg). */
export const icon = styleVariants(
  Object.fromEntries(statusVariants.map((v) => [v, v])) as Record<
    (typeof statusVariants)[number],
    (typeof statusVariants)[number]
  >,
  (variant) => ({
    display: "inline-flex",
    flexShrink: 0,
    color: vars.color[variant].fg,
  }),
);

export const message = style({
  flex: "1 1 auto",
  minWidth: 0,
  margin: 0,
});

export const title = style({
  ...typography("callout"),
  fontWeight: vars.typography.heading4.fontWeight,
  color: vars.color.text.primary,
});

/**
 * The action at the end of the band (d1-moon.html .banner .link). Where the band is
 * narrow a Link wraps too, so the message is not squeezed into more lines than it needs;
 * it keeps its longest word, so a Button stays whole.
 */
export const action = style({
  display: "inline-flex",
  flexShrink: 1,
  marginInlineStart: "auto",
});

/** The close button keeps its target without making the band taller. */
export const close = style({
  display: "inline-flex",
  flexShrink: 0,
  marginBlock: `calc(-1 * ${vars.space["100"]})`,
  marginInlineEnd: `calc(-1 * ${vars.space["100"]})`,
});
