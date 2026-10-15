import {
  costItemContent,
  costItems,
  type Database,
  type DatabaseTransaction,
  economicsInputContent,
  economicsInputs,
} from "@moonx/db";
import { computeEconomics, rowHasValue } from "@moonx/domain";
import {
  type CostItem,
  type CostItemUpdate,
  costItemCreateSchema,
  costItemSchema,
  costItemUpdateSchema,
  costsSchema,
  type EconomicsInput,
  type EconomicsResult,
  economicsFieldSchema,
  economicsInputParamsSchema,
  economicsInputSaveSchema,
  economicsInputSchema,
  economicsSchema,
  economicsValueSchemas,
  errorBodySchema,
  moneySchema,
  rateSchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin } from "./access";
import { ApiError } from "./errors";
import { withHistory } from "./history";
import { checkKeyedLockVersion, createKeyedItem } from "./lock";
import { writeInScope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { answerViews, findQuestion, validationTemplate } from "./validation";
import {
  activeEvidenceCount,
  attachedEvidenceIds,
  classificationOf,
  loadCommentCounts,
  loadEvidence,
} from "./validation-items";
import {
  checkNumberClassification,
  checkRange,
  classifyNumber,
  deleteListRow,
  invalid,
  judgeAgainstStored,
  listRowLocator,
  lockListRow,
  nextSortOrder,
  sameContent,
  updateListRow,
  validationOperation,
  versionedView,
} from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type CostRow = typeof costItems.$inferSelect;
type InputRow = typeof economicsInputs.$inferSelect;

/** The question of 18 below the numbers (design-spec 6.4), answered through V3. */
const WORTH_KEY = "V.08.WORTH";

const noContent = z.undefined().meta({ description: "No content" });

const factNeedsEvidence = () =>
  new ApiError(
    "FACT_REQUIRES_EVIDENCE",
    "A Fact needs evidence: attach it through V4 with setFact",
  );

/** The cost rows of `validationId` not deleted, table by table, each in its order. */
const liveCostRows = (db: Executor, validationId: string) =>
  db
    .select()
    .from(costItems)
    .where(
      and(
        eq(costItems.validationId, validationId),
        isNull(costItems.deletedAt),
      ),
    )
    .orderBy(
      asc(costItems.category),
      asc(costItems.sortOrder),
      asc(costItems.createdAt),
      asc(costItems.id),
    );

const inputRows = (db: Executor, validationId: string) =>
  db
    .select()
    .from(economicsInputs)
    .where(eq(economicsInputs.validationId, validationId));

/** The calculation of design-spec 6.4 over the stored rows and numbers. */
const economicsOf = (
  rows: readonly CostRow[],
  inputs: readonly InputRow[],
): EconomicsResult =>
  computeEconomics({
    costRows: rows,
    inputs: Object.fromEntries(
      inputs.map((input) => [
        input.fieldKey,
        { value: input.value, fau: input.fau },
      ]),
    ),
  });

/** The rows `rows` of `validationId` as 17 shows them (SDD 5.7 CostItem). */
async function costItemViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly CostRow[],
): Promise<CostItem[]> {
  const refs = rows.map((row) => ({ type: "cost_item" as const, id: row.id }));
  const evidence = await loadEvidence(db, validationId, refs);
  const comments = await loadCommentCounts(db, refs);
  const users = await loadUserRefs(
    db,
    rows.flatMap((row) => (row.updatedById === null ? [] : [row.updatedById])),
    workspaceId,
  );
  return rows.map((row, index) => {
    const ref = refs[index] as (typeof refs)[number];
    const {
      evidenceIds: _,
      fau,
      confidence,
      ...content
    } = costItemContent(row, []);
    return {
      id: row.id,
      ...content,
      classification: classificationOf(
        { hasValue: rowHasValue(row), fau, confidence },
        evidence(ref),
      ),
      sortOrder: row.sortOrder,
      commentCount: comments(ref),
      ...versionedView(row, users),
    };
  });
}

/**
 * The seven numbers of 18 (SDD 5.7 EconomicsInput), in the order of
 * `economicsFieldSchema`: one not saved yet is empty at version 0.
 */
async function inputViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly InputRow[],
): Promise<EconomicsInput[]> {
  const byField = new Map(rows.map((row) => [row.fieldKey, row]));
  const refs = economicsFieldSchema.options.map((field) => ({
    type: "economics_input" as const,
    id: validationId,
    key: field,
  }));
  const evidence = await loadEvidence(db, validationId, refs);
  const comments = await loadCommentCounts(db, refs);
  const users = await loadUserRefs(
    db,
    rows.flatMap((row) => (row.updatedById === null ? [] : [row.updatedById])),
    workspaceId,
  );
  return refs.map((ref) => {
    const row = byField.get(ref.key);
    return {
      fieldKey: ref.key,
      value: row?.value ?? null,
      classification: classificationOf(
        {
          hasValue: row?.value != null,
          fau: row?.fau ?? null,
          confidence: row?.confidence ?? null,
        },
        evidence(ref),
      ),
      commentCount: comments(ref),
      ...(row === undefined
        ? { lockVersion: 0, updatedAt: null, updatedBy: null }
        : versionedView(row, users)),
    };
  });
}

