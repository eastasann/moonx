import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, hoverTransition } from "../styles/helpers";

const sizes = ["S", "M", "L", "XL"] as const;

export const button = recipe({
  base: {
    ...hoverTransition,
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["100"],
    margin: 0,
    border: `${vars.borderWidth.strong} solid transparent`,
    borderRadius: vars.radius.control,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.button.fontWeight,
    letterSpacing: vars.typography.button.letterSpacing,
    lineHeight: vars.typography.button.lineHeight,
    textAlign: "center",
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: "none",
    userSelect: "none",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-pending]": { cursor: "progress" },
      "&[data-disabled]": {
        background: vars.color.control.disabled,
        borderColor: "transparent",
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    variant: {
      // The one main action of a screen: the ink fill (design-spec 4.5).
      primary: {
        background: vars.color.control.primary,
        color: vars.color.control.onPrimary,
        selectors: {
          "&[data-hovered]": { background: vars.color.control.primaryHover },
          "&[data-pressed]": { background: vars.color.control.primaryPressed },
        },
      },
      secondary: {
        background: vars.color.control.secondary,
        borderColor: vars.color.border.strong,
        color: vars.color.control.onSecondary,
        selectors: {
          "&[data-hovered]": { background: vars.color.control.secondaryHover },
          "&[data-pressed]": {
            background: vars.color.control.secondaryPressed,
          },
        },
      },
      // Only to confirm a deletion (design-spec 4.5).
      negative: {
        background: vars.color.negative.strong,
        color: vars.color.negative.onStrong,
        selectors: {
          "&[data-hovered]": { background: vars.color.negative.strongHover },
          "&[data-pressed]": { background: vars.color.negative.strongPressed },
        },
      },
    },
    // Supporting actions: no fill, no border.
    isQuiet: {
      true: {
        background: "transparent",
        borderColor: "transparent",
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
          "&[data-pressed]": {
            background: vars.color.control.secondaryPressed,
          },
        },
      },
      false: {},
    },
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: atLeastTarget(vars.scale.component.button.height[size]),
          minWidth: vars.scale.component.targetMin,
          paddingInline: vars.scale.component.button.paddingX[size],
          fontSize: vars.scale.component.button.fontSize[size],
        },
      ]),
    ) as Record<
      (typeof sizes)[number],
      {
        minHeight: string;
        minWidth: string;
        paddingInline: string;
        fontSize: string;
      }
    >,
  },
  compoundVariants: [
    {
      variants: { variant: "primary", isQuiet: true },
      style: { color: vars.color.text.primary },
    },
    {
      variants: { variant: "secondary", isQuiet: true },
      style: { color: vars.color.text.primary },
    },
    {
      variants: { variant: "negative", isQuiet: true },
      style: { color: vars.color.negative.fg },
    },
  ],
  defaultVariants: { variant: "primary", isQuiet: false, size: "M" },
});

/**
 * While pending the label keeps its room under the circle. It is made transparent, not
 * hidden, so it still names the button for screen readers.
 */
export const label = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["100"],
  selectors: { "[data-pending] > &": { opacity: 0 } },
});

export const pending = style({
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
});

export const group = recipe({
  base: {
    display: "flex",
    flexWrap: "wrap",
    gap: vars.space["200"],
    minWidth: 0,
  },
  variants: {
    align: {
      start: { justifyContent: "flex-start" },
      center: { justifyContent: "center" },
      end: { justifyContent: "flex-end" },
    },
    orientation: {
      horizontal: {},
      vertical: { flexDirection: "column", alignItems: "stretch" },
    },
  },
  defaultVariants: { align: "start", orientation: "horizontal" },
});
