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
import type { AppContext } from "../context";
import { historyActor } from "../lib/dto";
import { duplicateIdea } from "../lib/idea-duplicate";
import { listIdeas } from "../lib/idea-query";
import { createIdea, setIdeaArchived, updateIdea } from "../lib/idea-write";
import { loadIdeas } from "../lib/ideas";
import { decodeCursor } from "../lib/page";
import { requireEditor, requireWritable, resolveScope } from "../lib/scope";
import { authPlugin } from "../plugins";

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
    .use(authPlugin(ctx))
    .get(
      "/workspaces/:workspaceId/ideas",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: params.workspaceId });
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
      { params: workspaceParams, query: listIdeasQuerySchema },
    )
    .post(
      "/workspaces/:workspaceId/ideas",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { workspaceId: params.workspaceId });
        requireEditor(scope);
        const ideaId = await createIdea(db, {
          workspaceId: scope.workspaceId,
          actor: historyActor(request, user),
          now: ctx.now(),
          body,
        });
        set.status = 201;
        return detailOf(scope.workspaceId, ideaId);
      },
      { params: workspaceParams, body: createIdeaBodySchema },
    )
    .get(
      "/ideas/:ideaId",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams },
    )
    .patch(
      "/ideas/:ideaId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireWritable(scope);
        await updateIdea(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          actor: historyActor(request, user),
          now: ctx.now(),
          body,
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams, body: updateIdeaBodySchema },
    )
    .post(
      "/ideas/:ideaId/duplicate",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireEditor(scope);
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
      { params: ideaParams, body: duplicateIdeaBodySchema.optional() },
    )
    .post(
      "/ideas/:ideaId/archive",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireEditor(scope);
        await setIdeaArchived(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          archived: true,
          now: ctx.now(),
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams },
    )
    .post(
      "/ideas/:ideaId/restore",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireEditor(scope);
        await setIdeaArchived(db, {
          ideaId: params.ideaId,
          workspaceId: scope.workspaceId,
          archived: false,
          now: ctx.now(),
        });
        return detailOf(scope.workspaceId, params.ideaId);
      },
      { params: ideaParams },
    );
}
