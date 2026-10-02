import { schema } from "@moonx/db";
import {
  createIdeaBodySchema,
  duplicateIdeaBodySchema,
  listIdeasQuerySchema,
  updateIdeaBodySchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { accessPlugin } from "../access";
import type { AppContext } from "../context";
import { historyActor } from "../lib/dto";
import { duplicateIdea } from "../lib/idea-duplicate";
import { listIdeas } from "../lib/idea-query";
import { createIdea, setIdeaArchived, updateIdea } from "../lib/idea-write";
import { loadIdeas } from "../lib/ideas";
import { decodeCursor } from "../lib/page";

const workspaceParams = z.object({ workspaceId: z.uuid() });
const ideaParams = z.object({ ideaId: z.uuid() });

/** I1-I4 (SDD 5.6). */
export function ideaRoutes(ctx: AppContext) {
  const { db } = ctx;

  async function detailOf(workspaceId: string, ideaId: string) {
    const [row] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, ideaId));
    const [loaded] = await loadIdeas(db, workspaceId, row ? [row] : []);
    return (loaded as NonNullable<typeof loaded>).detail;
  }

  return new Elysia({ name: "moonx-ideas" })
    .use(accessPlugin(ctx))
    .get(
      "/workspaces/:workspaceId/ideas",
      async ({ query, scope }) => {
        return listIdeas(
          db,
          scope.workspaceId,
          {
            stage: query.stage,
            decision: query.decision,
            proposerId: query.proposerId,
            includeArchived: query.includeArchived === "true",
            sort: query.sort,
            q: query.q,
          },
          decodeCursor(query.cursor),
          Number(query.limit),
        );
      },
      {
        params: workspaceParams,
        query: listIdeasQuerySchema,
        scoped: { to: { workspaceId: "workspaceId" }, need: "member" },
      },
    )
    .post(
      "/workspaces/:workspaceId/ideas",
      async ({ body, user, request, set, scope }) => {
        const ideaId = await createIdea(db, {
          workspaceId: scope.workspaceId,
          actor: historyActor(request, user),
          now: ctx.now(),
          body,
        });
        set.status = 201;
        return detailOf(scope.workspaceId, ideaId);
      },
      {
        params: workspaceParams,
        body: createIdeaBodySchema,
        scoped: { to: { workspaceId: "workspaceId" }, need: "editor" },
      },
    )
    .get(
      "/ideas/:ideaId",
      async ({ params, scope }) => {
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams, scoped: { to: { ideaId: "ideaId" }, need: "member" } },
    )
    .patch(
      "/ideas/:ideaId",
      async ({ params, body, user, request, scope }) => {
        await updateIdea(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          actor: historyActor(request, user),
          now: ctx.now(),
          body,
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      {
        params: ideaParams,
        body: updateIdeaBodySchema,
        scoped: { to: { ideaId: "ideaId" }, need: "writable" },
      },
    )
    .post(
      "/ideas/:ideaId/duplicate",
      async ({ params, body, user, request, set, scope }) => {
        const ideaId = await duplicateIdea(db, {
          sourceId: params.ideaId,
          workspaceId: scope.workspaceId,
          actor: historyActor(request, user, "duplicate"),
          now: ctx.now(),
          name: body?.name,
        });
        set.status = 201;
        return detailOf(scope.workspaceId, ideaId);
      },
      {
        params: ideaParams,
        body: duplicateIdeaBodySchema.optional(),
        scoped: { to: { ideaId: "ideaId" }, need: "editor" },
      },
    )
    .post(
      "/ideas/:ideaId/archive",
      async ({ params, scope }) => {
        await setIdeaArchived(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          archived: true,
          now: ctx.now(),
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams, scoped: { to: { ideaId: "ideaId" }, need: "editor" } },
    )
    .post(
      "/ideas/:ideaId/restore",
      async ({ params, scope }) => {
        await setIdeaArchived(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          archived: false,
          now: ctx.now(),
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams, scoped: { to: { ideaId: "ideaId" }, need: "editor" } },
    );
}
