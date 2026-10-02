import { style } from "@vanilla-extract/css";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { targetMin } from "../_internal/target";

export const card = style({
  position: "relative",
  display: "block",
  minWidth: 0,
  minHeight: targetMin,
  padding: vars.space["300"],
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  border: `${vars["border-width"].hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.card,
  boxShadow: vars.shadow.raised,
  textDecoration: "none",
  outline: "none",
  transition: `background-color ${vars.motion.transition.hover}`,
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-selected]": {
      background: vars.color.surface.selected,
      borderColor: vars.color.control["track-fill"],
    },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    "&[data-href], &[data-pressed]": { cursor: "pointer" },
  },
  "@media": { [reducedMotion]: { transition: "none" } },
});

export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
});

export const checkbox = style({
  position: "absolute",
  insetBlockStart: vars.space["200"],
  insetInlineEnd: vars.space["200"],
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: vars.scale.component.checkbox["control-size"].M,
  height: vars.scale.component.checkbox["control-size"].M,
  background: vars.color.surface.raised,
  color: vars.color.control["on-primary"],
  border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
  selectors: {
    "&[data-selected]": {
      background: vars.color.control.primary,
      borderColor: vars.color.control.primary,
    },
    "&[data-focus-visible]": focusRing,
  },
});

export const check = style({
  width: "100%",
  height: "100%",
  strokeWidth: vars.icon["stroke-width"],
});
