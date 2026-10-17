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
    transitionProperty: "color, text-decoration-color",
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
      // Its text names it, so the underline is the light line (d1-moon.html .textlink),
      // darkening on hover.
      primary: {
        ...typography("link"),
        display: "inline-flex",
        alignItems: "center",
        minHeight: atLeastTarget("0px"),
        minWidth: vars.scale.component.targetMin,
        textDecorationColor: vars.color.border.default,
        textUnderlineOffset: vars.space["75"],
        selectors: {
          "&[data-hovered]": { textDecorationColor: vars.color.text.link },
        },
      },
      // Inside running text: wraps with it, so it takes the inline exception of WCAG
      // 2.5.5 / 2.5.8 and inherits the text's font.
      secondary: { font: "inherit" },
    },
    isQuiet: {
      true: {
        textDecorationLine: "none",
        selectors: {
          "&[data-hovered]": { textDecorationLine: "underline" },
        },
      },
      false: {},
    },
  },
  defaultVariants: { variant: "primary", isQuiet: false },
});
