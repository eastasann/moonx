import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

export const dateInput = style({
  display: "flex",
  flex: 1,
  minWidth: 0,
  alignItems: "center",
  fontFamily: vars.font.family.mono,
  fontVariantNumeric: "tabular-nums",
  lineHeight: vars.typography.body.lineHeight,
  whiteSpace: "nowrap",
  overflow: "hidden",
});

// Each segment is a target of its own: at least target-min both ways (design-spec 4.3).
export const segment = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: vars.scale.component.targetMin,
  minHeight: vars.scale.component.targetMin,
  paddingInline: vars.space["25"],
  borderRadius: vars.radius.chip,
  outline: "none",
  caretColor: "transparent",
  selectors: {
    "&[data-type='literal']": { color: vars.color.text.secondary },
    "&[data-placeholder]": { color: vars.color.text.placeholder },
    "&[data-focused]": {
      background: vars.color.control.primary,
      color: vars.color.control.onPrimary,
    },
    "&[data-disabled]": { color: vars.color.text.disabled },
  },
});

export const dialog = style({ outline: "none" });

export const calendar = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  padding: vars.space["300"],
  width: "fit-content",
  marginInline: "auto",
});

export const header = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: vars.space["100"],
});

export const heading = style({
  ...typography("heading4"),
  margin: 0,
  flex: 1,
  textAlign: "center",
});

const cellSize = atLeastTarget(vars.scale.component.actionButton.height.M);

export const navButton = style({
  ...hoverTransition,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: cellSize,
  height: cellSize,
  padding: 0,
  border: "none",
  borderRadius: vars.radius.control,
  background: "transparent",
  color: vars.color.text.primary,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.control.secondaryPressed },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "default" },
  },
});

export const grid = style({ borderCollapse: "collapse" });

export const weekday = style({
  ...typography("caption"),
  height: cellSize,
  color: vars.color.text.secondary,
  fontWeight: vars.typography.label.fontWeight,
});

export const cell = style({
  ...hoverTransition,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: cellSize,
  height: cellSize,
  borderRadius: vars.radius.control,
  fontFamily: vars.font.family.mono,
  fontSize: vars.scale.component.field.fontSize.M,
  fontVariantNumeric: "tabular-nums",
  color: vars.color.text.primary,
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-outside-month]": { display: "none" },
    "&[data-hovered]": { background: vars.color.surface.hover },
    // A ring marks today, so it does not rely on colour (design-spec 4.4).
    "&[data-today]": {
      boxShadow: `inset 0 0 0 ${vars.borderWidth.strong} ${vars.color.border.strong}`,
    },
    "&[data-selected]": {
      background: vars.color.control.primary,
      color: vars.color.control.onPrimary,
    },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled], &[data-unavailable]": {
      color: vars.color.text.disabled,
      cursor: "default",
    },
  },
});
