import { sizes, vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";

/**
 * A label in a light frame without colour (design-spec 4.4・4.5, docs/mockups .tag):
 * Undecided has a dashed frame and secondary text, an unread count is a small ink tag,
 * Overdue is amber monospaced text without a frame. Not interactive, so it does not grow
 * to the minimum target.
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
      notice: {
        color: vars.color.notice.fg,
        fontFamily: vars.font.family.mono,
        fontVariantNumeric: "tabular-nums",
      },
    },
    fillStyle: {
      // Its text names it, so its frame is the light one (06 border.default).
      outline: {
        background: "transparent",
        borderColor: vars.color.border.default,
      },
      dashed: {
        background: "transparent",
        borderColor: vars.color.border.default,
        borderStyle: "dashed",
        color: vars.color.text.secondary,
      },
      // The unread count laid over an icon: one size whatever the badge's (06 badge.count).
      bold: {
        background: vars.color.control.primary,
        borderWidth: 0,
        borderRadius: vars.scale.component.badge.count.radius,
        color: vars.color.control.onPrimary,
        fontFamily: vars.font.family.mono,
        lineHeight: vars.scale.component.badge.count.height,
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
  compoundVariants: [
    // Overdue is the text alone: no frame, so no sides either.
    {
      variants: { variant: "notice" },
      style: {
        borderColor: "transparent",
        borderWidth: 0,
        minWidth: 0,
        paddingInline: 0,
      },
    },
    ...sizes.map((size) => ({
      variants: { fillStyle: "bold" as const, size },
      style: {
        minHeight: vars.scale.component.badge.count.height,
        minWidth: vars.scale.component.badge.count.height,
        paddingInline: vars.scale.component.badge.count.paddingX,
        fontSize: vars.scale.component.badge.count.fontSize,
      },
    })),
  ],
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
