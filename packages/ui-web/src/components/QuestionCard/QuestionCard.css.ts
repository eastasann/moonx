import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

export const root = style({
  borderRadius: vars.radius.card,
  border: `${vars["border-width"].hairline} solid transparent`,
  color: vars.color.text.primary,
  transition: `background-color ${vars.motion.transition.expand}, border-color ${vars.motion.transition.expand}`,
  selectors: {
    '&[data-focused="true"]': {
      background: vars.color.surface.raised,
      borderColor: vars.color.border.strong,
      padding: vars.density.spacious["panel-padding"],
    },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const compact = style({
  display: "grid",
  gridTemplateColumns: "1fr auto",
  columnGap: vars.density.regular.gap,
  rowGap: vars.density.compact.gap,
  alignItems: "baseline",
  width: "100%",
  minHeight: vars.scale.component["target-min"],
  padding: vars.density.regular["cell-padding-y"],
  paddingInline: vars.density.regular["cell-padding-x"],
  border: "none",
  borderRadius: vars.radius.card,
  background: "transparent",
  color: vars.color.text.secondary,
  fontFamily: vars.typography.body.fontFamily,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover, color: vars.color.text.primary },
    "&[data-pressed]": { background: vars.color.surface.hover },
    "&[data-focus-visible]": focusRing,
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const title = style({
  display: "block",
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  lineHeight: vars.typography.label.lineHeight,
  letterSpacing: vars.typography.label.letterSpacing,
  textTransform: "uppercase",
});

export const side = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.density.regular.gap,
});

export const answer = style({
  display: "-webkit-box",
  gridColumn: "1 / -1",
  overflow: "hidden",
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
});

export const answerEmpty = style({ color: vars.color.text.placeholder });

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.density.regular.gap,
});

export const prompt = style({
  margin: 0,
  marginBlockStart: vars.density.regular.gap,
  fontFamily: vars.typography["body-long"].fontFamily,
  fontSize: vars.typography["body-long"].fontSize,
  lineHeight: vars.typography["body-long"].lineHeight,
});

export const body = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.density.spacious["field-gap"],
  marginBlockStart: vars.density.regular["block-gap"],
});
