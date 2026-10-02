import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceSettings } from "../../../screens/WorkspaceSettings";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/settings")({
  staticData: { crumb: "app:nav.settings" },
  component: SettingsRoute,
});

function SettingsRoute() {
  const { workspaceId } = Route.useParams();
  return <WorkspaceSettings workspaceId={workspaceId} />;
}
