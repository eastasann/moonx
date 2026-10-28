import { createFileRoute } from "@tanstack/react-router";
import {
  DashboardScreen,
  DashboardSkeleton,
} from "../../../../screens/Dashboard";

export const Route = createFileRoute("/_signedIn/w/$workspaceId/")({
  staticData: { skeleton: DashboardSkeleton },
  component: DashboardRoute,
});

function DashboardRoute() {
  const { modal } = Route.useSearch();
  return <DashboardScreen modal={modal} />;
}
