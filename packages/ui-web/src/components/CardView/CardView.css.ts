import { CARD_VIEW_COLUMNS } from "@moonx/ui-tokens";
import { type RecipeVariants, recipe } from "@vanilla-extract/recipes";
import { breakpoints, vars } from "../../theme";

const narrow = `screen and (max-width: ${breakpoints.tablet - 1}px)`;

/** Below the tablet breakpoint every CardView is one column (design-spec 4.5). */
export const cardView = recipe({
  base: {
    display: "grid",
    gap: vars.space["300"],
    outline: "none",
    "@media": { [narrow]: { gridTemplateColumns: "minmax(0, 1fr)" } },
  },
  variants: {
    columns: Object.fromEntries(
      CARD_VIEW_COLUMNS.map((n) => [n, { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }]),
    ) as Record<(typeof CARD_VIEW_COLUMNS)[number], { gridTemplateColumns: string }>,
  },
  defaultVariants: { columns: 1 },
});

export type CardViewVariants = NonNullable<RecipeVariants<typeof cardView>>;
