import {
  createExecutionItemBodySchema,
  createPlanBodySchema,
  goNoGoBodySchema,
  listExecutionItemsQuerySchema,
  listPlansQuerySchema,
  orderExecutionItemsBodySchema,
  pitchDeckQuerySchema,
  planVersionQuerySchema,
  putPlanAnswerBodySchema,
  savePlanVersionBodySchema,
  updateExecutionItemBodySchema,
  updatePlanBodySchema,
} from "@moonx/schemas";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { todayIn } from "../lib/dashboard-data";
import { historyActor } from "../lib/dto";
import {
  buildExecutionItems,
  createExecutionItem,
  deleteExecutionItem,
  reorderExecutionItems,
  sortExecutionItems,
  updateExecutionItem,
} from "../lib/execution";
import { loadPitchDeck, pdfContentDisposition } from "../lib/pitch-deck";
import { loadPlanBundle } from "../lib/plan-context";
import { createPlanDraft } from "../lib/plan-draft";
import { loadGoNoGoContext, recordGoNoGo, savePlanVersion } from "../lib/plan-record";
import {
  buildPlanHome,
  buildPlanItem,
  buildVersionSummaries,
  loadViewedVersion,
} from "../lib/plan-view";
import {
  type PlanWriteContext,
  savePlanAnswer,
  setPlanArchived,
  updatePlanHeader,
} from "../lib/plan-write";
import { loadPlanSummaries } from "../lib/plans";
import { enforceRateLimit } from "../lib/rate-limit";
import {
  requireEditor,
  requireNotArchived,
  requireWritable,
  resolveScope,
  type Scope,
} from "../lib/scope";
import { renderPitchDeckPdf } from "../pdf/pitch-deck-pdf";
import { authPlugin } from "../plugins";

const ideaParams = z.object({ ideaId: z.uuid() });
const planParams = z.object({ planId: z.uuid() });
const itemParams = z.object({ itemId: z.uuid() });

