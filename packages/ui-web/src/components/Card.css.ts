import { type CardSize, cardSizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, hoverTransition, narrowQuery } from "../styles/helpers";

const sized = Object.fromEntries(
  cardSizes.map((size) => [size, size]),
) as Record<CardSize, CardSize>;

/**
 * A card: framed and raised, as 4.4 keeps cards for things compared side by side.
 * Spacing and type follow the size (06 component.card).
 */
export const card = recipe({
  base: {
    ...hoverTransition,
    display: "flex",
    flexDirection: "column",
    boxSizing: "border-box",
    minWidth: 0,
    overflow: "hidden",
    border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    borderRadius: vars.radius.card,
    background: vars.color.surface.raised,
    boxShadow: vars.shadow.raised,
    color: vars.color.text.primary,
    fontFamily: vars.font.family.body,
    outline: "none",
    selectors: {
      "&[data-selected]": {
        borderColor: vars.color.control.primary,
        boxShadow: `inset 0 0 0 ${vars.borderWidth.selectedIndicator} ${vars.color.control.primary}`,
      },
      "&[data-focus-visible]": focusRing,
    },
  },
  variants: {
    size: Object.fromEntries(
      cardSizes.map((size) => [
        size,
        {
          gap: vars.scale.component.card.gap[size],
          padding: vars.scale.component.card.padding[size],
        },
      ]),
    ) as Record<CardSize, { gap: string; padding: string }>,
    isActionable: {
      true: {
        cursor: "pointer",
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
          "&[data-pressed]": { background: vars.color.surface.hover },
        },
      },
      false: {},
    },
  },
});

/** The preview runs to the card's edges, above its text. */
export const preview = styleVariants(sized, (size) => ({
  marginInline: `calc(-1 * ${vars.scale.component.card.padding[size]})`,
  marginBlockStart: `calc(-1 * ${vars.scale.component.card.padding[size]})`,
  borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
}));

export const title = styleVariants(sized, (size) => ({
  fontWeight: vars.typography.heading4.fontWeight,
  letterSpacing: vars.typography.heading4.letterSpacing,
  lineHeight: vars.typography.heading4.lineHeight,
  fontSize: vars.scale.component.card.titleFontSize[size],
  overflowWrap: "break-word",
}));

export const description = styleVariants(sized, (size) => ({
  lineHeight: vars.typography.bodyLong.lineHeight,
  fontSize: vars.scale.component.card.descriptionFontSize[size],
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
}));

export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
});

/**
 * As many columns as fit cards of the size's minimum width (06 component.card-view), and
 * three at most (4.1 E: 2〜3 on a desktop); one column on a phone (design-spec 4.5). A
 * card is never narrower than a third of the view, which caps the columns at three.
 */
export const view = styleVariants(sized, (size) => ({
  display: "grid",
  gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${vars.scale.component.cardView.minWidth[size]}, (100% - 2 * ${vars.scale.component.cardView.gap[size]}) / 3)), 1fr))`,
  gap: vars.scale.component.cardView.gap[size],
  outline: "none",
  "@media": { [narrowQuery]: { gridTemplateColumns: "minmax(0, 1fr)" } },
}));
