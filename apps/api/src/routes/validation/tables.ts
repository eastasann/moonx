import { schema } from "@moonx/db";
import {
  type Assumption,
  type Competitor,
  createAssumptionBodySchema,
  createCompetitorBodySchema,
  createRiskBodySchema,
  orderListSchema,
  type Risk,
  reorderBodySchema,
  updateAssumptionBodySchema,
  updateCompetitorBodySchema,
  updateRiskBodySchema,
} from "@moonx/schemas";
import { and, eq, isNotNull, isNull, max } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../../context";
import { ApiError, validationFailed } from "../../errors";
import { HISTORY_SECTION } from "../../history/sections";
import { assumptionSnapshot, competitorSnapshot, riskSnapshot } from "../../history/snapshots";
import { reorderCostItems } from "../../lib/cost-order";
import type { Executor, Tx } from "../../lib/db";
import { historyActor } from "../../lib/dto";
import { requireWritable, resolveScope, type Scope } from "../../lib/scope";
import { loadValidationData, type ValidationData } from "../../lib/validation-data";
import {
  commentCountsById,
  commentCountsByKey,
  type DtoContext,
  lockValidation,
  orderRisks,
  toAssumption,
  toCompetitor,
  toRisk,
  toTableAnswer,
  touchActivity,
  userRefsOf,
} from "../../lib/validation-table-dto";
import { reorderListRows } from "../../lib/validation-table-order";
import {
  createItem,
  deleteItem,
  updateItem,
  type WriteEnv,
  type WriteSpec,
} from "../../lib/validation-table-write";
import { authPlugin } from "../../plugins";

const PATTERN_KEYS = ["V.04.SURVIVOR_PATTERNS", "V.04.FAILURE_PATTERNS"] as const;
const SCREEN_PARAMS = z.object({ validationId: z.uuid() });