/** P1-P13 (SDD 5.9). */
export function planRoutes(ctx: AppContext) {
  const { db } = ctx;

  const writeContext = (
    scope: Scope,
    request: Request,
    user: { id: string },
  ): PlanWriteContext => ({
    workspaceId: scope.workspaceId,
    ideaId: scope.ideaId as string,
    planId: scope.planId as string,
    actor: historyActor(request, user),
    now: ctx.now(),
  });

  async function homeOf(scope: Scope, user: { id: string; timezone: string }, versionId?: string) {
    const bundle = await loadPlanBundle(db, scope.planId as string);
    const viewing = await loadViewedVersion(db, bundle.plan.id, versionId);
    return buildPlanHome(
      db,
      bundle,
      { role: scope.role, today: todayIn(user.timezone, ctx.now()) },
      viewing,
    );
  }

  async function summaryOf(scope: Scope) {
    const all = await loadPlanSummaries(db, scope.workspaceId, [scope.ideaId as string]);
    const found = all.get(scope.ideaId as string)?.find((p) => p.id === scope.planId);
    if (!found) throw new ApiError("NOT_FOUND", "Resource not found");
    return found;
  }

  return new Elysia({ name: "moonx-plans" })
    .use(authPlugin(ctx))
    .get(
      "/ideas/:ideaId/plans",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        const all = await loadPlanSummaries(db, scope.workspaceId, [params.ideaId]);
        const plans = all.get(params.ideaId) ?? [];
        return {
          items: query.includeArchived === "true" ? plans : plans.filter((p) => !p.archived),
        };
      },
      { params: ideaParams, query: listPlansQuerySchema },
    )
    .post(
      "/ideas/:ideaId/plans",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { ideaId: params.ideaId });
        requireWritable(scope);
        const planId = await db.transaction((tx) =>
          createPlanDraft(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: params.ideaId,
              user: { id: user.id, displayName: user.displayName },
              actor: historyActor(request, user),
              now: ctx.now(),
            },
            body.name,
          ),
        );
        set.status = 201;
        return homeOf({ ...scope, planId }, user);
      },
      { params: ideaParams, body: createPlanBodySchema },
    )
    .get(
      "/plans/:planId",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        return homeOf(scope, user, query.versionId);
      },
      { params: planParams, query: planVersionQuerySchema },
    )
    .patch(
      "/plans/:planId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        await db.transaction((tx) =>
          updatePlanHeader(tx, writeContext(scope, request, user), body),
        );
        return homeOf(scope, user);
      },
      { params: planParams, body: updatePlanBodySchema },
    )
    .post(
      "/plans/:planId/archive",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireEditor(scope);
        requireNotArchived({ ...scope, planArchived: false });
        await db.transaction((tx) => setPlanArchived(tx, params.planId, true, ctx.now()));
        return summaryOf(scope);
      },
      { params: planParams },
    )
    .post(
      "/plans/:planId/restore",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireEditor(scope);
        requireNotArchived({ ...scope, planArchived: false });
        await db.transaction((tx) => setPlanArchived(tx, params.planId, false, ctx.now()));
        return summaryOf(scope);
      },
      { params: planParams },
    )
    .get(
      "/plans/:planId/items/:itemNo",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        const bundle = await loadPlanBundle(db, params.planId);
        const viewing = await loadViewedVersion(db, params.planId, query.versionId);
        return buildPlanItem(
          db,
          bundle,
          params.itemNo,
          { role: scope.role, today: todayIn(user.timezone, ctx.now()) },
          viewing,
        );
      },
      {
        params: z.object({ planId: z.uuid(), itemNo: z.coerce.number().int().min(1).max(30) }),
        query: planVersionQuerySchema,
      },
    )
    .put(
      "/plans/:planId/answers/:questionKey",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        return db.transaction((tx) =>
          savePlanAnswer(tx, writeContext(scope, request, user), params.questionKey, body),
        );
      },
      {
        params: z.object({ planId: z.uuid(), questionKey: z.string().max(100) }),
        body: putPlanAnswerBodySchema,
      },
    )
    .get(
      "/plans/:planId/versions",
      async ({ params, user }) => {
        await resolveScope(db, user, { planId: params.planId });
        return { items: await buildVersionSummaries(db, await loadPlanBundle(db, params.planId)) };
      },
      { params: planParams },
    )
    .post(
      "/plans/:planId/versions",
      async ({ params, body, user, set }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        const saved = await db.transaction((tx) =>
          savePlanVersion(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: scope.ideaId as string,
              planId: params.planId,
              user,
              now: ctx.now(),
            },
            body.name,
          ),
        );
        set.status = 201;
        return saved;
      },
      { params: planParams, body: savePlanVersionBodySchema },
    )
    .get(
      "/plans/:planId/go-no-go-context",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireEditor(scope);
        return loadGoNoGoContext(db, await loadPlanBundle(db, params.planId));
      },
      { params: planParams },
    )
    .post(
      "/plans/:planId/go-no-go",
      async ({ params, body, user, set }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        const recorded = await db.transaction((tx) =>
          recordGoNoGo(
            tx,
            {
              workspaceId: scope.workspaceId,
              ideaId: scope.ideaId as string,
              planId: params.planId,
              user,
              now: ctx.now(),
            },
            body,
          ),
        );
        set.status = 201;
        return recorded;
      },
      { params: planParams, body: goNoGoBodySchema },
    )
    .get(
      "/plans/:planId/execution-items",
      async ({ params, query, user }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        const bundle = await loadPlanBundle(db, params.planId);
        const assignee = query.assignee === "me" ? user.id : query.assignee;
        const rows = bundle.execution.filter(
          (e) =>
            (!query.type || e.type === query.type) &&
            (!assignee || e.assigneeUserId === assignee) &&
            (!query.status || e.status === query.status),
        );
        const items = await buildExecutionItems(
          db,
          { workspaceId: scope.workspaceId, today: todayIn(user.timezone, ctx.now()) },
          rows,
        );
        return { items: sortExecutionItems(items) };
      },
      { params: planParams, query: listExecutionItemsQuerySchema },
    )
    .post(
      "/plans/:planId/execution-items",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        const created = await db.transaction((tx) =>
          createExecutionItem(
            tx,
            { ...writeContext(scope, request, user), today: todayIn(user.timezone, ctx.now()) },
            body,
          ),
        );
        set.status = 201;
        return created;
      },
      { params: planParams, body: createExecutionItemBodySchema },
    )
    .patch(
      "/execution-items/:itemId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { executionItemId: params.itemId });
        requireWritable(scope);
        return db.transaction((tx) =>
          updateExecutionItem(
            tx,
            { ...writeContext(scope, request, user), today: todayIn(user.timezone, ctx.now()) },
            params.itemId,
            body,
          ),
        );
      },
      { params: itemParams, body: updateExecutionItemBodySchema },
    )
    .delete(
      "/execution-items/:itemId",
      async ({ params, user, request, set }) => {
        const scope = await resolveScope(db, user, { executionItemId: params.itemId });
        requireWritable(scope);
        await db.transaction((tx) =>
          deleteExecutionItem(
            tx,
            { ...writeContext(scope, request, user), today: todayIn(user.timezone, ctx.now()) },
            params.itemId,
          ),
        );
        set.status = 204;
      },
      { params: itemParams },
    )
    .put(
      "/plans/:planId/execution-items/order",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { planId: params.planId });
        requireWritable(scope);
        await db.transaction((tx) =>
          reorderExecutionItems(
            tx,
            { ...writeContext(scope, request, user), today: todayIn(user.timezone, ctx.now()) },
            body.type,
            body.ids,
          ),
        );
        set.status = 204;
      },
      { params: planParams, body: orderExecutionItemsBodySchema },
    )
    .get(
      "/plans/:planId/pitch-deck",
      async ({ params, query, user }) => {
        await resolveScope(db, user, { planId: params.planId });
        const bundle = await loadPlanBundle(db, params.planId);
        return (
          await loadPitchDeck(db, bundle, {
            variant: query.variant,
            versionId: query.versionId,
            now: ctx.now(),
          })
        ).deck;
      },
      { params: planParams, query: pitchDeckQuerySchema },
    )
    .get(
      "/plans/:planId/pitch-deck.pdf",
      async ({ params, query, user }) => {
        await resolveScope(db, user, { planId: params.planId });
        await enforceRateLimit(db, "pdf", user.id, ctx.now().getTime());
        const bundle = await loadPlanBundle(db, params.planId);
        const { deck, currency, versionName } = await loadPitchDeck(db, bundle, {
          variant: query.variant,
          versionId: query.versionId,
          now: ctx.now(),
        });
        const pdf = await renderPitchDeckPdf(deck, currency);
        return new Response(pdf, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": pdfContentDisposition(deck, versionName),
            "cache-control": "no-store",
          },
        });
      },
      { params: planParams, query: pitchDeckQuerySchema },
    );
}
