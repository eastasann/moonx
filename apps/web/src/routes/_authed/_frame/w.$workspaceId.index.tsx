import { createFileRoute } from "@tanstack/react-router";
import { Dashboard } from "../../../screens/Dashboard";

export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/")({
  staticData: { crumb: "app:nav.dashboard" },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { workspaceId } = Route.useParams();
  return <Dashboard workspaceId={workspaceId} />;
}
