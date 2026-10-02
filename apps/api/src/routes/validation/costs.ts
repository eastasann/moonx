import { isDeepStrictEqual } from "node:util";
import { schema } from "@moonx/db";
import {
  type CostItem,
  createCostItemBodySchema,
  type EconomicsField,
  type EconomicsInput,
  economicsFieldParamsSchema,
  putEconomicsInputBodySchema,
  updateCostItemBodySchema,
} from "@moonx/schemas";
import { and, eq, isNull, max } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { accessPlugin } from "../../access";
import type { AppContext } from "../../context";
import { ApiError } from "../../errors";
import { HISTORY_SECTION } from "../../history/sections";
import { costItemSnapshot, economicsSnapshot } from "../../history/snapshots";
import { withHistory } from "../../history/with-history";
import { sortCostItems, toCostItem, toEconomicsInput, toEconomicsInputs } from "../../lib/cost-dto";
import { planCostUpdate, planEconomicsUpdate } from "../../lib/cost-rules";
import type { Executor, Tx } from "../../lib/db";
import { historyActor } from "../../lib/dto";
import type { Scope } from "../../lib/scope";
import {
  computeValidationState,
  loadValidationData,
  type ValidationData,
} from "../../lib/validation-data";
import {
  activeEvidenceCount,
  activeEvidenceIds,
  checkItemLock,
  commentCountsById,
  commentCountsByKey,
  type DtoContext,
  lockValidation,
  toTableAnswer,
  touchActivity,
  userRefsOf,
} from "../../lib/validation-table-dto";
import {
  createItem,
  deleteItem,
  updateItem,
  type WriteEnv,
  type WriteSpec,
} from "../../lib/validation-table-write";
import { lostInsertRace } from "../../lib/validation-write";

const SCREEN_PARAMS = z.object({ validationId: z.uuid() });
const WORTH_KEY = "V.08.WORTH";

const costSpec: WriteSpec<typeof schema.costItems.$inferSelect> = {
  targetType: "cost_item",
  sectionKey: HISTORY_SECTION.costs,
  evidenceOf: (row) => ({ type: "cost_item", id: row.id }),
  snapshot: costItemSnapshot,
};

