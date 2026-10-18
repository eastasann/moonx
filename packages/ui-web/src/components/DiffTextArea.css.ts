import { sizes, vars } from "@moonx/ui-tokens";
import { createVar, style, styleVariants } from "@vanilla-extract/css";
import { focusRing, typography } from "../styles/helpers";

const diff = vars.scale.component.diffText;

/**
 * The imported answer's box (s25-import.html .edit): the canvas and the corner of a
 * groove, the fields' 3:1 frame (design-spec 4.4) where the mockup draws a light one. The
 * marks and the text are laid one over the other inside it.
 */
export const frame = style({
  position: "relative",
  display: "grid",
  minWidth: 0,
  border: `${vars.borderWidth.strong} solid ${vars.color.border.strong}`,
  borderRadius: vars.radius.groove,
  background: vars.color.surface.canvas,
  color: vars.color.text.primary,
  selectors: {
    // The ring shows whenever the field is focused, with a mouse too (design-spec 4.3).
    "&:focus-within": focusRing,
    "[data-invalid] > &": { borderColor: vars.color.negative.fg },
    "[data-disabled] > &": {
      background: vars.color.control.disabled,
      borderColor: vars.color.border.hairline,
      color: vars.color.text.disabled,
    },
  },
});

const fontSize = createVar();

/**
 * The text's size at each of TextArea's steps (06 field.font-size), never below the touch
 * screens' 16px (design-spec 4.3).
 */
export const size = styleVariants(
  Object.fromEntries(sizes.map((step) => [step, step])) as Record<
    (typeof sizes)[number],
    (typeof sizes)[number]
  >,
  (step) => ({
    vars: {
      [fontSize]: `max(${vars.scale.component.field.fontSize[step]}, ${vars.scale.component.field.fontSizeMin})`,
    },
  }),
);

/** The text and its marks set the same way, so the marks fall under the letters. */
const layer = {
  ...typography("bodyLong"),
  fontSize,
  gridArea: "1 / 1",
  margin: 0,
  paddingBlock: diff.editPaddingY,
  paddingInline: diff.editPaddingX,
  whiteSpace: "pre-wrap",
  overflowWrap: "break-word",
} as const;

/** Behind the text: only the marks show, the letters are transparent. */
export const marks = style({
  ...layer,
  color: "transparent",
  pointerEvents: "none",
  userSelect: "none",
});

export const added = style({
  background: vars.color.surface.sunken,
  textDecorationLine: "underline",
  textDecorationThickness: diff.addedThickness,
  textDecorationColor: vars.color.text.primary,
  textUnderlineOffset: diff.addedOffset,
});

export const area = style({
  ...layer,
  position: "relative",
  display: "block",
  width: "100%",
  border: "none",
  outline: "none",
  background: "transparent",
  color: "inherit",
  resize: "none",
  overflow: "hidden",
});
