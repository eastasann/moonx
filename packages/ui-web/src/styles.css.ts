import { globalStyle, style } from "@vanilla-extract/css";
import { vars } from "./theme";

globalStyle("html", { colorScheme: "light dark" });
globalStyle(':root[data-theme="light"]', { colorScheme: "light" });
globalStyle(':root[data-theme="dark"]', { colorScheme: "dark" });
globalStyle("body", {
  margin: 0,
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
  fontFamily: vars.typography.body.fontFamily,
  fontSize: vars.typography.body.fontSize,
  lineHeight: vars.typography.body.lineHeight,
});
globalStyle("*, *::before, *::after", { boxSizing: "border-box" });

/** Focus indicator shared by every interactive part; shown for keyboard focus only. */
export const focusRing = {
  outline: `${vars["border-width"]["focus-ring"]} solid ${vars.color.border.focus}`,
  outlineOffset: vars["border-width"]["focus-offset"],
} as const;

/** Hides content visually while keeping it for assistive technology. */
export const visuallyHidden = style({
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
});

/** Honors the OS "reduce motion" setting for the transitions a component declares. */
export const reducedMotion = "(prefers-reduced-motion: reduce)";
