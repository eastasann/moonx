import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { IDEAS_SEARCH_DEFAULTS, ideasSearchSchema } from "../../../lib/ideas";
import { Ideas } from "../../../screens/Ideas";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/")({
  validateSearch: ideasSearchSchema,
  search: { middlewares: [stripSearchParams(IDEAS_SEARCH_DEFAULTS)] },
  component: IdeasRoute,
});

function IdeasRoute() {
  const { workspaceId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <Ideas
      workspaceId={workspaceId}
      search={search}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true })
      }
    />
  );
}
