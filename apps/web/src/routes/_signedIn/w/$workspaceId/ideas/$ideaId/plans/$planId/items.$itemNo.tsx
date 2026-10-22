import { isQuestionKey, uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  PlanItemScreen,
  type PlanItemSearch,
  PlanItemSkeleton,
} from "../../../../../../../../screens/PlanItem";

/**
 * `/w/$workspaceId/ideas/$ideaId/plans/$planId/items/$itemNo`: 21 Plan item (SDD 4章).
 * A `q` that is no plan sub-item ID (design-spec 6.6) and a `version` that is no id are
 * left out, the latter opening the item as it is now; an `$itemNo` outside 1–30 is "Not
 * found".
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/plans/$planId/items/$itemNo",
)({
  validateSearch: (search: Record<string, unknown>): PlanItemSearch => ({
    q:
      typeof search.q === "string" && isQuestionKey(search.q, "business_plan")
        ? search.q
        : undefined,
    version: uuidSchema.safeParse(search.version).success
      ? (search.version as string)
      : undefined,
  }),
  staticData: { skeleton: PlanItemSkeleton },
  component: PlanItemRoute,
});

function PlanItemRoute() {
  const { ideaId, planId, itemNo } = Route.useParams();
  const { modal: _, about: __, ...search } = Route.useSearch();
  return (
    <PlanItemScreen
      ideaId={ideaId}
      planId={planId}
      itemParam={itemNo}
      search={search}
    />
  );
}