async function loadData(db: Executor, validationId: string): Promise<ValidationData> {
  const data = (await loadValidationData(db, [validationId])).get(validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  return data;
}

const validationOf = (scope: Scope) => scope.validationId as string;

/** V12-V16 (SDD 5.7): the cost tables and the economics inputs. */
export function costRoutes(ctx: AppContext) {
  const { db } = ctx;
  const envOf = (scope: Scope, request: Request, user: { id: string }): WriteEnv => ({
    db,
    now: ctx.now,
    scope,
    actor: historyActor(request, user),
  });

  /** Rows, user names and comment counts of the cost screen and the economics screen. */
  const screenContext = async (
    exec: Executor,
    scope: Scope,
    withWorth = false,
  ): Promise<DtoContext> => {
    const data = await loadData(exec, validationOf(scope));
    const worth = withWorth ? data.answers.filter((a) => a.questionKey === WORTH_KEY) : [];
    const [refs, byId, econKeys] = await Promise.all([
      userRefsOf(exec, scope.workspaceId, [...data.costItems, ...data.economicsInputs, ...worth]),
      commentCountsById(
        exec,
        scope.workspaceId,
        "cost_item",
        data.costItems.map((r) => r.id),
      ),
      commentCountsByKey(exec, scope.workspaceId, "economics_input", data.validationId, [
        "selling_price",
        "operating_days",
        "target_margin",
        "units_conservative",
        "units_expected",
        "units_strong",
        "units_capacity",
      ]),
    ]);
    const answerKeys = withWorth
      ? await commentCountsByKey(exec, scope.workspaceId, "validation_answer", data.validationId, [
          WORTH_KEY,
        ])
      : new Map<string, number>();
    return { data, refs, comments: new Map([...byId, ...econKeys, ...answerKeys]) };
  };

  const costItemDto = async (exec: Executor, scope: Scope, id: string): Promise<CostItem> => {
    const c = await screenContext(exec, scope);
    const row = c.data.costItems.find((r) => r.id === id);
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    return toCostItem(c, row);
  };

  const economicsDto = async (
    exec: Executor,
    scope: Scope,
    field: EconomicsField,
  ): Promise<EconomicsInput> => {
    const c = await screenContext(exec, scope);
    return toEconomicsInput(
      c,
      field,
      c.data.economicsInputs.find((r) => r.fieldKey === field),
    );
  };

  const readCostItem = (tx: Tx, scope: Scope, id: string) =>
    tx
      .select()
      .from(schema.costItems)
      .where(
        and(
          eq(schema.costItems.id, id),
          eq(schema.costItems.validationId, validationOf(scope)),
          isNull(schema.costItems.deletedAt),
        ),
      )
      .for("update")
      .then((rows) => rows[0]);

  return new Elysia({ name: "moonx-validation-costs" })
    .use(accessPlugin(ctx))
    .get(
      "/validations/:validationId/costs",
      async ({ scope }) => {
        const c = await screenContext(db, scope);
        const state = computeValidationState(c.data, {
          workspaceId: scope.workspaceId,
          ideaId: scope.ideaId as string,
        });
        return {
          items: sortCostItems(c.data.costItems).map((row) => toCostItem(c, row)),
          result: state.economics,
          economicsInputs: toEconomicsInputs(c),
        };
      },
      { params: SCREEN_PARAMS, scoped: { to: { validationId: "validationId" }, need: "member" } },
    )
    .post(
      "/validations/:validationId/cost-items",
      async ({ body, user, request, set, scope }) => {
        const row = await createItem(
          envOf(scope, request, user),
          costSpec,
          async (tx, id, stamp) => {
            const [top] = await tx
              .select({ top: max(schema.costItems.sortOrder) })
              .from(schema.costItems)
              .where(
                and(
                  eq(schema.costItems.validationId, validationOf(scope)),
                  eq(schema.costItems.category, body.category),
                ),
              );
            const [inserted] = await tx
              .insert(schema.costItems)
              .values({
                id,
                validationId: validationOf(scope),
                category: body.category,
                name: body.name,
                templateKey: null,
                sortOrder: (top?.top ?? -1) + 1,
                lockVersion: stamp.lockVersion,
                updatedById: stamp.updatedById,
                updatedAt: stamp.now,
              })
              .returning();
            return inserted as NonNullable<typeof inserted>;
          },
        );
        set.status = 201;
        return costItemDto(db, scope, row.id);
      },
      {
        params: SCREEN_PARAMS,
        body: createCostItemBodySchema,
        scoped: { to: { validationId: "validationId" }, need: "writable" },
      },
    )
    .patch(
      "/cost-items/:costItemId",
      async ({ params, body, user, request, scope }) => {
        const { lockVersion, force, ...fields } = body;
        await updateItem(envOf(scope, request, user), costSpec, {
          lock: { lockVersion, force },
          readRow: (tx) => readCostItem(tx, scope, params.costItemId),
          loadCurrent: (tx) => costItemDto(tx, scope, params.costItemId),
          apply: async (tx, row, stamp) => {
            const evidence = await activeEvidenceCount(tx, {
              type: "cost_item",
              id: row.id,
              key: null,
            });
            const patch = planCostUpdate(row, fields, evidence);
            const [updated] = await tx
              .update(schema.costItems)
              .set({
                ...patch,
                lockVersion: stamp.lockVersion,
                updatedById: stamp.updatedById,
                updatedAt: stamp.now,
              })
              .where(eq(schema.costItems.id, row.id))
              .returning();
            return updated as NonNullable<typeof updated>;
          },
        });
        return costItemDto(db, scope, params.costItemId);
      },
      {
        params: z.object({ costItemId: z.uuid() }),
        body: updateCostItemBodySchema,
        scoped: { to: { costItemId: "costItemId" }, need: "writable" },
      },
    )
    .delete(
      "/cost-items/:costItemId",
      async ({ params, user, request, set, scope }) => {
        await deleteItem(envOf(scope, request, user), costSpec, {
          readRow: (tx) => readCostItem(tx, scope, params.costItemId),
          markDeleted: async (tx, row, stamp) => {
            await tx
              .update(schema.costItems)
              .set({
                deletedAt: stamp.now,
                lockVersion: stamp.lockVersion,
                updatedById: stamp.updatedById,
                updatedAt: stamp.now,
              })
              .where(eq(schema.costItems.id, row.id));
          },
        });
        set.status = 204;
      },
      {
        params: z.object({ costItemId: z.uuid() }),
        scoped: { to: { costItemId: "costItemId" }, need: "writable" },
      },
    )
    .get(
      "/validations/:validationId/economics",
      async ({ scope }) => {
        const c = await screenContext(db, scope, true);
        const state = computeValidationState(c.data, {
          workspaceId: scope.workspaceId,
          ideaId: scope.ideaId as string,
        });
        return {
          inputs: toEconomicsInputs(c),
          worth: toTableAnswer(
            c,
            WORTH_KEY,
            c.data.answers.find((a) => a.questionKey === WORTH_KEY),
          ),
          result: state.economics,
          costItems: sortCostItems(c.data.costItems).map((row) => toCostItem(c, row)),
        };
      },
      { params: SCREEN_PARAMS, scoped: { to: { validationId: "validationId" }, need: "member" } },
    )
    .put(
      "/validations/:validationId/economics/:fieldKey",
      async ({ params, body, user, request, scope }) => {
        const field = params.fieldKey;
        const vid = validationOf(scope);
        const now = ctx.now();
        const actor = historyActor(request, user);
        await db.transaction(async (tx) => {
          await lockValidation(tx, vid);
          const [row] = await tx
            .select()
            .from(schema.economicsInputs)
            .where(
              and(
                eq(schema.economicsInputs.validationId, vid),
                eq(schema.economicsInputs.fieldKey, field),
              ),
            )
            .for("update");
          const lockVersion = await checkItemLock(tx, {
            workspaceId: scope.workspaceId,
            row: row ?? null,
            sent: body,
            loadCurrent: () => economicsDto(tx, scope, field),
          });
          const target = { type: "economics_input" as const, id: vid, key: field };
          const patch = planEconomicsUpdate(
            field,
            row ?? null,
            body,
            await activeEvidenceCount(tx, target),
          );
          const evidence = await activeEvidenceIds(tx, target);
          const before = economicsSnapshot(row ?? null, evidence);
          if (isDeepStrictEqual(before, economicsSnapshot(patch, evidence))) return;
          await withHistory(
            tx,
            {
              container: { type: "validation", id: vid },
              workspaceId: scope.workspaceId,
              sectionKey: HISTORY_SECTION.economics,
              target: { type: "economics_input", id: vid, key: field },
              actor,
            },
            async () => {
              const stamp = { lockVersion, updatedById: user.id, updatedAt: now };
              // Evidence (V4) creates the same row without taking the validation lock, so the insert
              // can lose a race that the read above could not see.
              const saved = row
                ? (
                    await tx
                      .update(schema.economicsInputs)
                      .set({ ...patch, ...stamp })
                      .where(eq(schema.economicsInputs.id, row.id))
                      .returning()
                  )[0]
                : (
                    await tx
                      .insert(schema.economicsInputs)
                      .values({ validationId: vid, fieldKey: field, ...patch, ...stamp })
                      .onConflictDoNothing()
                      .returning()
                  )[0];
              if (!saved) {
                const [current] = await tx
                  .select()
                  .from(schema.economicsInputs)
                  .where(
                    and(
                      eq(schema.economicsInputs.validationId, vid),
                      eq(schema.economicsInputs.fieldKey, field),
                    ),
                  );
                await lostInsertRace(tx, {
                  workspaceId: scope.workspaceId,
                  row: current ?? null,
                  currentValue: () => economicsDto(tx, scope, field),
                });
              }
              return {
                result: undefined,
                before: row ? before : null,
                after: economicsSnapshot(saved as NonNullable<typeof saved>, evidence),
              };
            },
          );
          await touchActivity(tx, scope, now);
        });
        return economicsDto(db, scope, field);
      },
      {
        params: economicsFieldParamsSchema,
        body: putEconomicsInputBodySchema,
        scoped: { to: { validationId: "validationId" }, need: "writable" },
      },
    );
}
