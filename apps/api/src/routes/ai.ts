import {
  aiExportQuerySchema,
  aiImportApplyBodySchema,
  aiImportContextQuerySchema,
  type TemplateKind,
} from "@moonx/schemas";
import { Elysia } from "elysia";
import type { AppContext } from "../context";
import { validationFailed } from "../errors";
import { exportForAi } from "../lib/ai-export";
import { applyAiImport, buildImportContext, lockImportRows } from "../lib/ai-import";
import {
  type AiTarget,
  loadPlanTarget,
  loadSelfAnalysisTarget,
  loadValidationTarget,
} from "../lib/ai-target";
import type { Executor } from "../lib/db";
import { historyActor } from "../lib/dto";
import { enforceRateLimit } from "../lib/rate-limit";
import { requireEditor, requireWritable, resolveScope } from "../lib/scope";
import { ensureSelfAnalysis } from "../lib/self-analysis";
import { authPlugin } from "../plugins";

/** X1-X3 (SDD 5.10). */
export function aiRoutes(ctx: AppContext) {
  const { db } = ctx;

  /** The target's id from the query: a validation or plan names it, a self analysis is the caller's own. */
  const requireId = (type: TemplateKind, id: string | undefined) => {
    if (type === "self_analysis") return;
    if (!id) {
      throw validationFailed([{ path: "id", code: "invalid_type", message: "id is required" }]);
    }
    return id;
  };

  /** Resolves the scope and loads the target. `write` also refuses Viewers and archived items. */
  async function loadTarget(
    executor: Executor,
    user: { id: string },
    type: TemplateKind,
    id: string | undefined,
    write: boolean,
  ): Promise<AiTarget> {
    if (type === "self_analysis") return loadSelfAnalysisTarget(executor, user.id);
    const targetId = requireId(type, id) as string;
    const scope = await resolveScope(
      executor,
      user,
      type === "validation" ? { validationId: targetId } : { planId: targetId },
    );
    if (write) requireWritable(scope);
    else requireEditor(scope);
    return type === "validation"
      ? loadValidationTarget(executor, targetId, scope.workspaceId)
      : loadPlanTarget(executor, targetId);
  }

  return new Elysia({ name: "moonx-ai" })
    .use(authPlugin(ctx))
    .get(
      "/ai/export",
      async ({ query, user }) => {
        const target = await loadTarget(db, user, query.source, query.id, false);
        await enforceRateLimit(db, "ai", user.id, ctx.now().getTime());
        const built = exportForAi(target, query, { now: ctx.now(), timeZone: user.timezone });
        return {
          markdown: built.markdown,
          json: built.json,
          fileBaseName: built.fileBaseName,
          questionCount: built.questionCount,
          allEmpty: built.allEmpty,
        };
      },
      { query: aiExportQuerySchema },
    )
    .get(
      "/ai/import/context",
      async ({ query, user }) =>
        buildImportContext(await loadTarget(db, user, query.target, query.id, false)),
      { query: aiImportContextQuerySchema },
    )
    .post(
      "/ai/import/apply",
      async ({ body, user, request }) => {
        const { type, id } = body.target;
        if (type !== "self_analysis") {
          // Role and archive checks come before the limit and the transaction.
          await resolveScope(
            db,
            user,
            type === "validation"
              ? { validationId: requireId(type, id) as string }
              : { planId: requireId(type, id) as string },
          ).then(requireWritable);
        }
        await enforceRateLimit(db, "ai", user.id, ctx.now().getTime());
        const keys = body.changes.map((c) => c.questionKey);
        return db.transaction(async (tx) => {
          const targetId =
            type === "self_analysis" ? (await ensureSelfAnalysis(tx, user.id)).id : (id as string);
          await lockImportRows(tx, { type, id: targetId }, keys);
          const target = await loadTarget(tx, user, type, id, true);
          return applyAiImport(
            tx,
            target,
            { actor: historyActor(request, user, "ai_import"), now: ctx.now() },
            body,
          );
        });
      },
      { body: aiImportApplyBodySchema },
    );
}