/** The input mode's value the body sends but the row would not use. */
function valueOfUnusedMode(
  inputMode: CostRow["inputMode"],
  body: CostItemUpdate,
): ApiError | null {
  if (inputMode === "amount" && body.percent != null) {
    return invalid(
      "percent",
      "invalid_value",
      "The row is entered as an amount",
    );
  }
  if (inputMode === "percent_of_price" && body.amount != null) {
    return invalid(
      "amount",
      "invalid_value",
      "The row is entered as a percentage of the price",
    );
  }
  return null;
}

/**
 * The checks of a V14 body that do not depend on what the row holds now (SDD 5.7):
 * percentages on variable rows only (a row keeps its table), a value that the input
 * mode sent does not use, values within 6.0.8, and F/A/U as for every number.
 *
 * @throws {ApiError} PERCENT_ONLY_FOR_VARIABLE, VALIDATION_FAILED, OUT_OF_RANGE or
 * CONFIDENCE_REQUIRED
 */
function checkCostBody(row: CostRow, body: CostItemUpdate): void {
  if (
    row.category !== "variable" &&
    (body.inputMode === "percent_of_price" || body.percent != null)
  ) {
    throw new ApiError(
      "PERCENT_ONLY_FOR_VARIABLE",
      "Only a variable cost can be a percentage of the price",
    );
  }
  if (body.inputMode !== undefined) {
    const unused = valueOfUnusedMode(body.inputMode, body);
    if (unused !== null) throw unused;
  }
  if (body.amount != null) checkRange("amount", moneySchema, body.amount);
  if (body.percent != null) checkRange("percent", rateSchema, body.percent);
  checkNumberClassification(
    body.classification,
    body.amount != null ? "amount" : body.percent != null ? "percent" : null,
  );
}

/**
 * The cost row `row` after a V14 save of `body` that passed {@link checkCostBody}: what
 * is judged against the row as stored, its input mode and its value. Switching the
 * input mode clears the value of the mode left.
 *
 * @throws {ApiError} VALIDATION_FAILED
 */
function changedCostRow(row: CostRow, body: CostItemUpdate) {
  const inputMode = body.inputMode ?? row.inputMode;
  const unused = valueOfUnusedMode(inputMode, body);
  if (unused !== null) throw unused;
  const byAmount = inputMode === "amount";
  const sent = byAmount ? body.amount : body.percent;
  const kept =
    inputMode !== row.inputMode ? null : byAmount ? row.amount : row.percent;
  const value = sent === undefined ? kept : sent;
  const state = classifyNumber({
    current: row,
    sent: body.classification,
    valueSent: sent != null,
    hasValue: value !== null,
    valuePath: byAmount ? "amount" : "percent",
  });
  const saved = state.clearValue ? null : value;
  return {
    name: body.name ?? row.name,
    inputMode,
    amount: byAmount ? saved : null,
    percent: byAmount ? null : saved,
    isLumpSum: body.isLumpSum ?? row.isLumpSum,
    whyNeeded: body.whyNeeded === undefined ? row.whyNeeded : body.whyNeeded,
    canReduce: body.canReduce === undefined ? row.canReduce : body.canReduce,
    notes: body.notes === undefined ? row.notes : body.notes,
    fau: state.fau,
    confidence: state.confidence,
  };
}

const costItemLocator = listRowLocator(costItems, "costItemId");

/** What the cost routes need from the app. */
export interface CostRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const readErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;
const writeErrors = {
  ...readErrors,
  409: errorBodySchema,
  422: errorBodySchema,
} as const;

