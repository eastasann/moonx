import { keyframes, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { breakpoints, vars } from "../../theme";

const rise = keyframes({
  from: { opacity: 0, transform: "translateY(100%)" },
  to: { opacity: 1, transform: "none" },
});

const narrow = `(max-width: ${breakpoints.tablet - 1}px)`;

/** Bottom center; on narrow screens it sits above the tab bar. */
export const region = style({
  position: "fixed",
  insetInline: 0,
  bottom: `calc(${vars.space["400"]} + env(safe-area-inset-bottom))`,
  zIndex: vars.layout["z-index"].toast,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.space["100"],
  paddingInline: vars.layout["page-gutter-mobile"],
  pointerEvents: "none",
  outline: "none",
  "@media": {
    [narrow]: {
      bottom: `calc(${vars.layout["tab-bar-height"]} + ${vars.space["200"]} + env(safe-area-inset-bottom))`,
    },
  },
});

export const toast = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["200"],
    boxSizing: "border-box",
    width: "100%",
    maxWidth: vars.layout["dialog-max-width"].L,
    minHeight: vars.scale.component.toast["min-height"],
    paddingBlock: vars.space["100"],
    paddingInline: vars.space["200"],
    borderRadius: vars.radius.card,
    boxShadow: vars.shadow.overlay,
    pointerEvents: "auto",
    outline: "none",
    fontFamily: vars.typography["body-sm"].fontFamily,
    fontSize: vars.typography["body-sm"].fontSize,
    lineHeight: vars.typography["body-sm"].lineHeight,
    animation: `${rise} ${vars.motion.transition.enter}`,
    selectors: { "&[data-focus-visible]": focusRing },
    "@media": { [reducedMotion]: { animation: "none" } },
  },
  variants: {
    variant: {
      informative: {
        background: vars.color.informative.strong,
        color: vars.color.informative["on-strong"],
      },
      positive: {
        background: vars.color.positive.strong,
        color: vars.color.positive["on-strong"],
      },
      negative: {
        background: vars.color.negative.strong,
        color: vars.color.negative["on-strong"],
      },
      neutral: {
        background: vars.color.neutral.strong,
        color: vars.color.neutral["on-strong"],
      },
    },
  },
  defaultVariants: { variant: "neutral" },
});

export const icon = style({
  flexShrink: 0,
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
  strokeWidth: vars.icon["stroke-width"],
});

export const content = style({
  flex: 1,
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

export const title = style({
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  letterSpacing: vars.typography.label.letterSpacing,
  lineHeight: vars.typography.label.lineHeight,
});

export const close = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
  padding: 0,
  border: "none",
  borderRadius: vars.radius.control,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  selectors: {
    "&[data-hovered]": { boxShadow: `inset 0 0 0 ${vars["border-width"].hairline} currentColor` },
    "&[data-pressed]": {
      boxShadow: `inset 0 0 0 ${vars["border-width"]["focus-ring"]} currentColor`,
    },
    "&[data-focus-visible]": {
      outline: `${vars["border-width"]["focus-ring"]} solid currentColor`,
    },
  },
});
