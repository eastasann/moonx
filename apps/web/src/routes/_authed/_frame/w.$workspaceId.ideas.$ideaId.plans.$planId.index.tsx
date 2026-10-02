import { createFileRoute } from "@tanstack/react-router";
import { planHomeSearchSchema } from "../../../lib/plans";
import { PlanHome } from "../../../screens/PlanHome";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/plans/$planId/")(
  {
    validateSearch: planHomeSearchSchema,
    component: PlanHomeRoute,
  },
);

function PlanHomeRoute() {
  const { workspaceId, ideaId, planId } = Route.useParams();
  const { version } = Route.useSearch();
  return <PlanHome workspaceId={workspaceId} ideaId={ideaId} planId={planId} versionId={version} />;
}
