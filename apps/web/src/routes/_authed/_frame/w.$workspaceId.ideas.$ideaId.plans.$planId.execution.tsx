import { createFileRoute } from "@tanstack/react-router";
import { executionSearchSchema } from "../../../lib/plans";
import { Execution } from "../../../screens/Execution";

export const Route = createFileRoute(
  "/_authed/_frame/w/$workspaceId/ideas/$ideaId/plans/$planId/execution",
)({
  staticData: { crumb: ({ t }) => t("execution:crumb") },
  validateSearch: executionSearchSchema,
  component: ExecutionRoute,
});

function ExecutionRoute() {
  const { workspaceId, ideaId, planId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Execution
      workspaceId={workspaceId}
      ideaId={ideaId}
      planId={planId}
      search={search}
      onSearchChange={(patch) =>
        // Opening an item is a step Back returns from; a tab or a filter only refines the page.
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: !("item" in patch),
        })
      }
    />
  );
}
