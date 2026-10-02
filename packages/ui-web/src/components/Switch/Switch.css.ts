import { recipe } from "@vanilla-extract/recipes";
import { focusRing, reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { choiceRow } from "../_internal/field.css";
import { sizeVariants } from "../_internal/sizes";

const switchRoot = choiceRow.classNames.base;
const tokens = vars.scale.component.switch;

export const switchRow = choiceRow;

export const track = recipe({
  base: {
    position: "relative",
    flexShrink: 0,
    borderRadius: vars.radius.pill,
    background: vars.color.control.track,
    transition: `background-color ${vars.motion.transition.hover}`,
    selectors: {
      [`${switchRoot}[data-focus-visible] &`]: focusRing,
      [`${switchRoot}[data-selected] &`]: { background: vars.color.control["track-fill"] },
      [`${switchRoot}[data-disabled] &`]: { background: vars.color.control.disabled },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({
      inlineSize: tokens["control-width"][s],
      blockSize: tokens["control-height"][s],
    })),
  },
  defaultVariants: { size: "M" },
});

export const handle = recipe({
  base: {
    position: "absolute",
    insetBlockStart: "50%",
    transform: "translateY(-50%)",
    borderRadius: "50%",
    background: vars.color.surface.raised,
    transition: `inset-inline-start ${vars.motion.transition.hover}, width ${vars.motion.transition.hover}, height ${vars.motion.transition.hover}`,
    selectors: {
      [`${switchRoot}[data-disabled] &`]: { background: vars.color.text.disabled },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => {
      const gap = (handleSize: string) =>
        `calc((${tokens["control-height"][s]} - ${handleSize}) / 2)`;
      return {
        inlineSize: tokens["handle-size"][s],
        blockSize: tokens["handle-size"][s],
        insetInlineStart: gap(tokens["handle-size"][s]),
        selectors: {
          [`${switchRoot}[data-selected] &`]: {
            inlineSize: tokens["handle-size-selected"][s],
            blockSize: tokens["handle-size-selected"][s],
            insetInlineStart: `calc(${tokens["control-width"][s]} - ${tokens["handle-size-selected"][s]} - ${gap(tokens["handle-size-selected"][s])})`,
          },
        },
      };
    }),
  },
  defaultVariants: { size: "M" },
});

export const helpIndent = recipe({
  base: {},
  variants: {
    size: sizeVariants((s) => ({
      marginInlineStart: `calc(${tokens["control-width"][s]} + ${vars.space["100"]})`,
    })),
  },
  defaultVariants: { size: "M" },
});
