import { statusVariants, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/**
 * The alert's fill in its status colour (06 color.*.bg) with ink text and no edge
 * (s19-decision.html .alert); only the icon takes the status colour (06 *.fg), which keeps
 * 4.5:1 on the fill.
 */
export const alert = styleVariants(
  Object.fromEntries(statusVariants.map((v) => [v, v])) as Record<
    (typeof statusVariants)[number],
    (typeof statusVariants)[number]
  >,
  (variant) => ({
    display: "flex",
    alignItems: "flex-start",
    gap: vars.scale.component.inlineAlert.gap,
    paddingBlock: vars.scale.component.inlineAlert.paddingY,
    paddingInline: vars.scale.component.inlineAlert.paddingX,
    background: vars.color[variant].bg,
    borderRadius: vars.radius.callout,
    color: vars.color.text.primary,
  }),
);

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

export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  flex: "1 1 auto",
  minWidth: 0,
  ...typography("callout"),
});

export const heading = style({
  ...typography("callout"),
  fontWeight: vars.typography.heading4.fontWeight,
  margin: 0,
});

/** The close button keeps its target without making the band taller. */
export const close = style({
  flexShrink: 0,
  marginBlock: `calc(-1 * ${vars.space["100"]})`,
  marginInlineEnd: `calc(-1 * ${vars.space["100"]})`,
});
