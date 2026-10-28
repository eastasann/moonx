import { costCategorySchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  CostsScreen,
  type CostsSearch,
  CostsSkeleton,
} from "../../../../../../screens/Costs";

/** A template key ("initial.permits") or a UUID: what `row` names a cost row by. */
const isRowName = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.-]{1,200}$/.test(value);

/**
 * `/w/$workspaceId/ideas/$ideaId/costs`: 17 Costs (SDD 4章). Values it cannot read are
 * left out.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/costs",
)({
  validateSearch: (search: Record<string, unknown>): CostsSearch => ({
    row: isRowName(search.row) ? search.row : undefined,
    tab: costCategorySchema.safeParse(search.tab).data,
  }),
  staticData: { skeleton: CostsSkeleton },
  component: CostsRoute,
});

function CostsRoute() {
  const { ideaId } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <CostsScreen ideaId={ideaId} search={search} modal={modal} about={about} />
  );
}
