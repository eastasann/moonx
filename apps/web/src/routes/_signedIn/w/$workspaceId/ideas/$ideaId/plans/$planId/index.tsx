import { uuidSchema } from "@moonx/schemas";
import { createFileRoute } from "@tanstack/react-router";
import {
  PlanHomeScreen,
  type PlanHomeSearch,
  PlanHomeSkeleton,
} from "../../../../../../../../screens/PlanHome";

/**
 * `/w/$workspaceId/ideas/$ideaId/plans/$planId`: 20 Plan home (SDD 4章). A `version` that
 * is no id is left out, which opens the plan as it is now.
 */
export const Route = createFileRoute(
  "/_signedIn/w/$workspaceId/ideas/$ideaId/plans/$planId/",
)({
  validateSearch: (search: Record<string, unknown>): PlanHomeSearch => ({
    version: uuidSchema.safeParse(search.version).success
      ? (search.version as string)
      : undefined,
  }),
  staticData: { skeleton: PlanHomeSkeleton },
  component: PlanHomeRoute,
});

function PlanHomeRoute() {
  const { ideaId, planId } = Route.useParams();
  const { modal, about, ...search } = Route.useSearch();
  return (
    <PlanHomeScreen
      ideaId={ideaId}
      planId={planId}
      search={search}
      modal={modal}
      about={about}
    />
  );
}
