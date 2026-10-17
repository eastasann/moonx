import { vars } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { narrowQuery } from "../styles/helpers";

/** Material read together on the white surface in a hairline frame (s19-decision.html .well). */
export const well = recipe({
  base: {
    minWidth: 0,
    background: vars.color.surface.raised,
    border: `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`,
    borderRadius: vars.radius.card,
    color: vars.color.text.primary,
    overflowWrap: "break-word",
  },
  variants: {
    density: {
      regular: { padding: vars.density.regular.panelPadding },
      // 19 and 24 are spacious screens: 19's own spacing (06 component.well), tighter on
      // a phone's width.
      spacious: {
        paddingBlockStart: vars.scale.component.well.paddingTop,
        paddingInline: vars.scale.component.well.paddingX,
        paddingBlockEnd: vars.scale.component.well.paddingBottom,
        "@media": {
          [narrowQuery]: {
            paddingBlockStart: vars.scale.component.well.paddingTopNarrow,
            paddingInline: vars.scale.component.well.paddingXNarrow,
            paddingBlockEnd: vars.scale.component.well.paddingBottomNarrow,
          },
        },
      },
    },
  },
  defaultVariants: { density: "regular" },
});
