import { createFileRoute, Outlet } from "@tanstack/react-router";

/** The Team branch: the members' self analyses (12), with the chosen person in the path. */
export const Route = createFileRoute("/_authed/_frame/w/$workspaceId/team")({
  staticData: { crumb: "selfAnalysis:team.title" },
  component: Outlet,
});
