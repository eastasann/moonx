import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

export const disclosure = style({
  borderBlockEnd: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  color: vars.color.text.primary,
  fontFamily: vars.typography.body.fontFamily,
});

export const heading = style({ margin: 0 });

export const trigger = style({
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
  width: "100%",
  minHeight: vars.scale.component.field.height.L,
  paddingBlock: vars.space["100"],
  paddingInline: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  textAlign: "start",
  cursor: "pointer",
  fontFamily: vars.typography.label.fontFamily,
  fontSize: vars.typography.label.fontSize,
  fontWeight: vars.typography.label.fontWeight,
  letterSpacing: vars.typography.label.letterSpacing,
  lineHeight: vars.typography.label.lineHeight,
  selectors: {
    "&[data-hovered]": { color: vars.color.text.secondary },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
});

export const chevron = style({
  flexShrink: 0,
  width: vars.scale.component.icon.size.S,
  height: vars.scale.component.icon.size.S,
  strokeWidth: vars.icon["stroke-width"],
  transition: `transform ${vars.motion.transition.expand}`,
  selectors: {
    [`${disclosure}[data-expanded] &`]: { transform: "rotate(90deg)" },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const panel = style({
  overflow: "hidden",
  height: "var(--disclosure-panel-height)",
  transition: `height ${vars.motion.transition.expand}`,
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const panelContent = style({
  paddingBlockEnd: vars.space["200"],
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
});

export const accordion = style({
  borderBlockStart: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
});
