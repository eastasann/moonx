import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, hoverTransition } from "../styles/helpers";

const sizes = ["S", "M", "L", "XL"] as const;

/** One track; the chosen segment takes the ink fill (06 color.control.primary). */
export const control = recipe({
  base: {
    display: "inline-flex",
    // Its own width even where a column would stretch it; isJustified fills the line.
    width: "fit-content",
    maxWidth: "100%",
    padding: vars.space["25"],
    gap: vars.space["25"],
    background: vars.color.surface.sunken,
    border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.control,
  },
  variants: {
    isJustified: {
      true: { display: "flex", width: "100%" },
      false: {},
    },
  },
  defaultVariants: { isJustified: false },
});

export const item = recipe({
  base: {
    ...hoverTransition,
    flex: "1 1 0",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: vars.space["100"],
    margin: 0,
    border: "none",
    borderRadius: `calc(${vars.radius.control} - ${vars.space["25"]})`,
    background: "transparent",
    color: vars.color.text.primary,
    fontFamily: vars.typography.button.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.button.lineHeight,
    whiteSpace: "nowrap",
    cursor: "pointer",
    outline: "none",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-selected]": {
        background: vars.color.control.primary,
        color: vars.color.control.onPrimary,
      },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    // The track's padding and border sit around the segment, so the segment is smaller
    // than the control height by both; the minimum target still applies to it.
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: atLeastTarget(
            `calc(${vars.scale.component.actionButton.height[size]} - 2 * (${vars.space["25"]} + ${vars.borderWidth.strong}))`,
          ),
          paddingInline: vars.scale.component.actionButton.paddingX[size],
          fontSize: vars.scale.component.button.fontSize[size],
        },
      ]),
    ) as Record<
      (typeof sizes)[number],
      { minHeight: string; paddingInline: string; fontSize: string }
    >,
  },
  defaultVariants: { size: "M" },
});
