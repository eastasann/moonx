import { keyframes, style } from "@vanilla-extract/css";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

const slideUp = keyframes({ from: { transform: "translateY(100%)" }, to: { transform: "none" } });
const fadeIn = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

/**
 * `tray` is the bottom sheet narrow screens get; `sheet` is the full-screen sheet narrow screens
 * get for `fullscreen` (design-spec 3.8). The four sizes apply from tablet width up.
 */
export const overlay = recipe({
  base: {
    position: "fixed",
    inset: 0,
    zIndex: vars.layout["z-index"].overlay,
    background: vars.color.surface.scrim,
    display: "flex",
    justifyContent: "center",
    selectors: {
      "&[data-entering]": { animation: `${fadeIn} ${vars.motion.transition.enter}` },
      "&[data-exiting]": { animation: `${fadeIn} ${vars.motion.transition.exit} reverse` },
    },
    "@media": { [reducedMotion]: { animation: "none" } },
  },
  variants: {
    layout: {
      small: { alignItems: "center" },
      medium: { alignItems: "center" },
      large: { alignItems: "center" },
      fullscreen: { alignItems: "stretch", padding: vars.space["600"] },
      tray: { alignItems: "flex-end" },
      sheet: { alignItems: "stretch" },
    },
  },
});

const slideIn = {
  selectors: {
    "&[data-entering]": { animation: `${slideUp} ${vars.motion.transition.enter}` },
    "&[data-exiting]": { animation: `${slideUp} ${vars.motion.transition.exit} reverse` },
  },
  "@media": { [reducedMotion]: { animation: "none" } },
} as const;

export const modal = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    minHeight: 0,
    background: vars.color.surface.overlay,
    color: vars.color.text.primary,
    boxShadow: vars.shadow.overlay,
    outline: "none",
  },
  variants: {
    layout: {
      small: {
        maxWidth: vars.layout["dialog-max-width"].S,
        maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
        borderRadius: vars.radius.card,
      },
      medium: {
        maxWidth: vars.layout["dialog-max-width"].M,
        maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
        borderRadius: vars.radius.card,
      },
      large: {
        maxWidth: vars.layout["dialog-max-width"].L,
        maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
        borderRadius: vars.radius.card,
      },
      fullscreen: { borderRadius: vars.radius.card },
      tray: {
        maxHeight: `calc(100dvh * ${vars.layout["sheet-max-height-ratio"]})`,
        borderStartStartRadius: vars.radius.sheet,
        borderStartEndRadius: vars.radius.sheet,
        paddingBlockEnd: "env(safe-area-inset-bottom)",
      },
      sheet: {
        height: "100%",
        paddingBlockStart: "env(safe-area-inset-top)",
        paddingBlockEnd: "env(safe-area-inset-bottom)",
      },
    },
  },
  compoundVariants: (["tray", "sheet"] as const).map((layout) => ({
    variants: { layout },
    style: slideIn,
  })),
});

export type DialogLayout = NonNullable<RecipeVariants<typeof modal>>["layout"];

export const dialog = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minHeight: 0,
  outline: "none",
  fontFamily: vars.typography.body.fontFamily,
});

export const header = style({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: vars.space["200"],
  paddingInline: vars.space["300"],
  paddingBlockStart: vars.space["300"],
});

export const title = style({
  margin: 0,
  fontFamily: vars.typography["heading-3"].fontFamily,
  fontSize: vars.typography["heading-3"].fontSize,
  fontWeight: vars.typography["heading-3"].fontWeight,
  letterSpacing: vars.typography["heading-3"].letterSpacing,
  lineHeight: vars.typography["heading-3"].lineHeight,
});

export const body = style({
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  padding: vars.space["300"],
  fontSize: vars.typography.body.fontSize,
  lineHeight: vars.typography.body.lineHeight,
});

export const footer = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "flex-end",
  gap: vars.space["200"],
  paddingInline: vars.space["300"],
  paddingBlockEnd: vars.space["300"],
});

export const closeButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
  padding: vars.scale.component["action-button"]["padding-icon-only"].M,
  border: "none",
  borderRadius: vars.radius.control,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.surface.sunken },
    "&[data-focus-visible]": focusRing,
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const closeIcon = style({
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
  strokeWidth: vars.icon["stroke-width"],
});
