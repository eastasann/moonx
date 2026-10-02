import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { adminRoutes } from "./admin";
import { aiRoutes } from "./ai";
import { commentRoutes } from "./comments";
import { dashboardRoutes } from "./dashboard";
import { decisionLogRoutes } from "./decision-log";
import { historyRoutes } from "./history";
import { ideaRoutes } from "./ideas";
import { invitationRoutes } from "./invitations";
import { notificationRoutes } from "./notifications";
import { planRoutes } from "./plans";
import { selfAnalysisRoutes } from "./self-analysis";
import { templateMigrationRoutes } from "./template-migrations";
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
    .use(aiRoutes(ctx))
    .use(historyRoutes(ctx))
    .use(templateMigrationRoutes(ctx))
    .use(decisionLogRoutes(ctx))
    .use(commentRoutes(ctx))
    .use(notificationRoutes(ctx))
    .use(adminRoutes(ctx));
}
