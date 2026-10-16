import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, typography } from "../styles/helpers";

const sizes = ["S", "M", "L", "XL"] as const;

export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  minWidth: 0,
});

export const list = style({
  display: "flex",
  flexWrap: "wrap",
  gap: vars.space["100"],
  outline: "none",
  selectors: {
    "&[data-empty]": {
      ...typography("caption"),
      color: vars.color.text.secondary,
    },
  },
});

/** A tag: a chip with a hairline border (06 radius.chip), its remove button inside. */
export const tag = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["50"],
    maxWidth: "100%",
    paddingInlineStart: vars.space["200"],
    paddingInlineEnd: vars.space["50"],
    border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.chip,
    background: vars.color.surface.raised,
    color: vars.color.text.primary,
    ...typography("labelSm"),
    cursor: "default",
    outline: "none",
    selectors: {
      "&[data-focus-visible]": focusRing,
      // Without a remove button the tag keeps even padding.
      "&:not(:has([slot='remove']))": {
        paddingInlineEnd: vars.space["200"],
      },
    },
  },
  variants: {
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: atLeastTarget(
            vars.scale.component.actionButton.height[size],
          ),
        },
      ]),
    ) as Record<(typeof sizes)[number], { minHeight: string }>,
  },
  defaultVariants: { size: "M" },
});

export const tagLabel = style({
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

export const remove = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  minWidth: vars.scale.component.targetMin,
  minHeight: vars.scale.component.targetMin,
  padding: 0,
  border: "none",
  borderRadius: vars.radius.chip,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-hovered]": {
      background: vars.color.surface.hover,
      color: vars.color.text.primary,
    },
    "&[data-focus-visible]": focusRing,
  },
});
