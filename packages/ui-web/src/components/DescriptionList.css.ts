import { vars } from "@moonx/ui-tokens";
import { style } from "@vanilla-extract/css";
import { recipe } from "@vanilla-extract/recipes";
import { narrowQuery, typography } from "../styles/helpers";

const measures = vars.scale.component.descriptionList;
const hairline = `${vars.borderWidth.hairline} solid ${vars.color.border.hairline}`;

export const list = recipe({
  base: {
    display: "grid",
    gridTemplateColumns: `${measures.labelWidth} minmax(0, 1fr)`,
    margin: 0,
    borderTop: hairline,
    "@media": { [narrowQuery]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  },
  variants: {
    isSpacious: {
      true: {
        gridTemplateColumns: `${measures.labelWidthSpacious} minmax(0, 1fr)`,
      },
      false: {},
    },
  },
});

/** A label and its value take the two columns of the list's grid. */
export const item = style({ display: "contents" });

const cell = {
  margin: 0,
  paddingBlock: measures.paddingY,
  borderBottom: hairline,
  overflowWrap: "break-word",
} as const;

export const label = style({
  ...cell,
  ...typography("caption"),
  color: vars.color.text.secondary,
  "@media": {
    [narrowQuery]: { borderBottom: "none", paddingBlockEnd: 0 },
  },
});

export const value = style({
  ...cell,
  ...typography("bodyCompact"),
  color: vars.color.text.primary,
});
