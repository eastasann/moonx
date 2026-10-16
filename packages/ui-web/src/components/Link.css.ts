import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import {
  atLeastTarget,
  focusRing,
  hoverTransition,
  typography,
} from "../styles/helpers";

/** Links are the body colour with an underline (06 color.text.link). */
export const link = recipe({
  base: {
    ...hoverTransition,
    color: vars.color.text.link,
    textDecorationLine: "underline",
    textDecorationThickness: vars.borderWidth.hairline,
    cursor: "pointer",
    borderRadius: vars.radius.chip,
    outline: "none",
    selectors: {
      "&[data-focus-visible]": focusRing,
      "&[data-disabled]": {
        color: vars.color.text.disabled,
        cursor: "not-allowed",
      },
    },
  },
  variants: {
    variant: {
      // Standalone on a row or in a list: keeps the minimum target (design-spec 4.5).
      primary: {
        ...typography("label"),
        display: "inline-flex",
        alignItems: "center",
        minHeight: atLeastTarget("0px"),
      },
      // Inside running text: wraps with it, so it takes the inline exception of WCAG
      // 2.5.5 / 2.5.8 and inherits the text's font.
      secondary: { font: "inherit" },
    },
  },
  defaultVariants: { variant: "primary" },
});
