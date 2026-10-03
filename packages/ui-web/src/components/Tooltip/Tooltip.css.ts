import { recipe } from "@vanilla-extract/recipes";
import { reducedMotion } from "../../styles.css";
import { vars } from "../../theme";
import { sizeVariants } from "../_internal/sizes";

export const tooltip = recipe({
  base: {
    maxWidth: vars.layout["dialog-max-width"].S,
    paddingBlock: vars.space["75"],
    paddingInline: vars.space["100"],
    borderRadius: vars.radius.control,
    background: vars.color.control.primary,
    color: vars.color.control["on-primary"],
    fontFamily: vars.typography.caption.fontFamily,
    fontSize: vars.typography.caption.fontSize,
    fontWeight: vars.typography.caption.fontWeight,
    lineHeight: vars.typography.caption.lineHeight,
    transition: `opacity ${vars.motion.transition.hover}`,
    selectors: {
      "&[data-entering]": { opacity: 0 },
      "&[data-exiting]": { opacity: 0 },
      '&[data-placement="top"]': { marginBlockEnd: vars.space["75"] },
      '&[data-placement="bottom"]': { marginBlockStart: vars.space["75"] },
      '&[data-placement="left"]': { marginInlineEnd: vars.space["75"] },
      '&[data-placement="right"]': { marginInlineStart: vars.space["75"] },
    },
    "@media": { [reducedMotion]: { transition: "none" } },
  },
  variants: {
    size: sizeVariants((s) => ({ fontSize: vars.scale.component.field["font-size"][s] })),
  },
});
