import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

// Looks the gallery needs that no component offers: the toolbar band and the boxes that
// make layout components visible. Only this page uses them.

export const page = style({
  paddingBlock: vars.space["500"],
});

export const toolbar = style({
  position: "sticky",
  top: 0,
  zIndex: vars.layout.zIndex.nav,
  paddingBlock: vars.space["300"],
  background: vars.color.surface.canvas,
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const section = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["400"],
  paddingBlock: vars.space["600"],
  borderBlockEnd: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
});

export const specimen = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["200"],
  minWidth: 0,
});

export const caption = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  fontFamily: vars.font.family.mono,
});

export const box = style({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: vars.space["700"],
  minHeight: vars.space["700"],
  paddingInline: vars.space["200"],
  background: vars.color.surface.sunken,
  border: `${vars.borderWidth.hairline} dashed ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
  ...typography("caption"),
  color: vars.color.text.secondary,
});

export const frame = style({
  border: `${vars.borderWidth.hairline} dashed ${vars.color.border.strong}`,
  borderRadius: vars.radius.chip,
});

export const verticalRule = style({
  display: "flex",
  alignItems: "stretch",
  gap: vars.space["300"],
  height: vars.space["700"],
});

/** A narrow box that squeezes what it holds. */
export const narrowBox = style({
  width: vars.space["1000"],
});
