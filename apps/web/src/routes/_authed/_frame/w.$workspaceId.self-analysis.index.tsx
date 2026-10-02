import { createFileRoute } from "@tanstack/react-router";
import { SelfAnalysisHome } from "../../../screens/SelfAnalysisHome";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/self-analysis/")({
  component: SelfAnalysisHomeRoute,
});

function SelfAnalysisHomeRoute() {
  const { workspaceId } = Route.useParams();
  return <SelfAnalysisHome workspaceId={workspaceId} />;
}