/** V12–V16 (SDD 5.7): the cost rows of 17 and the numbers of 18. */
export function costRoutes({ access, db, now }: CostRoutesOptions) {
  const costItemView = async (
    workspaceId: string,
    validationId: string,
    id: string,
  ) => {
    const rows = await db.select().from(costItems).where(eq(costItems.id, id));
    const [view] = await costItemViews(db, workspaceId, validationId, rows);
    if (view === undefined) throw new Error(`No cost row ${id}`);
    return view;
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/validations/:validationId/costs",
      async ({ scope, params }) => {
        const { validationId } = params;
        const rows = await liveCostRows(db, validationId);
        const inputs = await inputRows(db, validationId);
        return {
          items: await costItemViews(db, scope.workspaceId, validationId, rows),
          result: economicsOf(rows, inputs),
          economicsInputs: await inputViews(
            db,
            scope.workspaceId,
            validationId,
            inputs,
          ),
        };
      },
      {
        scoped: { to: "validationId", need: "read" },
        response: { 200: costsSchema, ...readErrors },
        detail: {
          summary: "V12 The costs (17)",
          description:
            "Rows by table (startup, monthly fixed, variable), each in its order. result holds the Totals and the break-even of 18; economicsInputs are all seven numbers, for calculating again while typing.",
        },
      },
    )
    .post(
      "/api/v1/validations/:validationId/cost-items",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const id = await writeInScope(db, scope, at, async (tx) => {
          const [row] = await tx
            .insert(costItems)
            .values({
              validationId,
              category: body.category,
              templateKey: null,
              name: body.name,
              sortOrder: await nextSortOrder(
                tx,
                costItems,
                validationId,
                eq(costItems.category, body.category),
              ),
              updatedById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (row === undefined) throw new Error("cost row insert failed");
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target: { type: "cost_item", id: row.id },
              action: "create",
              before: null,
              after: costItemContent(row, []),
            }),
          );
          return row.id;
        });
        return status(
          201,
          await costItemView(scope.workspaceId, validationId, id),
        );
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: costItemCreateSchema,
        parse: "json",
        response: { 201: costItemSchema, ...writeErrors },
        detail: {
          summary: "V13 Add a cost row (17)",
          description:
            "An Empty row at the end of its table; + Add row sends an empty name.",
        },
      },
    )
    .patch(
      "/api/v1/cost-items/:costItemId",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        const validationId = await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, costItems, params.costItemId);
          checkCostBody(row, body);
          const target = { type: "cost_item" as const, id: row.id };
          const evidenceIds = await attachedEvidenceIds(
            tx,
            row.validationId,
            target,
          );
          const before = costItemContent(row, evidenceIds);
          const values = await judgeAgainstStored(
            tx,
            {
              stored: { ...row, value: before },
              claim: body,
              workspaceId: scope.workspaceId,
              keyed: false,
            },
            () => changedCostRow(row, body),
          );
          await updateListRow(tx, {
            table: costItems,
            row,
            target,
            before,
            after: costItemContent({ ...row, ...values }, evidenceIds),
            values,
            claim: body,
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
            workspaceId: scope.workspaceId,
            beforeWrite: async () => {
              if (
                values.fau === "fact" &&
                row.fau !== "fact" &&
                (await activeEvidenceCount(tx, row.validationId, target)) === 0
              ) {
                throw factNeedsEvidence();
              }
            },
          });
          return row.validationId;
        });
        return costItemView(scope.workspaceId, validationId, params.costItemId);
      },
      {
        scoped: { to: costItemLocator, need: "writeUnarchived" },
        body: costItemUpdateSchema,
        parse: "json",
        response: { 200: costItemSchema, ...writeErrors },
        detail: {
          summary: "V14 Edit a cost row (17)",
          description:
            "Only the fields sent change, under the optimistic lock: a stale lockVersion is 409 CONFLICT before any 422 that depends on the stored row. A percentage of the price is for variable rows (PERCENT_ONLY_FOR_VARIABLE); a value of the input mode not in use is VALIDATION_FAILED; amounts and rates out of their rule are OUT_OF_RANGE. Unknown clears the value, and a value typed into an Unknown row makes it Unclassified; a value sent with Unknown is VALIDATION_FAILED. F/A/U otherwise as V3.",
        },
      },
    )
    .delete(
      "/api/v1/cost-items/:costItemId",
      async ({ scope, params, caller, request, set }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, costItems, params.costItemId);
          const target = { type: "cost_item" as const, id: row.id };
          await deleteListRow(tx, {
            table: costItems,
            id: row.id,
            target,
            before: costItemContent(
              row,
              await attachedEvidenceIds(tx, row.validationId, target),
            ),
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
          });
        });
        set.status = 204;
      },
      {
        scoped: { to: costItemLocator, need: "writeUnarchived" },
        response: { 204: noContent, ...readErrors, 409: errorBodySchema },
        detail: {
          summary: "V14 Delete a cost row (17)",
          description:
            "Deletes it logically, template rows included; the history can restore it.",
        },
      },
    )
    .get(
      "/api/v1/validations/:validationId/economics",
      async ({ scope, params }) => {
        const { validationId } = params;
        const rows = await liveCostRows(db, validationId);
        const inputs = await inputRows(db, validationId);
        const { sections } = await validationTemplate(db, validationId);
        const worthQuestion = findQuestion(sections, WORTH_KEY) ?? null;
        const [worth] = await answerViews(
          db,
          scope.workspaceId,
          validationId,
          sections,
          [WORTH_KEY],
        );
        if (worth === undefined) throw new Error("No worth answer");
        return {
          inputs: await inputViews(db, scope.workspaceId, validationId, inputs),
          worth,
          worthQuestion,
          result: economicsOf(rows, inputs),
          costItems: await costItemViews(
            db,
            scope.workspaceId,
            validationId,
            rows,
          ),
        };
      },
      {
        scoped: { to: "validationId", need: "read" },
        response: { 200: economicsSchema, ...readErrors },
        detail: {
          summary: "V15 Unit economics and scenarios (18)",
          description:
            "inputs are all seven numbers, unsaved ones empty at version 0. worth is V.08.WORTH (saved through V3), hidden when the pinned version lacks it; worthQuestion is its question of the pinned version, null then. result is calculated by packages/domain.",
        },
      },
    )
    .put(
      "/api/v1/validations/:validationId/economics/:fieldKey",
      async ({ scope, params, body, caller, request }) => {
        const { validationId, fieldKey } = params;
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          if (body.value !== null) {
            checkRange("value", economicsValueSchemas[fieldKey], body.value);
          }
          const [current] = await tx
            .select()
            .from(economicsInputs)
            .where(
              and(
                eq(economicsInputs.validationId, validationId),
                eq(economicsInputs.fieldKey, fieldKey),
              ),
            )
            .for("update");
          const state = classifyNumber({
            current: current ?? { fau: null, confidence: null },
            sent: body.classification,
            valueSent: body.value !== null,
            hasValue: body.value !== null,
            valuePath: "value",
          });
          const value = state.clearValue ? null : body.value;
          const target = {
            type: "economics_input" as const,
            id: validationId,
            key: fieldKey,
          };
          const evidenceIds = await attachedEvidenceIds(
            tx,
            validationId,
            target,
          );
          const before =
            current === undefined
              ? null
              : economicsInputContent(current, evidenceIds);
          const after = economicsInputContent(
            { value, fau: state.fau, confidence: state.confidence },
            evidenceIds,
          );
          const unchanged =
            current === undefined
              ? after.value === null && after.fau === null
              : sameContent(before, after);
          if (unchanged) return;
          if (current !== undefined) {
            await checkKeyedLockVersion(
              tx,
              {
                value: before,
                lockVersion: current.lockVersion,
                updatedAt: current.updatedAt,
                updatedById: current.updatedById,
              },
              body,
              scope.workspaceId,
            );
          }
          if (
            state.fau === "fact" &&
            current?.fau !== "fact" &&
            (await activeEvidenceCount(tx, validationId, target)) === 0
          ) {
            throw factNeedsEvidence();
          }
          const values = {
            value,
            fau: state.fau,
            confidence: state.confidence,
          };
          if (current === undefined) {
            await createKeyedItem(
              tx,
              async () =>
                (
                  await tx
                    .insert(economicsInputs)
                    .values({
                      validationId,
                      fieldKey,
                      ...values,
                      lockVersion: 1,
                      updatedById: caller.id,
                      createdAt: at,
                      updatedAt: at,
                    })
                    .onConflictDoNothing()
                    .returning({ id: economicsInputs.id })
                )[0],
              async () => {
                const [stored] = await tx
                  .select()
                  .from(economicsInputs)
                  .where(
                    and(
                      eq(economicsInputs.validationId, validationId),
                      eq(economicsInputs.fieldKey, fieldKey),
                    ),
                  );
                if (stored === undefined) throw new Error("No number row");
                return {
                  value: economicsInputContent(stored, evidenceIds),
                  lockVersion: stored.lockVersion,
                  updatedAt: stored.updatedAt,
                  updatedById: stored.updatedById,
                };
              },
              scope.workspaceId,
            );
          } else {
            await tx
              .update(economicsInputs)
              .set({
                ...values,
                lockVersion: current.lockVersion + 1,
                updatedAt: at,
                updatedById: caller.id,
              })
              .where(eq(economicsInputs.id, current.id));
          }
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target,
              action: current === undefined ? "create" : "update",
              before,
              after,
            }),
          );
        });
        const views = await inputViews(
          db,
          scope.workspaceId,
          validationId,
          await inputRows(db, validationId),
        );
        const view = views.find((input) => input.fieldKey === fieldKey);
        if (view === undefined) throw new Error(`No number ${fieldKey}`);
        return view;
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        params: economicsInputParamsSchema,
        body: economicsInputSaveSchema,
        parse: "json",
        response: { 200: economicsInputSchema, ...writeErrors },
        detail: {
          summary: "V16 Save a number of 18 and its F/A/U",
          description:
            "Creates the number at version 1 on its first save. A value out of the field's rule (design-spec 6.0.8) is OUT_OF_RANGE. Unknown clears the value; a value typed into an Unknown number makes it Unclassified; a value sent with Unknown is VALIDATION_FAILED. A request that changes neither value nor F/A/U writes nothing.",
        },
      },
    );
}