async function loadData(db: Executor, validationId: string): Promise<ValidationData> {
  const data = (await loadValidationData(db, [validationId])).get(validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  return data;
}

const validationOf = (scope: Scope) => scope.validationId as string;

const competitorSpec: WriteSpec<typeof schema.competitors.$inferSelect> = {
  targetType: "competitor",
  sectionKey: HISTORY_SECTION.competitors,
  evidenceOf: (row) => ({ type: "competitor", id: row.id }),
  snapshot: competitorSnapshot,
};
const assumptionSpec: WriteSpec<typeof schema.assumptions.$inferSelect> = {
  targetType: "assumption",
  sectionKey: HISTORY_SECTION.assumptionsRisks,
  evidenceOf: (row) => ({ type: "assumption", id: row.id }),
  snapshot: assumptionSnapshot,
};
const riskSpec: WriteSpec<typeof schema.risks.$inferSelect> = {
  targetType: "risk",
  sectionKey: HISTORY_SECTION.assumptionsRisks,
  evidenceOf: null,
  snapshot: (row) => riskSnapshot(row),
};

/** V8-V11 and V17 (SDD 5.7): the competitor, assumption and risk lists and their order. */
export function validationTableRoutes(ctx: AppContext) {
  const { db } = ctx;
  const envOf = (scope: Scope, request: Request, user: { id: string }): WriteEnv => ({
    db,
    now: ctx.now,
    scope,
    actor: historyActor(request, user),
  });

  const competitorContext = async (
    exec: Executor,
    scope: Scope,
    withPatterns = false,
  ): Promise<DtoContext> => {
    const data = await loadData(exec, validationOf(scope));
    const patternRows = withPatterns
      ? data.answers.filter((a) => (PATTERN_KEYS as readonly string[]).includes(a.questionKey))
      : [];
    const [refs, byId, byKey] = await Promise.all([
      userRefsOf(exec, scope.workspaceId, [...data.competitors, ...patternRows]),
      commentCountsById(
        exec,
        scope.workspaceId,
        "competitor",
        data.competitors.map((c) => c.id),
      ),
      withPatterns
        ? commentCountsByKey(exec, scope.workspaceId, "validation_answer", data.validationId, [
            ...PATTERN_KEYS,
          ])
        : new Map<string, number>(),
    ]);
    return { data, refs, comments: new Map([...byId, ...byKey]) };
  };

  const competitorDto = async (exec: Executor, scope: Scope, id: string): Promise<Competitor> => {
    const c = await competitorContext(exec, scope);
    const row = c.data.competitors.find((r) => r.id === id);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    return toCompetitor(c, row);
  };

  const rowContext = async (
    exec: Executor,
    scope: Scope,
    type: "assumption" | "risk",
  ): Promise<DtoContext> => {
    const data = await loadData(exec, validationOf(scope));
    const rows = type === "assumption" ? data.assumptions : data.risks;
    const [refs, comments] = await Promise.all([
      userRefsOf(exec, scope.workspaceId, rows),
      commentCountsById(
        exec,
        scope.workspaceId,
        type,
        rows.map((r) => r.id),
      ),
    ]);
    return { data, refs, comments };
  };

  const assumptionDto = async (exec: Executor, scope: Scope, id: string): Promise<Assumption> => {
    const c = await rowContext(exec, scope, "assumption");
    const row = c.data.assumptions.find((r) => r.id === id);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    return toAssumption(c, row);
  };

  const riskDto = async (exec: Executor, scope: Scope, id: string): Promise<Risk> => {
    const c = await rowContext(exec, scope, "risk");
    const row = c.data.risks.find((r) => r.id === id);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    return toRisk(c, row);
  };

  const readCompetitor = (tx: Tx, scope: Scope, id: string) =>
    tx
      .select()
      .from(schema.competitors)
      .where(
        and(
          eq(schema.competitors.id, id),
          eq(schema.competitors.validationId, validationOf(scope)),
          isNull(schema.competitors.deletedAt),
        ),
      )
      .for("update")
      .then((rows) => rows[0]);
  const readAssumption = (tx: Tx, scope: Scope, id: string) =>
    tx
      .select()
      .from(schema.assumptions)
      .where(
        and(
          eq(schema.assumptions.id, id),
          eq(schema.assumptions.validationId, validationOf(scope)),
          isNull(schema.assumptions.deletedAt),
        ),
      )
      .for("update")
      .then((rows) => rows[0]);
  const readRisk = (tx: Tx, scope: Scope, id: string) =>
    tx
      .select()
      .from(schema.risks)
      .where(
        and(
          eq(schema.risks.id, id),
          eq(schema.risks.validationId, validationOf(scope)),
          isNull(schema.risks.deletedAt),
        ),
      )
      .for("update")
      .then((rows) => rows[0]);

  const nextSortOrder = async (tx: Tx, table: "competitors" | "assumptions", vid: string) => {
    const t = schema[table];
    const [row] = await tx
      .select({ top: max(t.sortOrder) })
      .from(t)
      .where(eq(t.validationId, vid));
    return (row?.top ?? -1) + 1;
  };

  /** New risks join a manual order at its end and stay automatic otherwise (design-spec 6.10). */
  const nextRiskSortOrder = async (tx: Tx, vid: string) => {
    const [row] = await tx
      .select({ top: max(schema.risks.sortOrder) })
      .from(schema.risks)
      .where(and(eq(schema.risks.validationId, vid), isNotNull(schema.risks.sortOrder)));
    return row?.top == null ? null : row.top + 1;
  };

  const doneStamp = (stamp: { lockVersion: number; updatedById: string; now: Date }) => ({
    lockVersion: stamp.lockVersion,
    updatedById: stamp.updatedById,
    updatedAt: stamp.now,
  });

  return new Elysia({ name: "moonx-validation-tables" })
    .use(authPlugin(ctx))
    .get(
      "/validations/:validationId/competitors",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        const c = await competitorContext(db, scope, true);
        const answerOf = (key: string) =>
          toTableAnswer(
            c,
            key,
            c.data.answers.find((a) => a.questionKey === key),
          );
        return {
          items: c.data.competitors.map((row) => toCompetitor(c, row)),
          patterns: PATTERN_KEYS.map(answerOf),
          guidance: { min: c.data.rules.competitors.min, max: c.data.rules.competitors.max },
        };
      },
      { params: SCREEN_PARAMS },
    )
    .post(
      "/validations/:validationId/competitors",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        const row = await createItem(
          envOf(scope, request, user),
          competitorSpec,
          async (tx, id, stamp) => {
            const sortOrder = await nextSortOrder(tx, "competitors", validationOf(scope));
            const [inserted] = await tx
              .insert(schema.competitors)
              .values({
                ...body,
                id,
                validationId: validationOf(scope),
                sortOrder,
                ...doneStamp(stamp),
              })
              .returning();
            return inserted as NonNullable<typeof inserted>;
          },
        );
        set.status = 201;
        return competitorDto(db, scope, row.id);
      },
      { params: SCREEN_PARAMS, body: createCompetitorBodySchema },
    )
    .patch(
      "/competitors/:competitorId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { competitorId: params.competitorId });
        requireWritable(scope);
        const { lockVersion, force, ...fields } = body;
        await updateItem(envOf(scope, request, user), competitorSpec, {
          lock: { lockVersion, force },
          readRow: (tx) => readCompetitor(tx, scope, params.competitorId),
          loadCurrent: (tx) => competitorDto(tx, scope, params.competitorId),
          apply: async (tx, row, stamp) => {
            const [updated] = await tx
              .update(schema.competitors)
              .set({ ...fields, ...doneStamp(stamp) })
              .where(eq(schema.competitors.id, row.id))
              .returning();
            return updated as NonNullable<typeof updated>;
          },
        });
        return competitorDto(db, scope, params.competitorId);
      },
      { params: z.object({ competitorId: z.uuid() }), body: updateCompetitorBodySchema },
    )
    .delete(
      "/competitors/:competitorId",
      async ({ params, user, request, set }) => {
        const scope = await resolveScope(db, user, { competitorId: params.competitorId });
        requireWritable(scope);
        await deleteItem(envOf(scope, request, user), competitorSpec, {
          readRow: (tx) => readCompetitor(tx, scope, params.competitorId),
          markDeleted: async (tx, row, stamp) => {
            await tx
              .update(schema.competitors)
              .set({ deletedAt: stamp.now, ...doneStamp(stamp) })
              .where(eq(schema.competitors.id, row.id));
          },
        });
        set.status = 204;
      },
      { params: z.object({ competitorId: z.uuid() }) },
    )
    .get(
      "/validations/:validationId/assumptions",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        const c = await rowContext(db, scope, "assumption");
        return { items: c.data.assumptions.map((row) => toAssumption(c, row)) };
      },
      { params: SCREEN_PARAMS },
    )
    .post(
      "/validations/:validationId/assumptions",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        const row = await createItem(
          envOf(scope, request, user),
          assumptionSpec,
          async (tx, id, stamp) => {
            const sortOrder = await nextSortOrder(tx, "assumptions", validationOf(scope));
            const [inserted] = await tx
              .insert(schema.assumptions)
              .values({
                ...body,
                id,
                validationId: validationOf(scope),
                sortOrder,
                ...doneStamp(stamp),
              })
              .returning();
            return inserted as NonNullable<typeof inserted>;
          },
        );
        set.status = 201;
        return assumptionDto(db, scope, row.id);
      },
      { params: SCREEN_PARAMS, body: createAssumptionBodySchema },
    )
    .patch(
      "/assumptions/:assumptionId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { assumptionId: params.assumptionId });
        requireWritable(scope);
        const { lockVersion, force, ...fields } = body;
        await updateItem(envOf(scope, request, user), assumptionSpec, {
          lock: { lockVersion, force },
          readRow: (tx) => readAssumption(tx, scope, params.assumptionId),
          loadCurrent: (tx) => assumptionDto(tx, scope, params.assumptionId),
          apply: async (tx, row, stamp) => {
            const [updated] = await tx
              .update(schema.assumptions)
              .set({ ...fields, ...doneStamp(stamp) })
              .where(eq(schema.assumptions.id, row.id))
              .returning();
            return updated as NonNullable<typeof updated>;
          },
        });
        return assumptionDto(db, scope, params.assumptionId);
      },
      { params: z.object({ assumptionId: z.uuid() }), body: updateAssumptionBodySchema },
    )
    .delete(
      "/assumptions/:assumptionId",
      async ({ params, user, request, set }) => {
        const scope = await resolveScope(db, user, { assumptionId: params.assumptionId });
        requireWritable(scope);
        await deleteItem(envOf(scope, request, user), assumptionSpec, {
          readRow: (tx) => readAssumption(tx, scope, params.assumptionId),
          markDeleted: async (tx, row, stamp) => {
            await tx
              .update(schema.assumptions)
              .set({ deletedAt: stamp.now, ...doneStamp(stamp) })
              .where(eq(schema.assumptions.id, row.id));
          },
        });
        set.status = 204;
      },
      { params: z.object({ assumptionId: z.uuid() }) },
    )
    .get(
      "/validations/:validationId/risks",
      async ({ params, user }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        const c = await rowContext(db, scope, "risk");
        return { items: orderRisks(c.data.risks).map((row) => toRisk(c, row)) };
      },
      { params: SCREEN_PARAMS },
    )
    .post(
      "/validations/:validationId/risks",
      async ({ params, body, user, request, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        const row = await createItem(
          envOf(scope, request, user),
          riskSpec,
          async (tx, id, stamp) => {
            const sortOrder = await nextRiskSortOrder(tx, validationOf(scope));
            const [inserted] = await tx
              .insert(schema.risks)
              .values({
                ...body,
                id,
                validationId: validationOf(scope),
                sortOrder,
                ...doneStamp(stamp),
              })
              .returning();
            return inserted as NonNullable<typeof inserted>;
          },
        );
        set.status = 201;
        return riskDto(db, scope, row.id);
      },
      { params: SCREEN_PARAMS, body: createRiskBodySchema },
    )
    .patch(
      "/risks/:riskId",
      async ({ params, body, user, request }) => {
        const scope = await resolveScope(db, user, { riskId: params.riskId });
        requireWritable(scope);
        const { lockVersion, force, ...fields } = body;
        await updateItem(envOf(scope, request, user), riskSpec, {
          lock: { lockVersion, force },
          readRow: (tx) => readRisk(tx, scope, params.riskId),
          loadCurrent: (tx) => riskDto(tx, scope, params.riskId),
          apply: async (tx, row, stamp) => {
            const [updated] = await tx
              .update(schema.risks)
              .set({ ...fields, ...doneStamp(stamp) })
              .where(eq(schema.risks.id, row.id))
              .returning();
            return updated as NonNullable<typeof updated>;
          },
        });
        return riskDto(db, scope, params.riskId);
      },
      { params: z.object({ riskId: z.uuid() }), body: updateRiskBodySchema },
    )
    .delete(
      "/risks/:riskId",
      async ({ params, user, request, set }) => {
        const scope = await resolveScope(db, user, { riskId: params.riskId });
        requireWritable(scope);
        await deleteItem(envOf(scope, request, user), riskSpec, {
          readRow: (tx) => readRisk(tx, scope, params.riskId),
          markDeleted: async (tx, row, stamp) => {
            await tx
              .update(schema.risks)
              .set({ deletedAt: stamp.now, ...doneStamp(stamp) })
              .where(eq(schema.risks.id, row.id));
          },
        });
        set.status = 204;
      },
      { params: z.object({ riskId: z.uuid() }) },
    )
    .put(
      "/validations/:validationId/:list/order",
      async ({ params, body, user, set }) => {
        const scope = await resolveScope(db, user, { validationId: params.validationId });
        requireWritable(scope);
        if (params.list === "cost-items" && !body.category) {
          throw validationFailed([
            { path: "category", code: "invalid_value", message: "Required for cost-items" },
          ]);
        }
        await db.transaction(async (tx) => {
          await lockValidation(tx, validationOf(scope));
          if (params.list === "cost-items") {
            await reorderCostItems(
              tx,
              validationOf(scope),
              body.category as NonNullable<typeof body.category>,
              body.ids,
            );
          } else {
            await reorderListRows(tx, validationOf(scope), params.list, body.ids);
          }
          await touchActivity(tx, scope, ctx.now());
        });
        set.status = 204;
      },
      {
        params: z.object({ validationId: z.uuid(), list: orderListSchema }),
        body: reorderBodySchema,
      },
    );
}
