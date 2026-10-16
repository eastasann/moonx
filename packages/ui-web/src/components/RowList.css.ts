import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, hoverTransition, typography } from "../styles/helpers";

const counter = "moonx-row";

export const list = recipe({
  base: { margin: 0, padding: 0, listStyle: "none", minWidth: 0 },
  variants: {
    ordered: { true: { counterReset: counter }, false: {} },
  },
});

/** Rows are divided by hairlines; an emphasised row is a card with space around it. */
export const item = recipe({
  base: {
    counterIncrement: counter,
    selectors: {
      "& + &": {
        borderTop: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
      },
    },
  },
  variants: {
    isEmphasized: {
      true: {
        marginBlock: vars.space["100"],
        border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
        borderRadius: vars.radius.card,
        background: vars.color.surface.raised,
        boxShadow: vars.shadow.raised,
      },
      false: {},
    },
  },
});

/**
 * The row: number, mark, text, end and ›, in a line at least the minimum target tall
 * (design-spec 4.3). A pressable row presses as a whole.
 */
export const row = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["200"],
    boxSizing: "border-box",
    width: "100%",
    minHeight: vars.scale.component.targetMin,
    paddingBlock: vars.space["200"],
    border: "none",
    background: "transparent",
    color: vars.color.text.primary,
    font: "inherit",
    textAlign: "start",
    textDecoration: "none",
    outline: "none",
  },
  variants: {
    ordered: {
      true: {
        "::before": {
          ...typography("number"),
          content: `counter(${counter})`,
          flexShrink: 0,
          color: vars.color.text.secondary,
          fontVariantNumeric: "tabular-nums",
        },
      },
      false: {},
    },
    isPressable: {
      true: {
        ...hoverTransition,
        cursor: "pointer",
        borderRadius: vars.radius.control,
        selectors: {
          "&[data-hovered]": { background: vars.color.surface.hover },
          "&[data-pressed]": { background: vars.color.surface.hover },
          "&[data-focus-visible]": { ...focusRing, outlineOffset: 0 },
        },
      },
      false: {},
    },
    isEmphasized: {
      true: { paddingInline: vars.density.regular.panelPadding },
      false: {},
    },
  },
});

export const start = style({ display: "inline-flex", flexShrink: 0 });

export const main = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["50"],
  flex: 1,
  minWidth: 0,
});

export const text = style({
  ...typography("body"),
  overflowWrap: "break-word",
});

export const description = style({
  ...typography("bodySm"),
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
});

export const end = style({
  ...typography("bodySm"),
  flexShrink: 0,
  color: vars.color.text.secondary,
  fontVariantNumeric: "tabular-nums",
  textAlign: "end",
});

export const chevron = style({
  display: "inline-flex",
  flexShrink: 0,
  color: vars.color.text.secondary,
});
