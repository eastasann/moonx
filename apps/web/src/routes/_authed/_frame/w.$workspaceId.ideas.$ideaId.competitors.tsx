import { createFileRoute } from "@tanstack/react-router";
import { competitorsSearchSchema } from "../../../lib/research";
import { Competitors } from "../../../screens/Competitors";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/competitors")({
  staticData: { crumb: ({ t }) => t("validation:sections.04") },
  validateSearch: competitorsSearchSchema,
  component: CompetitorsRoute,
});

function CompetitorsRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Competitors
      workspaceId={workspaceId}
      ideaId={ideaId}
      search={search}
      onSearchChange={(patch) =>
        // Opening a competitor is a step Back returns from; the view only refines the same page.
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: !("row" in patch),
        })
      }
    />
  );
}
