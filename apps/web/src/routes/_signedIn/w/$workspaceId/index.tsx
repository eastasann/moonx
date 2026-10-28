import { createFileRoute } from "@tanstack/react-router";
import { DashboardScreen } from "../../../../screens/Dashboard";
import { DashboardSkeleton } from "../../../../screens/DashboardSkeleton";

export const Route = createFileRoute("/_signedIn/w/$workspaceId/")({
  staticData: { skeleton: DashboardSkeleton },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { modal } = Route.useSearch();
  return <DashboardScreen modal={modal} />;
}
