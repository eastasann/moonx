import { createFileRoute } from "@tanstack/react-router";
import { pitchSearchSchema } from "../../../lib/plans";
import { PitchDeckScreen } from "../../../screens/PitchDeck";

export const Route = createFileRoute(
  "/_authed/_frame/w/$workspaceId/ideas/$ideaId/plans/$planId/pitch",
)({
  staticData: { crumb: ({ t }) => t("pitch:crumb") },
  validateSearch: pitchSearchSchema,
  component: PitchRoute,
});

function PitchRoute() {
  const { workspaceId, ideaId, planId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <PitchDeckScreen
      workspaceId={workspaceId}
      ideaId={ideaId}
      planId={planId}
      variant={search.variant ?? "one"}
      versionId={search.version}
      onSearchChange={(patch) =>
        void navigate({ search: (previous) => ({ ...previous, ...patch }), replace: true })
      }
    />
  );
}
