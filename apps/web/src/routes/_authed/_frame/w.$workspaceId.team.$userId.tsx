import { createFileRoute } from "@tanstack/react-router";
import { Team } from "../../../screens/Team";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/team/$userId")({
  component: TeamMemberRoute,
});

function TeamMemberRoute() {
  const { workspaceId, userId } = Route.useParams();
  return <Team workspaceId={workspaceId} userId={userId} />;
}
