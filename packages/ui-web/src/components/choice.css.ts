import { vars } from "@moonx/ui-tokens";
import { createVar, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  narrowQuery,
  reducedMotion,
  typography,
} from "../styles/helpers";

const sizes = ["S", "M", "L", "XL"] as const;
type SizeKey = (typeof sizes)[number];
const sized = <T>(make: (size: SizeKey) => T) =>
  Object.fromEntries(sizes.map((size) => [size, make(size)])) as Record<
    SizeKey,
    T
  >;

/**
 * The row of a Checkbox, Radio or Switch: the whole row (control and label) is the
 * target, at least the minimum target tall (design-spec 4.3).
 */
export const row = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["100"],
    // A control without a visible label is the target alone: it still keeps the minimum.
    minWidth: vars.scale.component.targetMin,
    minHeight: atLeastTarget("0px"),
    color: vars.color.text.primary,
    cursor: "pointer",
    WebkitTapHighlightColor: "transparent",
    selectors: {
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    size: sized((size) => ({
      fontSize: vars.scale.component.field.fontSize[size],
    })),
  },
  defaultVariants: { size: "M" },
});

export const rowLabel = style({ lineHeight: vars.typography.label.lineHeight });

/** The square of a Checkbox. Selected and indeterminate boxes take the ink fill. */
export const box = recipe({
  base: {
    ...hoverTransition,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    border: `${vars.scale.component.checkbox.borderWidth} solid ${vars.color.border.strong}`,
    background: vars.color.control.secondary,
    color: vars.color.control.onPrimary,
    selectors: {
      "[data-selected] > &, [data-indeterminate] > &": {
        background: vars.color.control.primary,
        borderColor: vars.color.control.primary,
      },
      "[data-pressed][data-selected] > &": {
        background: vars.color.control.primaryPressed,
      },
      "[data-focus-visible] > &": focusRing,
      "[data-invalid] > &": { borderColor: vars.color.negative.fg },
      "[data-invalid][data-selected] > &": {
        background: vars.color.negative.strong,
        borderColor: vars.color.negative.strong,
        color: vars.color.negative.onStrong,
      },
      "[data-disabled] > &": {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
        color: vars.color.text.disabled,
      },
    },
  },
  variants: {
    size: sized((size) => ({
      width: vars.scale.component.checkbox.controlSize[size],
      height: vars.scale.component.checkbox.controlSize[size],
      borderRadius: vars.scale.component.checkbox.radius[size],
    })),
  },
  defaultVariants: { size: "M" },
});

const radioDot = createVar();

/**
 * The circle of a Radio: chosen, an ink ring with an ink dot inside (s19-decision.html,
 * design-spec 4.5).
 */
