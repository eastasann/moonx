import { createFileRoute } from "@tanstack/react-router";
import { researchSearchSchema } from "../../../lib/research";
import { ResearchLog } from "../../../screens/ResearchLog";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/research")({
  staticData: { crumb: ({ t }) => t("validation:sections.03") },
  validateSearch: researchSearchSchema,
  component: ResearchRoute,
});

function ResearchRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ResearchLog
      workspaceId={workspaceId}
      ideaId={ideaId}
      search={search}
      onSearchChange={(patch) =>
        // Opening an entry is a step Back returns from; a filter only refines the same page.
        void navigate({
          search: (previous) => ({ ...previous, ...patch }),
          replace: !("entry" in patch || "new" in patch),
        })
      }
    />
  );
}
