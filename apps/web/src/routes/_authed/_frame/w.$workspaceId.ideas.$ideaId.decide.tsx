import { createFileRoute } from "@tanstack/react-router";
import { Decide } from "../../../screens/decision/Decide";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas/$ideaId/decide")({
  staticData: { crumb: ({ t }) => t("decision:crumb") },
  component: DecideRoute,
});

function DecideRoute() {
  const { workspaceId, ideaId } = Route.useParams();
  return <Decide workspaceId={workspaceId} ideaId={ideaId} />;
}
