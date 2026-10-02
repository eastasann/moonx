import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "./sizes";
import { atLeastTarget } from "./target";

const field = vars.scale.component.field;

export const fieldRoot = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    color: vars.color.text.primary,
    fontFamily: vars.typography.body.fontFamily,
  },
  variants: {
    size: sizeVariants((s) => ({
      gap: field["label-gap"][s],
      inlineSize: field["default-width"][s],
      maxInlineSize: "100%",
    })),
  },
  defaultVariants: { size: "M" },
});

/** For fields whose input sizes itself (checkbox and radio groups, tag lists). */
export const fieldRootAuto = style({ inlineSize: "auto", maxInlineSize: "none" });

const rootDisabled = `${fieldRoot.classNames.base}[data-disabled]`;
const rootInvalid = `${fieldRoot.classNames.base}[data-invalid]`;

export const label = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    gap: vars.space["50"],
    fontFamily: vars.typography.label.fontFamily,
    fontWeight: vars.typography.label.fontWeight,
    lineHeight: vars.typography.label.lineHeight,
    color: vars.color.text.primary,
    selectors: { [`${rootDisabled} &`]: { color: vars.color.text.disabled } },
  },
  variants: { size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })) },
  defaultVariants: { size: "M" },
});

export const description = style({
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
  color: vars.color.text.secondary,
});

export const errorMessage = style({
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
  color: vars.color.negative.fg,
});

/**
 * The frame of every text-like field. It goes on an Input, a Group or a trigger Button.
 * Invalid and disabled also read the field root, because Group and Button do not receive them.
 */
export const box = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    inlineSize: "100%",
    background: vars.color.surface.raised,
    color: vars.color.text.primary,
    border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.control,
    fontFamily: vars.typography.body.fontFamily,
    lineHeight: vars.typography.body.lineHeight,
    textAlign: "start",
    transition: `border-color ${vars.motion.transition.hover}`,
    selectors: {
      "&::placeholder": { color: vars.color.text.placeholder },
      "&[data-hovered]": { borderColor: vars.color.text.secondary },
      "&[data-focus-visible], &[data-focus-within]": focusRing,
      "&[data-invalid]": { borderColor: vars.color.negative.fg },
      [`${rootInvalid} &`]: { borderColor: vars.color.negative.fg },
      "&[data-disabled]": {
        background: vars.color.control.disabled,
        color: vars.color.text.disabled,
        borderColor: vars.color.border.hairline,
        cursor: "not-allowed",
      },
      [`${rootDisabled} &`]: {
        background: vars.color.control.disabled,
        color: vars.color.text.disabled,
        borderColor: vars.color.border.hairline,
        cursor: "not-allowed",
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({
      minHeight: atLeastTarget(field.height[s]),
      paddingInline: field["padding-x"][s],
      fontSize: field["font-size"][s],
    })),
    numeric: {
      true: {
        fontFamily: vars.typography.number.fontFamily,
        fontVariantNumeric: vars.typography.number.fontVariantNumeric,
      },
    },
  },
  defaultVariants: { size: "M" },
});

/** A borderless input inside a `box` that is a Group or a div. */
export const bareInput = style({
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  color: "inherit",
  font: "inherit",
  fontVariantNumeric: "inherit",
  textAlign: "inherit",
  outline: "none",
  selectors: {
    "&::placeholder": { color: vars.color.text.placeholder },
    "&:disabled": { cursor: "not-allowed" },
  },
});

export const textArea = style({
  minHeight: field["text-area-min-height"],
  paddingBlock: vars.space["100"],
  resize: "none",
  overflow: "hidden",
  display: "block",
});

export const icon = recipe({
  base: { flexShrink: 0, strokeWidth: vars.icon["stroke-width"] },
  variants: {
    size: {
      XS: {
        inlineSize: vars.scale.component.icon.size.XS,
        blockSize: vars.scale.component.icon.size.XS,
      },
      ...sizeVariants((s) => ({
        inlineSize: vars.scale.component.icon.size[s],
        blockSize: vars.scale.component.icon.size[s],
      })),
    },
  },
  defaultVariants: { size: "M" },
});

/** A small button inside a field box (clear, open). */
export const inlineButton = style({
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  padding: 0,
  border: "none",
  background: "transparent",
  color: vars.color.text.secondary,
  borderRadius: vars.radius.control,
  cursor: "pointer",
  minInlineSize: vars.scale.component["target-min"],
  minBlockSize: vars.scale.component["target-min"],
  marginBlock: `calc(-1 * ${vars.space["75"]})`,
  selectors: {
    "&[data-hovered]": { color: vars.color.text.primary },
    "&[data-pressed]": { color: vars.color.text.primary, background: vars.color.surface.hover },
    "&[data-focus-visible]": {
      ...focusRing,
      outlineOffset: `calc(-1 * ${vars["border-width"]["focus-ring"]})`,
    },
    "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
  },
});

export const listbox = style({
  display: "flex",
  flexDirection: "column",
  padding: vars.space["75"],
  outline: "none",
  maxHeight: "inherit",
  overflow: "auto",
});

export const listItem = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: vars.space["100"],
    paddingInline: vars.space["200"],
    paddingBlock: vars.space["100"],
    minHeight: vars.scale.component["target-min"],
    borderRadius: vars.radius.control,
    color: vars.color.text.primary,
    fontFamily: vars.typography.body.fontFamily,
    lineHeight: vars.typography.body.lineHeight,
    cursor: "pointer",
    outline: "none",
    selectors: {
      "&[data-hovered], &[data-focused]": { background: vars.color.surface.hover },
      "&[data-selected]": { fontWeight: vars.typography.label.fontWeight },
      "&[data-focus-visible]": {
        ...focusRing,
        outlineOffset: `calc(-1 * ${vars["border-width"]["focus-ring"]})`,
      },
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
  },
  variants: { size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })) },
  defaultVariants: { size: "M" },
});

export const valueText = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  selectors: { "&[data-placeholder]": { color: vars.color.text.placeholder } },
});

/** Description and error text under a single Checkbox or Switch. */
export const choiceHelp = style({
  display: "flex",
  flexDirection: "column",
  fontFamily: vars.typography.caption.fontFamily,
  fontSize: vars.typography.caption.fontSize,
  lineHeight: vars.typography.caption.lineHeight,
});

export const choiceGroupItems = recipe({
  base: { display: "flex", gap: vars.space["100"] },
  variants: {
    orientation: {
      vertical: { flexDirection: "column" },
      horizontal: { flexDirection: "row", flexWrap: "wrap", columnGap: vars.space["400"] },
    },
  },
  defaultVariants: { orientation: "vertical" },
});

export const choiceRow = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    minHeight: vars.scale.component["target-min"],
    color: vars.color.text.primary,
    fontFamily: vars.typography.body.fontFamily,
    lineHeight: vars.typography.body.lineHeight,
    cursor: "pointer",
    selectors: {
      "&[data-disabled]": { color: vars.color.text.disabled, cursor: "not-allowed" },
    },
  },
  variants: { size: sizeVariants((s) => ({ fontSize: field["font-size"][s] })) },
  defaultVariants: { size: "M" },
});
