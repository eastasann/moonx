import { type CardSize, cardSizes, vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  focusRing,
  hoverTransition,
  narrowQuery,
  typography,
} from "../styles/helpers";

const measures = vars.scale.component.card;

const sized = Object.fromEntries(
  cardSizes.map((size) => [size, size]),
) as Record<CardSize, CardSize>;

/**
 * A card: framed, without a shadow (s15-competitors.html .card), as 4.4 keeps cards for
 * things compared side by side. Spacing and type follow the size (06 component.card).
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
          gap: measures.gap[size],
          paddingInline: measures.paddingX[size],
          paddingBlockStart: measures.paddingTop[size],
          paddingBlockEnd: measures.paddingBottom[size],
        },
      ]),
    ) as Record<
      CardSize,
      {
        gap: string;
        paddingInline: string;
        paddingBlockStart: string;
        paddingBlockEnd: string;
      }
    >,
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
  marginInline: `calc(-1 * ${measures.paddingX[size]})`,
  marginBlockStart: `calc(-1 * ${measures.paddingTop[size]})`,
  borderBottom: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
}));

/** The eyebrow and the title on the left, the figure on the right (s15-competitors.html). */
export const head = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["100"],
});

export const headText = style({
  display: "flex",
  flexDirection: "column",
  flex: 1,
  minWidth: 0,
});

export const eyebrow = style({
  ...typography("eyebrow"),
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
});

export const title = styleVariants(sized, (size) => ({
  fontWeight: vars.typography.heading4.fontWeight,
  letterSpacing: vars.typography.heading4.letterSpacing,
  lineHeight: vars.typography.heading4.lineHeight,
  fontSize: measures.titleFontSize[size],
  overflowWrap: "break-word",
}));

/** A price on one line in the monospaced face; its note in the body face. */
export const figure = recipe({
  base: {
    ...typography("cardValue"),
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    flexShrink: 0,
    marginInlineStart: "auto",
    textAlign: "end",
    whiteSpace: "nowrap",
  },
  variants: {
    // "No price" in the figure's face, smaller (s15-competitors.html .price.none).
    isPlaceholder: {
      true: {
        fontSize: vars.typography.callout.fontSize,
        color: vars.color.text.tertiary,
      },
      false: {},
    },
  },
});

export const figureDescription = style({
  ...typography("captionXs"),
  color: vars.color.text.secondary,
  whiteSpace: "normal",
});

/** Label and value lines, a hairline above each; a phone puts the label above (s15). */
export const details = style({
  display: "grid",
  gridTemplateColumns: `${measures.detailsLabelWidth} minmax(0, 1fr)`,
  margin: 0,
  "@media": { [narrowQuery]: { gridTemplateColumns: "minmax(0, 1fr)" } },
});

export const detail = style({ display: "contents" });

const detailCell = {
  margin: 0,
  paddingBlock: measures.detailsPaddingY,
  borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  overflowWrap: "break-word",
} as const;

export const detailLabel = style({
  ...detailCell,
  ...typography("captionSm"),
  paddingBlockStart: measures.detailsLabelPaddingTop,
  color: vars.color.text.secondary,
});

export const detailValue = style({
  ...detailCell,
  ...typography("callout"),
  "@media": {
    [narrowQuery]: { borderTop: "none", paddingBlockStart: 0 },
  },
});

/** The last line: the card's notes, then its ⋯ at the end. */
export const footer = style({
  ...typography("caption"),
  display: "flex",
  alignItems: "center",
  gap: measures.footerGap,
  color: vars.color.text.secondary,
});

export const footerText = style({
  display: "inline-flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: measures.footerGap,
  minWidth: 0,
});

/** The comments' mark and count after the footer's text (s15-competitors.html .cmt). */
export const comments = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["50"],
  fontVariantNumeric: "tabular-nums",
});

export const actions = style({
  display: "inline-flex",
  marginInlineStart: "auto",
});

export const description = styleVariants(sized, (size) => ({
  lineHeight: vars.typography.bodyLong.lineHeight,
  fontSize: measures.descriptionFontSize[size],
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

/**
 * CardView's last tile (s15-competitors.html .addcard): a dashed light frame, the label in
 * the middle, at least `layout.compare.add-tile-min-height` tall.
 */
export const addTile = style({
  ...hoverTransition,
  ...typography("label"),
  display: "grid",
  placeItems: "center",
  minHeight: vars.layout.compare.addTileMinHeight,
  border: `${vars.layout.compare.addTileBorder} dashed ${vars.color.border.default}`,
  borderRadius: vars.radius.card,
  color: vars.color.text.secondary,
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": {
      background: vars.color.surface.hover,
      color: vars.color.text.primary,
    },
    "&[data-focus-visible]": focusRing,
  },
});

export const addTileLabel = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["75"],
});
