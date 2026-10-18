import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { narrowQuery, typography } from "../styles/helpers";

/**
 * The help's content at Spectrum 2's ContextualHelp width (06 layout.contextual-help-width)
 * and padding, kept inside the window. On a phone the tray is the window's width instead.
 */
export const content = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  width: vars.layout.contextualHelpWidth,
  maxWidth: `calc(100vw - 2 * ${vars.layout.pageGutterMobile})`,
  padding: vars.density.spacious.panelPadding,
  outline: "none",
  "@media": {
    [narrowQuery]: { width: "auto", maxWidth: "none" },
  },
});

/** Spectrum 2's ContextualHelp title size (06 typography.heading-help). */
export const title = style({
  ...typography("headingHelp"),
  margin: 0,
  color: vars.color.text.primary,
});
