import { schema } from "@moonx/db";
import {
  completeSelfAnalysisBodySchema,
  putSelfAnalysisAnswerBodySchema,
  putSelfAnalysisSharesBodySchema,
  updateSelfAnalysisBodySchema,
} from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { loadSelfAnalysisOverview } from "../lib/dashboard-data";
import { historyActor } from "../lib/dto";
import { requireEditor, resolveScope } from "../lib/scope";
import {
  completeSelfAnalysis,
  ensureSelfAnalysis,
  loadSelfAnalysisHome,
  loadSelfAnalysisSection,
  loadSharedSelfAnalysis,
  reopenSelfAnalysis,
  saveSelfAnalysisAnswer,
  setSelfAnalysisCurrency,
  setSelfAnalysisShares,
} from "../lib/self-analysis";
import { authPlugin } from "../plugins";

const workspaceParams = z.object({ workspaceId: z.uuid() });

/** S1-S7 (SDD 5.8). */
export function selfAnalysisRoutes(ctx: AppContext) {
  const { db } = ctx;
  const home = async (userId: string) => {
    const analysis = await ensureSelfAnalysis(db, userId);
    return loadSelfAnalysisHome(db, userId, analysis);
  };
  return new Elysia({ name: "moonx-self-analysis" })
    .use(authPlugin(ctx))
    .get("/me/self-analysis", ({ user }) => home(user.id))
    .patch(
      "/me/self-analysis",
      async ({ body, user }) => {
        const analysis = await ensureSelfAnalysis(db, user.id);
        const updated = await setSelfAnalysisCurrency(db, analysis, body.currency);
        return loadSelfAnalysisHome(db, user.id, updated);
      },
      { body: updateSelfAnalysisBodySchema },
    )
    .get(
      "/me/self-analysis/sections/:sectionKey",
      async ({ params, user }) =>
        loadSelfAnalysisSection(db, await ensureSelfAnalysis(db, user.id), params.sectionKey),
      { params: z.object({ sectionKey: z.string().max(20) }) },
    )
    .put(
      "/me/self-analysis/answers/:questionKey",
      async ({ params, body, user, request }) => {
        const analysis = await ensureSelfAnalysis(db, user.id);
        return db.transaction((tx) =>
          saveSelfAnalysisAnswer(
            tx,
            { analysis, actor: historyActor(request, user), now: ctx.now() },
            params.questionKey,
            body,
          ),
        );
      },
      {
        params: z.object({ questionKey: z.string().max(100) }),
        body: putSelfAnalysisAnswerBodySchema,
      },
    )
    .post(
      "/me/self-analysis/complete",
      async ({ body, user }) => {
        const analysis = await ensureSelfAnalysis(db, user.id);
        const done = await db.transaction((tx) =>
          completeSelfAnalysis(tx, analysis, body?.confirmEmpty === true, ctx.now()),
        );
        return loadSelfAnalysisHome(db, user.id, done);
      },
      { body: z.optional(completeSelfAnalysisBodySchema) },
    )
    .post("/me/self-analysis/reopen", async ({ user }) => {
      const analysis = await ensureSelfAnalysis(db, user.id);
      return loadSelfAnalysisHome(db, user.id, await reopenSelfAnalysis(db, analysis));
    })
    .put(
      "/me/self-analysis/shares",
      async ({ body, user }) => {
        const analysis = await ensureSelfAnalysis(db, user.id);
        await db.transaction((tx) => setSelfAnalysisShares(tx, analysis, body.workspaceIds));
        const [fresh] = await db
          .select()
          .from(schema.selfAnalyses)
          .where(eq(schema.selfAnalyses.id, analysis.id));
        return loadSelfAnalysisHome(db, user.id, fresh as typeof analysis);
      },
      { body: putSelfAnalysisSharesBodySchema },
    )
    .get(
      "/workspaces/:workspaceId/self-analyses",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: params.workspaceId });
        requireEditor(scope);
        return { items: await loadSelfAnalysisOverview(db, scope.workspaceId) };
      },
      { params: workspaceParams },
    )
    .get(
      "/workspaces/:workspaceId/self-analyses/:userId",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { workspaceId: params.workspaceId });
        requireEditor(scope);
        return loadSharedSelfAnalysis(db, scope.workspaceId, params.userId);
      },
      { params: z.object({ workspaceId: z.uuid(), userId: z.uuid() }) },
    );
}
