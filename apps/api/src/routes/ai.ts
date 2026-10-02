import {
  aiExportQuerySchema,
  aiImportApplyBodySchema,
  aiImportContextQuerySchema,
  type TemplateKind,
} from "@moonx/schemas";
import { Elysia } from "elysia";
import { type AccessInput, accessPlugin } from "../access";
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
import { authorize, type Scope, type ScopeRef } from "../lib/scope";
import { ensureSelfAnalysis } from "../lib/self-analysis";

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

  /** The resource a request names, `null` for the caller's own self analysis (no workspace). */
  const refOf = (type: TemplateKind, id: string | undefined): ScopeRef | null => {
    if (type === "self_analysis") return null;
    const targetId = requireId(type, id) as string;
    return type === "validation" ? { validationId: targetId } : { planId: targetId };
  };

  /** Loads the target the route has authorized with `scope`. */
  async function loadTarget(
    executor: Executor,
    user: { id: string },
    type: TemplateKind,
    id: string | undefined,
    scope: Scope | null,
  ): Promise<AiTarget> {
    if (type === "self_analysis" || !scope) return loadSelfAnalysisTarget(executor, user.id);
    const targetId = requireId(type, id) as string;
    return type === "validation"
      ? loadValidationTarget(executor, targetId, scope.workspaceId)
      : loadPlanTarget(executor, targetId);
  }

  return new Elysia({ name: "moonx-ai" })
    .use(accessPlugin(ctx))
    .get(
      "/ai/export",
      async ({ query, user, scope }) => {
        const target = await loadTarget(db, user, query.source, query.id, scope);
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
      {
        query: aiExportQuerySchema,
        located: { to: ({ query }: AccessInput) => refOf(query.source, query.id), need: "editor" },
      },
    )
    .get(
      "/ai/import/context",
      async ({ query, user, scope }) =>
        buildImportContext(await loadTarget(db, user, query.target, query.id, scope)),
      {
        query: aiImportContextQuerySchema,
        located: { to: ({ query }: AccessInput) => refOf(query.target, query.id), need: "editor" },
      },
    )
    .post(
      "/ai/import/apply",
      async ({ body, user, request }) => {
        const { type, id } = body.target;
        await enforceRateLimit(db, "ai", user.id, ctx.now().getTime());
        const keys = body.changes.map((c) => c.questionKey);
        return db.transaction(async (tx) => {
          const targetId =
            type === "self_analysis" ? (await ensureSelfAnalysis(tx, user.id)).id : (id as string);
          await lockImportRows(tx, { type, id: targetId }, keys);
          // Checked again under the locks: the idea or plan may have been archived meanwhile.
          const ref = refOf(type, id);
          const scope = ref && (await authorize(tx, user, ref, "writable"));
          const target = await loadTarget(tx, user, type, id, scope);
          return applyAiImport(
            tx,
            target,
            { actor: historyActor(request, user, "ai_import"), now: ctx.now() },
            body,
          );
        });
      },
      {
        body: aiImportApplyBodySchema,
        located: {
          to: ({ body }: AccessInput) => refOf(body.target.type, body.target.id),
          need: "writable",
        },
      },
    );
}
