import { breakpoints, vars } from "@moonx/ui-tokens";

// Style fragments the components' *.css.ts files share. Plain values and functions live
// here rather than in a .css.ts file, which may only export what vanilla-extract can
// serialise.

/** `prefers-reduced-motion`: movement stops, colour and opacity fade (06 motion.reduced). */
export const reducedMotion = "(prefers-reduced-motion: reduce)";

/** Tablet and wider (`semantic.breakpoint.tablet`). */
export const tabletUp = `screen and (min-width: ${breakpoints.tablet}px)`;

/** Desktop (`semantic.breakpoint.desktop`). */
export const desktopUp = `screen and (min-width: ${breakpoints.desktop}px)`;

/** Narrower than `semantic.breakpoint.tablet`: overlays open as trays (ADR-025). */
export const narrowQuery = `not all and (min-width: ${breakpoints.tablet}px)`;

/** The focus indicator (Spectrum's focus-indicator), drawn outside the element. */
export const focusRing = {
  outline: `${vars.borderWidth.focusRing} solid ${vars.color.border.focus}`,
  outlineOffset: vars.borderWidth.focusOffset,
} as const;

/**
 * A size grown to the minimum target of the scale: 24px with a mouse, 44px on touch
 * (design-spec 4.3・4.5). Sizes already larger stay as they are.
 */
export const atLeastTarget = (size: string) =>
  `max(${size}, ${vars.scale.component.targetMin})`;

export type TypographyName = keyof typeof vars.typography;

/** The five properties of a `semantic.typography` style. */
export const typography = (name: TypographyName) => {
  const style = vars.typography[name];
  return {
    fontFamily: style.fontFamily,
    fontSize: style.fontSize,
    fontWeight: style.fontWeight,
    letterSpacing: style.letterSpacing,
    lineHeight: style.lineHeight,
  };
};

/** A colour transition on hover and press; reduced motion keeps it as a short fade. */
export const hoverTransition = {
  transitionProperty: "background-color, border-color, color, box-shadow",
  transitionDuration: vars.motion.transition.hover.duration,
  transitionTimingFunction: vars.motion.transition.hover.timingFunction,
  "@media": {
    [reducedMotion]: { transitionDuration: vars.motion.reduced.fade },
  },
} as const;
