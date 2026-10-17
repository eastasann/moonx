import { vars } from "@moonx/ui-tokens";
import { style, styleVariants } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

// Modals are writing screens: spacious padding (design-spec 4.4「密度とスケールの対応」, M1〜M9).
const padding = vars.density.spacious.panelPadding;

/**
 * The dialog fills its frame (a centred card, a tray or a full-screen sheet) as a column:
 * only the body scrolls, so the title and the buttons stay in view, the buttons at the
 * bottom on a phone (design-spec 4.1「主要な操作は下部に固定」).
 */
export const dialog = style({
  display: "flex",
  flexDirection: "column",
  flex: "1 1 auto",
  minHeight: 0,
  outline: "none",
});

export const header = style({
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["200"],
  paddingBlockStart: padding,
  paddingInline: padding,
  paddingBlockEnd: vars.density.spacious.gap,
});

export const title = style({
  flex: "1 1 auto",
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: vars.space["100"],
});

/** The close button sits on the title's first line without pushing the title down. */
export const close = style({
  flexShrink: 0,
  marginBlock: `calc(-1 * ${vars.space["100"]})`,
  marginInlineEnd: `calc(-1 * ${vars.space["100"]})`,
});

export const body = style({
  ...typography("body"),
  flex: "1 1 auto",
  minHeight: 0,
  overflowY: "auto",
  overscrollBehavior: "contain",
  paddingInline: padding,
  paddingBlockEnd: padding,
});

export const footer = style({
  flexShrink: 0,
  paddingInline: padding,
  paddingBlockEnd: padding,
});

/** The AlertDialog's sign before the title: red for error, amber for warning (4.4). */
export const alertIcon = styleVariants({
  error: { display: "inline-flex", color: vars.color.negative.strong },
  warning: { display: "inline-flex", color: vars.color.notice.strong },
});

/** Hears Escape around the dialog without a box of its own. */
export const escapeAnswer = style({ display: "contents" });
