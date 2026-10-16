import { vars } from "@moonx/ui-tokens";
import { createSprinkles, defineProperties } from "@vanilla-extract/sprinkles";
import { desktopUp, tabletUp } from "../styles/helpers";

const space = Object.fromEntries(
  Object.entries(vars.space).map(([key, value]) => [`space-${key}`, value]),
) as Record<`space-${keyof typeof vars.space}`, string>;

const align = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  stretch: "stretch",
  baseline: "baseline",
} as const;

const justify = {
  start: "flex-start",
  center: "center",
  end: "flex-end",
  "space-between": "space-between",
  "space-around": "space-around",
  "space-evenly": "space-evenly",
} as const;

const columns = Object.fromEntries(
  [1, 2, 3, 4, 5, 6, 12].map((count) => [
    count,
    `repeat(${count}, minmax(0, 1fr))`,
  ]),
) as Record<1 | 2 | 3 | 4 | 5 | 6 | 12, string>;

/**
 * Layout properties that change at the 06 breakpoints, mobile first: a value given for
 * `tablet` holds from `semantic.breakpoint.tablet` up until a `desktop` value overrides it.
 */
const responsive = defineProperties({
  conditions: {
    mobile: {},
    tablet: { "@media": tabletUp },
    desktop: { "@media": desktopUp },
  },
  defaultCondition: "mobile",
  properties: {
    flexDirection: ["row", "column", "row-reverse", "column-reverse"],
    flexWrap: ["wrap", "nowrap"],
    alignItems: align,
    justifyContent: justify,
    justifyItems: align,
    gap: space,
    rowGap: space,
    columnGap: space,
    gridTemplateColumns: columns,
  },
});

export const sprinkles = createSprinkles(responsive);
export type Sprinkles = Parameters<typeof sprinkles>[0];
