import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { atLeastTarget, focusRing, typography } from "../styles/helpers";
import { cellPaddingX } from "./tableCell.css";

const sizes = ["S", "M", "L", "XL"] as const;

/**
 * The text of a field: its step's size, never below 06 field.font-size-min on touch
 * screens (16px: iOS zooms into smaller fields on focus, and a phone held sideways is
 * wider than the tablet breakpoint, where the narrow 16px stops; design-spec 4.3).
 */
const fieldFont = (size: (typeof sizes)[number]) =>
  `max(${vars.scale.component.field.fontSize[size]}, ${vars.scale.component.field.fontSizeMin})`;

/**
 * The outer element of every field (TextField・TextArea・NumberField・SearchField・Picker・
 * ComboBox・DatePicker): label, frame and help text stacked. Fields keep the default
 * width of their size unless told to fill the line.
 */
export const fieldRoot = recipe({
  base: {
    display: "flex",
    flexDirection: "column",
    maxWidth: "100%",
    minWidth: 0,
  },
  variants: {
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          gap: vars.scale.component.field.labelGap[size],
          width: vars.scale.component.field.defaultWidth[size],
        },
      ]),
    ) as Record<(typeof sizes)[number], { gap: string; width: string }>,
    width: {
      default: {},
      full: { width: "100%" },
      // As wide as the content, never narrower than the size's default width: the date
      // segments keep their minimum target each, which the default width cannot hold on
      // the large scale.
      content: { width: "fit-content" },
    },
  },
  compoundVariants: sizes.map((size) => ({
    variants: { size, width: "content" as const },
    style: { minWidth: vars.scale.component.field.defaultWidth[size] },
  })),
  defaultVariants: { size: "M", width: "default" },
});

export const label = style({
  ...typography("fieldLabel"),
  color: vars.color.text.primary,
  cursor: "default",
});

/**
 * The bordered box around the input and its buttons. Its states come from the field's
 * outer element (`fieldRoot`), which React Aria marks with `data-*` attributes.
 */
export const frame = recipe({
  base: {
    display: "flex",
    alignItems: "center",
    gap: vars.space["100"],
    minWidth: 0,
    background: vars.color.control.secondary,
    border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
    color: vars.color.text.primary,
    selectors: {
      // Fields show the ring whenever they are focused, with a mouse too: on a phone the
      // ring is how a focused field shows (design-spec 4.3).
      "&:focus-within": focusRing,
      "[data-invalid] > &": { borderColor: vars.color.negative.fg },
      "[data-disabled] > &": {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
        color: vars.color.text.disabled,
      },
      "[data-readonly] > &": {
        background: "transparent",
        borderColor: vars.color.border.hairline,
      },
    },
  },
  variants: {
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          minHeight: atLeastTarget(vars.scale.component.field.height[size]),
          paddingInline: vars.scale.component.field.paddingX[size],
          fontSize: fieldFont(size),
          borderRadius: vars.scale.component.field.radius[size],
        },
      ]),
    ) as Record<
      (typeof sizes)[number],
      {
        minHeight: string;
        paddingInline: string;
        fontSize: string;
        borderRadius: string;
      }
    >,
  },
  defaultVariants: { size: "M" },
});

/** The text input inside `frame`; the frame draws the border and the focus. */
export const input = style({
  flex: 1,
  minWidth: 0,
  alignSelf: "stretch",
  padding: 0,
  border: "none",
  outline: "none",
  background: "transparent",
  color: "inherit",
  fontFamily: vars.font.family.body,
  fontSize: "inherit",
  lineHeight: vars.typography.body.lineHeight,
  selectors: {
    "&::placeholder": { color: vars.color.text.placeholder, opacity: 1 },
    "&[data-disabled]": { cursor: "not-allowed" },
  },
});

/** Numbers are set in the monospaced face so digits line up (design-spec 4.4). */
export const numberInput = style({
  fontFamily: vars.font.family.mono,
  fontVariantNumeric: "tabular-nums",
});

/** Text before or after the input (the currency symbol, "%"). */
export const affix = style({
  flexShrink: 0,
  color: vars.color.text.secondary,
  fontFamily: vars.font.family.mono,
});

/**
 * A number in a table's number column: the symbol, the digits and the "%" packed at the
 * end of the frame, as the column's values are (design-spec 4.4・4.5). The frame's end
 * reaches the cell's edge and keeps the cell's padding less its border inside, so the
 * digits stay where the value was.
 */
export const endFrame = style({
  justifyContent: "flex-end",
  // The symbol touches the digits, as in the value it replaces ("₱30,000").
  gap: 0,
  marginInlineEnd: `calc(-1 * ${cellPaddingX})`,
  paddingInlineEnd: `calc(${cellPaddingX} - ${vars.borderWidth.strong})`,
  cursor: "text",
});

