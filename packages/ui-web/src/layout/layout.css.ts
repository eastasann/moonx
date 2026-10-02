import { SPACE_STEPS } from "@moonx/ui-tokens";
import { recipe } from "@vanilla-extract/recipes";
import { vars } from "../theme";

type Side = Record<(typeof SPACE_STEPS)[number], Record<string, string>>;
const bySpace = (property: string): Side =>
  Object.fromEntries(SPACE_STEPS.map((step) => [step, { [property]: vars.space[step] }])) as Side;

export const flex = recipe({
  base: { display: "flex", minWidth: 0 },
  variants: {
    direction: { row: { flexDirection: "row" }, column: { flexDirection: "column" } },
    align: {
      start: { alignItems: "flex-start" },
      center: { alignItems: "center" },
      end: { alignItems: "flex-end" },
      stretch: { alignItems: "stretch" },
      baseline: { alignItems: "baseline" },
    },
    justify: {
      start: { justifyContent: "flex-start" },
      center: { justifyContent: "center" },
      end: { justifyContent: "flex-end" },
      between: { justifyContent: "space-between" },
    },
    wrap: { true: { flexWrap: "wrap" }, false: { flexWrap: "nowrap" } },
    gap: bySpace("gap"),
    padding: bySpace("padding"),
    paddingX: bySpace("paddingInline"),
    paddingY: bySpace("paddingBlock"),
    grow: { true: { flexGrow: 1 } },
  },
  defaultVariants: { direction: "row", align: "stretch", justify: "start", wrap: false },
});

export const grid = recipe({
  base: { display: "grid", minWidth: 0 },
  variants: {
    columns: {
      1: { gridTemplateColumns: "minmax(0, 1fr)" },
      2: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
      3: { gridTemplateColumns: "repeat(3, minmax(0, 1fr))" },
      4: { gridTemplateColumns: "repeat(4, minmax(0, 1fr))" },
    },
    align: {
      start: { alignItems: "start" },
      center: { alignItems: "center" },
      stretch: { alignItems: "stretch" },
    },
    gap: bySpace("gap"),
    padding: bySpace("padding"),
  },
  defaultVariants: { columns: 1, align: "stretch" },
});

export const container = recipe({
  base: { marginInline: "auto", width: "100%" },
  variants: {
    width: {
      reading: { maxWidth: vars.layout["reading-column-max"] },
      content: { maxWidth: vars.layout["content-max"] },
    },
  },
  defaultVariants: { width: "content" },
});
