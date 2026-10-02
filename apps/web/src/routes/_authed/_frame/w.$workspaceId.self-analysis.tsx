import { createFileRoute, Outlet } from "@tanstack/react-router";

/** The Self Analysis branch: the home (10) and the question form (11) sit under this crumb. */
export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/self-analysis")({
  staticData: { crumb: "app:nav.self-analysis" },
  component: Outlet,
});