/**
 * Grows with the text it holds (`data-value`), so the input is as wide as its digits and
 * the symbol before it stays beside them; a text wider than the frame scrolls inside the
 * input.
 */
export const endSizer = style({
  display: "inline-grid",
  gridTemplateColumns: "minmax(0, max-content)",
  minWidth: "1ch",
  flexShrink: 1,
  selectors: {
    "&::after": {
      content: "attr(data-value)",
      gridArea: "1 / 1",
      visibility: "hidden",
      whiteSpace: "pre",
      overflow: "hidden",
      fontFamily: vars.font.family.mono,
      fontVariantNumeric: "tabular-nums",
    },
  },
});

// Without an intrinsic width of its own (an input's is about 20 characters), the input
// leaves the sizer the text's width and then fills it.
export const endInput = style({
  gridArea: "1 / 1",
  width: 0,
  minWidth: "100%",
  textAlign: "end",
});

export const description = style({
  ...typography("caption"),
  color: vars.color.text.secondary,
});

export const error = style({
  ...typography("caption"),
  display: "flex",
  alignItems: "flex-start",
  gap: vars.space["75"],
  color: vars.color.negative.fg,
});

/** TextArea's frame: it grows with the text, from the 06 minimum height. */
export const areaFrame = recipe({
  base: [
    frame.classNames.base,
    {
      alignItems: "stretch",
      minHeight: vars.scale.component.field.textAreaMinHeight,
    },
  ],
  variants: {
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          paddingInline: vars.scale.component.field.paddingX[size],
          fontSize: fieldFont(size),
          borderRadius: vars.scale.component.field.radius[size],
        },
      ]),
    ) as Record<
      (typeof sizes)[number],
      { paddingInline: string; fontSize: string; borderRadius: string }
    >,
  },
  defaultVariants: { size: "M" },
});

export const textArea = style([
  input,
  {
    display: "block",
    width: "100%",
    paddingBlock: vars.space["100"],
    resize: "none",
    overflow: "hidden",
    lineHeight: vars.typography.bodyLong.lineHeight,
  },
]);

/** The native clear button would duplicate SearchField's own. */
export const searchInput = style({
  selectors: {
    "&::-webkit-search-cancel-button": { appearance: "none" },
    "&::-webkit-search-decoration": { appearance: "none" },
  },
});

/** A button inside the frame (clear, open the list, open the calendar). */
export const fieldButton = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    minWidth: vars.scale.component.targetMin,
    minHeight: vars.scale.component.targetMin,
    padding: 0,
    border: "none",
    borderRadius: vars.radius.control,
    background: "transparent",
    color: vars.color.text.secondary,
    cursor: "pointer",
    outline: "none",
    selectors: {
      "&[data-hovered]": { background: vars.color.surface.hover },
      "&[data-pressed]": { background: vars.color.control.secondaryPressed },
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    size: Object.fromEntries(
      sizes.map((size) => [
        size,
        {
          marginInlineEnd: `calc(-0.5 * ${vars.scale.component.field.paddingX[size]})`,
        },
      ]),
    ) as Record<(typeof sizes)[number], { marginInlineEnd: string }>,
  },
  defaultVariants: { size: "M" },
});

/**
 * Picker's trigger is the frame itself. It is a button, so it shows the ring on keyboard
 * focus only, as buttons do, instead of whenever focused.
 */
export const pickerButton = style({
  width: "100%",
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&:focus-within": { outline: "none" },
    "&[data-focus-visible]": focusRing,
    "&[data-disabled]": { cursor: "not-allowed" },
  },
});

export const pickerValue = style({
  flex: 1,
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  lineHeight: vars.typography.body.lineHeight,
  selectors: {
    "&[data-placeholder]": { color: vars.color.text.placeholder },
  },
});

/** The tray of ComboBox on a phone: its own input above the list. */
export const trayBody = style({
  gap: vars.space["200"],
  padding: vars.density.regular.panelPadding,
});

export const trayField = style({
  display: "flex",
  flexDirection: "column",
  width: "100%",
});

/** "Use …": keeps the typed text, laid out as a row of the list below it. */
export const customValue = style({
  display: "flex",
  alignItems: "center",
  minHeight: atLeastTarget(vars.scale.component.field.height.M),
  paddingInline: vars.scale.component.field.paddingX.M,
  border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
  borderRadius: vars.radius.control,
  background: "transparent",
  color: vars.color.text.primary,
  fontFamily: vars.font.family.body,
  fontSize: vars.scale.component.field.fontSize.M,
  textAlign: "start",
  cursor: "pointer",
  outline: "none",
  selectors: {
    "&[data-hovered]": { background: vars.color.surface.hover },
    "&[data-pressed]": { background: vars.color.control.secondaryPressed },
    "&[data-focus-visible]": focusRing,
  },
});
