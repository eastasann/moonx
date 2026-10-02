import { globalStyle, style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { choiceRow } from "../_internal/field.css";
import { sizeVariants } from "../_internal/sizes";

const checkboxRoot = choiceRow.classNames.base;

export const checkbox = choiceRow;

export const wrapper = style({
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
});

export const box = recipe({
  base: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    background: vars.color.surface.raised,
    color: vars.color.control["on-primary"],
    border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
    borderRadius: vars.radius.chip,
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      [`${checkboxRoot}[data-hovered] &`]: { borderColor: vars.color.text.secondary },
      [`${checkboxRoot}[data-focus-visible] &`]: focusRing,
      [`${checkboxRoot}[data-selected] &, ${checkboxRoot}[data-indeterminate] &`]: {
        background: vars.color.control["track-fill"],
        borderColor: vars.color.control["track-fill"],
      },
      [`${checkboxRoot}[data-invalid] &`]: { borderColor: vars.color.negative.fg },
      [`${checkboxRoot}[data-invalid][data-selected] &, ${checkboxRoot}[data-invalid][data-indeterminate] &`]:
        {
          background: vars.color.negative.fg,
        },
      [`${checkboxRoot}[data-disabled] &`]: {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
        color: vars.color.text.disabled,
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => {
      const size = vars.scale.component.checkbox["control-size"][s];
      return {
        inlineSize: size,
        blockSize: size,
      };
    }),
  },
  defaultVariants: { size: "M" },
});

/** Indents help text under the label text, past the control and its gap. */
export const helpIndent = recipe({
  base: {},
  variants: {
    size: sizeVariants((s) => ({
      marginInlineStart: `calc(${vars.scale.component.checkbox["control-size"][s]} + ${vars.space["100"]})`,
    })),
  },
  defaultVariants: { size: "M" },
});

globalStyle(`${box.classNames.base} svg`, {
  inlineSize: "80%",
  blockSize: "80%",
  strokeWidth: vars.icon["stroke-width"],
});
