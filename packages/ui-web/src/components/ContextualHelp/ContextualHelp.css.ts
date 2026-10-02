import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

export const trigger = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: vars.scale.component["target-min"],
  minHeight: vars.scale.component["target-min"],
  padding: 0,
  border: "none",
  borderRadius: vars.radius.pill,
  background: "transparent",
  color: vars.color.text.secondary,
  cursor: "pointer",
  transition: `color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { color: vars.color.text.primary },
    "&[data-pressed]": { color: vars.color.text.primary },
    "&[data-focus-visible]": focusRing,
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const icon = style({
  width: vars.scale.component.icon.size.M,
  height: vars.scale.component.icon.size.M,
  strokeWidth: vars.icon["stroke-width"],
});

export const title = style({
  margin: 0,
  marginBlockEnd: vars.space["100"],
  fontFamily: vars.typography["heading-4"].fontFamily,
  fontSize: vars.typography["heading-4"].fontSize,
  fontWeight: vars.typography["heading-4"].fontWeight,
  letterSpacing: vars.typography["heading-4"].letterSpacing,
  lineHeight: vars.typography["heading-4"].lineHeight,
});

export const content = style({
  maxWidth: vars.layout["dialog-max-width"].S,
  padding: vars.space["300"],
  outline: "none",
  fontFamily: vars.typography["body-sm"].fontFamily,
  fontSize: vars.typography["body-sm"].fontSize,
  lineHeight: vars.typography["body-sm"].lineHeight,
});
