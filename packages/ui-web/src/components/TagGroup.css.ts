import { type TagSize, tagSizes, vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, typography } from "../styles/helpers";

const sized = <T>(make: (size: TagSize) => T) =>
  Object.fromEntries(tagSizes.map((size) => [size, make(size)])) as Record<
    TagSize,
    T
  >;

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

/**
 * A tag: a chip with a hairline border (06 radius.chip), its remove button inside. Its
 * height, padding and text follow the size (06 component.tag, as Spectrum 2's Tag).
 */
export const tag = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["50"],
    maxWidth: "100%",
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
    },
  },
  variants: {
    size: sized((size) => ({
      minHeight: atLeastTarget(vars.scale.component.tag.height[size]),
      paddingInlineStart: vars.scale.component.tag.paddingX[size],
      fontSize: vars.scale.component.tag.fontSize[size],
      selectors: {
        // Without a remove button the tag keeps even padding.
        "&:not(:has([slot='remove']))": {
          paddingInlineEnd: vars.scale.component.tag.paddingX[size],
        },
      },
    })),
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
  // The target keeps target-min while laid out over the tag's border, so a tag whose
  // height is target-min (S) does not grow by the border.
  marginBlock: `calc(-1 * ${vars.borderWidth.strong})`,
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
