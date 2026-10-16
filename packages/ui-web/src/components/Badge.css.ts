import { sizes, vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/**
 * A label in a frame without colour (design-spec 4.4・4.5): Undecided has a dashed frame,
 * an unread count the ink fill, Overdue amber text in the same frame. Not interactive, so
 * it does not grow to the minimum target.
 */
export const badge = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    maxWidth: "100%",
    borderWidth: vars.borderWidth.strong,
    borderStyle: "solid",
    borderRadius: vars.radius.chip,
    fontFamily: vars.typography.labelSm.fontFamily,
    fontWeight: vars.typography.labelSm.fontWeight,
    letterSpacing: vars.typography.labelSm.letterSpacing,
    lineHeight: vars.typography.labelSm.lineHeight,
    verticalAlign: "middle",
  },
  variants: {
    variant: {
      neutral: { color: vars.color.text.primary },
      notice: { color: vars.color.notice.fg },
    },
    fillStyle: {
      outline: {
        background: "transparent",
        borderColor: vars.color.border.strong,
      },
      dashed: {
        background: "transparent",
        borderColor: vars.color.border.strong,
        borderStyle: "dashed",
      },
      bold: {
        background: vars.color.control.primary,
        borderColor: vars.color.control.primary,
        color: vars.color.control.onPrimary,
        borderRadius: vars.radius.pill,
        fontVariantNumeric: "tabular-nums",
      },
    },
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: vars.scale.component.badge.height[size],
          minWidth: vars.scale.component.badge.height[size],
          paddingInline: vars.scale.component.badge.paddingX[size],
          fontSize: vars.scale.component.badge.fontSize[size],
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
  defaultVariants: { variant: "neutral", fillStyle: "outline", size: "S" },
});

/**
 * The text ends in an ellipsis when the badge is squeezed: an inline-flex box cannot
 * clip its own text, so a block inside it does.
 */
export const label = style({
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});
