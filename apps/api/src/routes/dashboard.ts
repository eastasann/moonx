import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { loadActivity } from "../lib/dashboard-activity";
import { loadDueSoon, loadSelfAnalysisOverview } from "../lib/dashboard-data";
import { listDashboardIdeas } from "../lib/idea-query";
import { requireEditor, resolveScope } from "../lib/scope";
import { authPlugin } from "../plugins";

const params = { params: z.object({ workspaceId: z.uuid() }) };

/** D1-D4 (SDD 5.6). */
export function dashboardRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-dashboard" })
    .use(authPlugin(ctx))
    .get(
      "/workspaces/:workspaceId/dashboard/ideas",
      async ({ params: p, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: p.workspaceId });
        return listDashboardIdeas(db, scope.workspaceId);
      },
      params,
    )
    .get(
      "/workspaces/:workspaceId/dashboard/self-analyses",
      async ({ params: p, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: p.workspaceId });
        requireEditor(scope);
        return { items: await loadSelfAnalysisOverview(db, scope.workspaceId) };
      },
      params,
    )
    .get(
      "/workspaces/:workspaceId/dashboard/due-soon",
      async ({ params: p, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: p.workspaceId });
        return {
          items: await loadDueSoon(db, {
            workspaceId: scope.workspaceId,
            userId: user.id,
            timezone: user.timezone,
            now: ctx.now(),
          }),
        };
      },
      params,
    )
    .get(
      "/workspaces/:workspaceId/dashboard/activity",
      async ({ params: p, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: p.workspaceId });
        return { items: await loadActivity(db, scope.workspaceId) };
      },
      params,
    );
}
