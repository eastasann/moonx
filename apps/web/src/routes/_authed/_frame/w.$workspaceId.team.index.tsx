import { createFileRoute } from "@tanstack/react-router";
import { Team } from "../../../screens/Team";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/team/")({
  component: TeamRoute,
});

function TeamRoute() {
  const { workspaceId } = Route.useParams();
  return <Team workspaceId={workspaceId} />;
}
