import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { aiRoutes } from "./ai";
import { dashboardRoutes } from "./dashboard";
import { ideaRoutes } from "./ideas";
import { invitationRoutes } from "./invitations";
import { planRoutes } from "./plans";
import { selfAnalysisRoutes } from "./self-analysis";
import { validationRoutes } from "./validation";
import { workspaceRoutes } from "./workspaces";

/** Every `/api/v1` route group (SDD 5.3). */
export function apiV1(ctx: AppContext) {
  return new Elysia({ prefix: "/api/v1" })
    .use(workspaceRoutes(ctx))
    .use(invitationRoutes(ctx))
    .use(dashboardRoutes(ctx))
    .use(ideaRoutes(ctx))
    .use(validationRoutes(ctx))
    .use(selfAnalysisRoutes(ctx))
    .use(planRoutes(ctx))
    .use(aiRoutes(ctx));
}
