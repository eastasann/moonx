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
      // Its text names it, so its frame is the light one (06 border.default).
      secondary: {
        background: vars.color.control.secondary,
        borderColor: vars.color.border.default,
        color: vars.color.control.onSecondary,
        fontWeight: vars.typography.label.fontWeight,
        selectors: {
          // The frame darkens, not the fill (moon-base.css .btn:hover).
          "&[data-hovered]": { borderColor: vars.color.border.strong },
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
    // Supporting actions (moon-base.css .btn.quiet).
    isQuiet: {
      true: {
        background: "transparent",
        borderColor: "transparent",
        fontWeight: vars.typography.label.fontWeight,
        selectors: {
          // No frame on hover either: secondary's darker frame is for its framed look.
          "&[data-hovered]": {
            background: vars.color.surface.hover,
            borderColor: "transparent",
          },
          "&[data-pressed]": {
            background: vars.color.control.secondaryPressed,
          },
        },
      },
      false: {},
    },
    // In a phone's bottom bar, the main buttons share its width (4.5 Button).
    fills: {
      true: { flex: "1 1 0" },
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
          borderRadius: vars.scale.component.button.radius[size],
        },
      ]),
    ) as Record<
      (typeof sizes)[number],
      {
        minHeight: string;
        minWidth: string;
        paddingInline: string;
        fontSize: string;
        borderRadius: string;
      }
    >,
  },
  compoundVariants: [
    ...sizes.map((size) => ({
      variants: { isQuiet: true, size },
      style: {
        paddingInline: vars.scale.component.button.paddingXQuiet[size],
      },
    })),
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
  defaultVariants: {
    variant: "primary",
    isQuiet: false,
    fills: false,
    size: "M",
  },
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
