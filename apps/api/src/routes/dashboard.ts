import { Elysia } from "elysia";
import { z } from "zod";
import { accessPlugin } from "../access";
import type { AppContext } from "../context";
import { loadActivity } from "../lib/dashboard-activity";
import { loadDueSoon, loadSelfAnalysisOverview } from "../lib/dashboard-data";
import { listDashboardIdeas } from "../lib/idea-query";

const workspaceParams = z.object({ workspaceId: z.uuid() });

/** A new object per route: Elysia keys what a macro built on the option object (see access.ts). */
const workspaceRule = (need: "member" | "editor") => ({
  params: workspaceParams,
  scoped: { to: { workspaceId: "workspaceId" }, need },
});

/** D1-D4 (SDD 5.6). */
export function dashboardRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-dashboard" })
    .use(accessPlugin(ctx))
    .get(
      "/workspaces/:workspaceId/dashboard/ideas",
      ({ scope }) => listDashboardIdeas(db, scope.workspaceId),
      workspaceRule("member"),
    )
    .get(
      "/workspaces/:workspaceId/dashboard/self-analyses",
      async ({ scope }) => ({ items: await loadSelfAnalysisOverview(db, scope.workspaceId) }),
      workspaceRule("editor"),
    )
    .get(
      "/workspaces/:workspaceId/dashboard/due-soon",
      async ({ scope, user }) => {
        return {
          items: await loadDueSoon(db, {
            workspaceId: scope.workspaceId,
            userId: user.id,
            timezone: user.timezone,
            now: ctx.now(),
          }),
        };
      },
      workspaceRule("member"),
    )
    .get(
      "/workspaces/:workspaceId/dashboard/activity",
      async ({ scope }) => ({ items: await loadActivity(db, scope.workspaceId) }),
      workspaceRule("member"),
    );
}
