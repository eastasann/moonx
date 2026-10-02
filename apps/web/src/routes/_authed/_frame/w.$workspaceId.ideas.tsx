import { createFileRoute, Outlet } from "@tanstack/react-router";

/** The Ideas branch: its list and every idea's screens sit under this crumb. */
export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/ideas")({
  staticData: { crumb: "app:nav.ideas" },
  component: Outlet,
});
