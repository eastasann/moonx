import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { typography } from "../styles/helpers";

/** The buttons, then the confidence under them. */
export const root = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: vars.space["200"],
  minWidth: 0,
});

/** The buttons and the note beside them, wrapping on a narrow card (s11-form.html .classify). */
export const row = style({
  display: "flex",
  alignItems: "center",
  flexWrap: "wrap",
  gap: `${vars.space["100"]} ${vars.space["200"]}`,
  minWidth: 0,
  maxWidth: "100%",
});

/** "Not classified yet", in the amber of attention (s11-form.html .attn-note). */
export const note = style({
  ...typography("bodySm"),
  color: vars.color.notice.fg,
  fontWeight: vars.typography.label.fontWeight,
});

/** "Confidence" over its groove (as FauPicker's). */
export const group = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  gap: vars.scale.component.fauPicker.labelGap,
  maxWidth: "100%",
});

export const groupLabel = style({
  ...typography("captionSm"),
  margin: 0,
  color: vars.color.text.secondary,
});

export const toggleGlyph = style({ display: "inline-flex" });
