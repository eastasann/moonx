import {
  type IllustratedMessageSize,
  illustratedMessageSizes,
  vars,
} from "@moonx/ui-tokens";
import { globalStyle, style, styleVariants } from "@vanilla-extract/css";

const sized = Object.fromEntries(
  illustratedMessageSizes.map((size) => [size, size]),
) as Record<IllustratedMessageSize, IllustratedMessageSize>;

/** Centred in a column, like Spectrum's vertical IllustratedMessage. */
export const root = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: vars.space["200"],
  maxWidth: vars.layout.readingColumnMax,
  marginInline: "auto",
  paddingBlock: vars.space["500"],
  textAlign: "center",
  color: vars.color.text.primary,
});

/**
 * The Lucide icon in place of an illustration (design-spec 4.5), drawn in the secondary
 * ink with a line as thin as the icons' at any size.
 */
export const icon = styleVariants(sized, () => ({
  display: "inline-flex",
  color: vars.color.text.secondary,
}));

for (const size of illustratedMessageSizes) {
  globalStyle(`${icon[size]} svg`, {
    width: vars.scale.component.illustratedMessage.iconSize[size],
    height: vars.scale.component.illustratedMessage.iconSize[size],
    strokeWidth: vars.icon.strokeWidth,
  });
  globalStyle(`${icon[size]} svg *`, { vectorEffect: "non-scaling-stroke" });
}

export const heading = styleVariants(sized, (size) => ({
  margin: 0,
  fontFamily: vars.typography.heading3.fontFamily,
  fontWeight: vars.typography.heading3.fontWeight,
  letterSpacing: vars.typography.heading3.letterSpacing,
  lineHeight: vars.typography.heading3.lineHeight,
  fontSize: vars.scale.component.illustratedMessage.titleFontSize[size],
}));

export const description = styleVariants(sized, (size) => ({
  margin: 0,
  fontFamily: vars.typography.body.fontFamily,
  lineHeight: vars.typography.body.lineHeight,
  fontSize: vars.scale.component.illustratedMessage.bodyFontSize[size],
  color: vars.color.text.secondary,
}));

export const actions = style({
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: vars.space["200"],
  marginBlockStart: vars.space["200"],
});
