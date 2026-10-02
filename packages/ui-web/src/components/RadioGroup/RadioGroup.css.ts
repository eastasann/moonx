import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { choiceRow } from "../_internal/field.css";
import { sizeVariants } from "../_internal/sizes";

export const radio = choiceRow;

const radioRoot = choiceRow.classNames.base;

export const indicator = recipe({
  base: {
    flexShrink: 0,
    borderRadius: "50%",
    background: vars.color.surface.raised,
    border: `${vars["border-width"].strong} solid ${vars.color.border.strong}`,
    transition: `border-width ${vars.motion.transition.hover}, border-color ${vars.motion.transition.hover}`,
    selectors: {
      [`${radioRoot}[data-hovered] &`]: { borderColor: vars.color.text.secondary },
      [`${radioRoot}[data-focus-visible] &`]: focusRing,
      [`${radioRoot}[data-invalid] &`]: { borderColor: vars.color.negative.fg },
      [`${radioRoot}[data-disabled] &`]: {
        background: vars.color.control.disabled,
        borderColor: vars.color.border.hairline,
      },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => {
      const size = vars.scale.component["radio-button"]["control-size"][s];
      return {
        inlineSize: size,
        blockSize: size,
        selectors: {
          [`${radioRoot}[data-selected] &`]: {
            borderWidth: `calc(${size} * 0.3)`,
            borderColor: vars.color.control["track-fill"],
          },
          [`${radioRoot}[data-selected][data-disabled] &`]: {
            borderColor: vars.color.text.disabled,
          },
          [`${radioRoot}[data-selected][data-invalid] &`]: {
            borderColor: vars.color.negative.fg,
          },
        },
      };
    }),
  },
  defaultVariants: { size: "M" },
});

export const groupRoot = style({});
