import { vars } from "@moonx/ui-tokens";
import { globalStyle, style, styleVariants } from "@vanilla-extract/css";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

const picker = vars.scale.component.fauPicker;

/** The label and, for a Fact without evidence, the warning sign; outside a table the moon first. */
export const summary = style({
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["85"],
  minWidth: 0,
});

/**
 * A table cell's label (s17-costs.html .faucell): secondary, as its button, and darker
 * with it under the pointer and while open; Unclassified keeps its amber and Empty its
 * quieter colour (06 fau.*.fg).
 */
export const cellLabel = styleVariants({
  fact: {},
  assumption: {},
  unknown: {},
  unclassified: { color: vars.color.fau.unclassified.fg },
  empty: { color: vars.color.fau.empty.fg },
});

/** "Fact · No evidence" carries a warning in the amber of attention (06 notice). */
export const warning = style({
  display: "inline-flex",
  color: vars.color.notice.fg,
});

/**
 * The cell's button: the label in the secondary small text, starting at the cell's edge
 * like the values beside it (s17-costs.html .faucell); darker under the pointer and while
 * its popover is open.
 */
export const trigger = style({
  ...hoverTransition,
  ...typography("bodySm"),
  display: "inline-flex",
  alignItems: "center",
  gap: vars.space["85"],
  maxWidth: `calc(100% + ${picker.triggerPaddingX})`,
  minHeight: atLeastTarget("0px"),
  marginInlineStart: `calc(-1 * ${picker.triggerPaddingX})`,
  paddingBlock: picker.triggerPaddingY,
  paddingInline: picker.triggerPaddingX,
  border: "none",
  borderRadius: vars.radius.chip,
  background: "transparent",
  color: vars.color.text.secondary,
  textAlign: "start",
  whiteSpace: "nowrap",
  cursor: "pointer",
  outline: "none",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-hovered]": {
      background: vars.color.surface.raised,
      color: vars.color.text.primary,
    },
    '&[data-pressed], &[aria-expanded="true"]': {
      background: vars.color.surface.sunken,
      color: vars.color.text.primary,
    },
    "&[data-focus-visible]": focusRing,
  },
});

/** The state alone (read only, and above the phone's buttons). */
export const readOnly = style({
  ...typography("bodySm"),
  display: "inline-flex",
  alignItems: "center",
  color: vars.color.text.secondary,
});

/** A phone's sheet: the state, then the buttons, in a fieldset without a frame. */
export const inline = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["100"],
  minWidth: 0,
  margin: 0,
  padding: 0,
  border: "none",
});

/**
 * The popover of s17-costs.html (.pop): 300px wide with its own padding, in place of the
 * dialog's.
 */
export const popoverBody = style({
  boxSizing: "border-box",
  width: picker.popoverWidth,
  maxWidth: `calc(100% + 2 * ${vars.density.regular.panelPadding})`,
  margin: `calc(-1 * ${vars.density.regular.panelPadding})`,
  padding: picker.popoverPadding,
});

// The popover's grooves are s17-costs.html's .seg buttons whatever the picker's size, so
// the three buttons fit its 300px; the size still sets the phone's sheet.
globalStyle(`${popoverBody} [role="radio"]`, {
  minHeight: atLeastTarget(picker.grooveItemHeight),
  height: "auto",
  paddingInline: picker.grooveItemPaddingX,
  fontSize: vars.typography.bodySm.fontSize,
});

/** The question, the F/A/U buttons, the confidence and the way to evidence, stacked. */
export const controls = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: picker.groupGap,
});

/** A small heading and the groove under it, as wide as the popover or the sheet (6.0.3). */
export const group = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "stretch",
  gap: picker.labelGap,
});

export const groupLabel = style({
  ...typography("captionSm"),
  margin: 0,
  color: vars.color.text.secondary,
});

/** "Have a quote? Mark it Fact." and Add evidence, under a hairline. */
export const evidence = style({
  ...typography("caption"),
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: vars.space["75"],
  paddingBlockStart: picker.evidencePaddingTop,
  borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  color: vars.color.text.secondary,
});

export const toggleGlyph = style({ display: "inline-flex" });
