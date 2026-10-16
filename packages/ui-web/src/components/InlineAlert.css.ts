import { statusVariants, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/**
 * The alert's fill and text in its status colours (06 color.*.bg / fg); the edge and the
 * icon in the stronger one, which keeps 3:1 on the fill.
 */
export const alert = styleVariants(
  Object.fromEntries(statusVariants.map((v) => [v, v])) as Record<
    (typeof statusVariants)[number],
    (typeof statusVariants)[number]
  >,
  (variant) => ({
    display: "flex",
    alignItems: "flex-start",
    gap: vars.space["200"],
    padding: vars.density.regular.panelPadding,
    background: vars.color[variant].bg,
    borderInlineStart: `${vars.borderWidth.selectedIndicator} solid ${vars.color[variant].strong}`,
    borderRadius: vars.radius.control,
    color: vars.color[variant].fg,
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
    color: vars.color[variant].strong,
  }),
);

export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  flex: "1 1 auto",
  minWidth: 0,
  ...typography("bodySm"),
});

export const heading = style({
  ...typography("label"),
  margin: 0,
});

/** The close button keeps its target without making the band taller. */
export const close = style({
  flexShrink: 0,
  marginBlock: `calc(-1 * ${vars.space["100"]})`,
  marginInlineEnd: `calc(-1 * ${vars.space["100"]})`,
});
