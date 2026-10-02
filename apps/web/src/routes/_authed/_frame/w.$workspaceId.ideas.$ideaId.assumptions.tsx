import { createFileRoute } from "@tanstack/react-router";
import { assumptionsSearchSchema } from "../../../lib/research";
import { AssumptionsRisks } from "../../../screens/AssumptionsRisks";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/assumptions")({
  staticData: { crumb: ({ t }) => t("validation:sections.09") },
  validateSearch: assumptionsSearchSchema,
  component: AssumptionsRoute,
});

function AssumptionsRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <AssumptionsRisks
      workspaceId={workspaceId}
      ideaId={ideaId}
      search={search}
      onSearchChange={(patch) =>
        // Opening a row is a step Back returns from; switching the tab only refines the same page.
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: !patch.row,
        })
      }
    />
  );
}