export const circle = recipe({
  base: {
    ...hoverTransition,
    display: "inline-grid",
    placeItems: "center",
    flexShrink: 0,
    border: `${vars.scale.component.radioButton.borderWidth} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.pill,
    background: vars.color.control.secondary,
    selectors: {
      "[data-selected] > &": { borderColor: vars.color.control.primary },
      "[data-selected] > &::after": {
        content: '""',
        width: radioDot,
        height: radioDot,
        borderRadius: vars.radius.pill,
        background: vars.color.control.primary,
      },
      "[data-invalid][data-selected] > &::after": {
        background: vars.color.negative.fg,
      },
      "[data-disabled][data-selected] > &::after": {
        background: vars.color.text.disabled,
      },
      "[data-focus-visible] > &": focusRing,
      "[data-invalid] > &": { borderColor: vars.color.negative.fg },
      "[data-disabled] > &": {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
      },
    },
  },
  variants: {
    size: sized((size) => ({
      width: vars.scale.component.radioButton.controlSize[size],
      height: vars.scale.component.radioButton.controlSize[size],
      vars: { [radioDot]: vars.scale.component.radioButton.dotSize[size] },
    })),
  },
  defaultVariants: { size: "M" },
});

/** The track of a Switch, the handle growing when on (06 component.switch). */
export const track = recipe({
  base: {
    ...hoverTransition,
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    flexShrink: 0,
    border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.pill,
    background: vars.color.control.secondary,
    selectors: {
      "[data-selected] > &": {
        background: vars.color.control.primary,
        borderColor: vars.color.control.primary,
      },
      "[data-focus-visible] > &": focusRing,
      "[data-disabled] > &": {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
      },
    },
  },
  variants: {
    size: sized((size) => ({
      width: vars.scale.component.switch.controlWidth[size],
      height: vars.scale.component.switch.controlHeight[size],
    })),
  },
  defaultVariants: { size: "M" },
});

export const handle = recipe({
  base: {
    position: "absolute",
    insetInlineStart: `calc((var(--switch-height) - var(--handle) - 2 * ${vars.borderWidth.strong}) / 2)`,
    width: "var(--handle)",
    height: "var(--handle)",
    borderRadius: vars.radius.pill,
    background: vars.color.border.strong,
    transitionProperty: "inset-inline-start, width, height, background-color",
    transitionDuration: vars.motion.transition.hover.duration,
    transitionTimingFunction: vars.motion.transition.hover.timingFunction,
    selectors: {
      "[data-selected] > * > &": {
        vars: { "--handle": "var(--handle-selected)" },
        insetInlineStart: `calc(var(--switch-width) - var(--handle) - 2 * ${vars.borderWidth.strong} - (var(--switch-height) - var(--handle) - 2 * ${vars.borderWidth.strong}) / 2)`,
        background: vars.color.control.onPrimary,
      },
      "[data-disabled] > * > &": { background: vars.color.text.disabled },
    },
    "@media": {
      [reducedMotion]: {
        transitionProperty: "background-color",
        transitionDuration: vars.motion.reduced.fade,
      },
    },
  },
  variants: {
    size: sized((size) => ({
      vars: {
        "--switch-width": vars.scale.component.switch.controlWidth[size],
        "--switch-height": vars.scale.component.switch.controlHeight[size],
        "--handle": vars.scale.component.switch.handleSize[size],
        "--handle-selected":
          vars.scale.component.switch.handleSizeSelected[size],
      },
    })),
  },
  defaultVariants: { size: "M" },
});

/** The label, help and the list of a CheckboxGroup or RadioGroup. */
export const group = style({
  display: "flex",
  flexDirection: "column",
  gap: vars.space["75"],
  minWidth: 0,
});

export const groupLabel = style({
  ...typography("fieldLabel"),
  color: vars.color.text.primary,
});

export const options = recipe({
  base: { display: "flex", minWidth: 0 },
  variants: {
    orientation: {
      vertical: { flexDirection: "column", alignItems: "flex-start" },
      horizontal: {
        flexWrap: "wrap",
        columnGap: vars.space["400"],
        rowGap: vars.space["75"],
      },
    },
  },
  defaultVariants: { orientation: "vertical" },
});

// RadioGroup's cards (s19-decision.html .choices).

const radioCard = vars.scale.component.radioCard;

export const cardGroup = style([group, { gap: radioCard.questionGap }]);

/** The question over the cards, larger than a field's label. */
export const cardQuestion = style({
  ...typography("headingChoice"),
  color: vars.color.text.primary,
});

/** As many columns as choices; one on a phone. */
export const cardOptions = style({
  display: "grid",
  gridAutoFlow: "column",
  gridAutoColumns: "minmax(0, 1fr)",
  gap: radioCard.gap,
  "@media": {
    [narrowQuery]: {
      gridAutoFlow: "row",
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
});

/** A choice: framed in the light line; chosen, the ink frame and an inner line of ink. */
export const card = style({
  ...hoverTransition,
  display: "flex",
  alignItems: "flex-start",
  gap: radioCard.gap,
  minHeight: atLeastTarget("0px"),
  padding: radioCard.padding,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.default}`,
  borderRadius: vars.radius.callout,
  background: vars.color.surface.raised,
  color: vars.color.text.primary,
  cursor: "pointer",
  WebkitTapHighlightColor: "transparent",
  selectors: {
    "&[data-selected]": {
      borderColor: vars.color.control.primary,
      boxShadow: `inset 0 0 0 ${vars.borderWidth.hairline} ${vars.color.control.primary}`,
    },
    "&[data-focus-visible]": focusRing,
    "&[data-invalid]": { borderColor: vars.color.negative.fg },
    "&[data-disabled]": {
      borderColor: vars.color.border.hairline,
      color: vars.color.text.disabled,
      cursor: "not-allowed",
    },
  },
});

/** The circle beside the title's first line; the card, not the circle, shows the focus. */
export const cardCircle = style({
  marginBlockStart: radioCard.circleOffset,
  selectors: { "[data-focus-visible] > &": { outline: "none" } },
});

export const cardText = style({
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
});

export const cardTitle = style({
  ...typography("heading4"),
  overflowWrap: "break-word",
});

export const cardDescription = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
  overflowWrap: "break-word",
  selectors: { "[data-disabled] &": { color: vars.color.text.disabled } },
});
