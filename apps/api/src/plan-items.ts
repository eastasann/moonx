import { isDeepStrictEqual } from "node:util";
import {
  type Database,
  type DatabaseTransaction,
  planAnswerContent,
  planAnswers,
} from "@moonx/db";
import {
  COST_ROW_METRIC_PREFIX,
  keyMetricOf,
  type PlanAnswerContent,
  type PlanQuestion,
} from "@moonx/domain";
import {
  countChars,
  errorBodySchema,
  type KeyMetrics,
  moneySchema,
  type PlanAnswerSave,
  type PlanItem,
  type PlanTableRow,
  planAnswerParamsSchema,
  planAnswerSaveSchema,
  planAnswerSchema,
  planItemParamsSchema,
  planItemSchema,
  planVersionQuerySchema,
  rateSchema,
  TEXT_LIMITS,
  tableNumberCellSchema,
  tableTextCellSchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import type { z } from "zod";
import type { AccessPlugin } from "./access";
import { dueWindow } from "./due";
import { requestContext } from "./entry";
import { ApiError, standardIssueDetails } from "./errors";
import { withHistory } from "./history";
import { findIdea, loadIdeaContexts } from "./idea-views";
import { checkKeyedLockVersion, createKeyedItem } from "./lock";
import { loadCostRowNames, loadPlanReferences } from "./plan-references";
import {
  executionItemViews,
  executionTypesOf,
  findPlanQuestion,
  findVersion,
  loadExecutionRows,
  loadPlanAnswers,
  loadPlanTemplate,
  type PlanAnswerRow,
  planAnswerView,
  planContentTime,
  requirePlan,
  snapshotAnswerRow,
  snapshotExecutionRow,
  storedAnswerRow,
  storedExecutionRow,
  templateQuestionOf,
} from "./plan-views";
import { type Scope, writeInScope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { loadCommentCounts } from "./validation-items";
import { invalid, judgeAgainstStored } from "./validation-writes";

type Executor = Database | DatabaseTransaction;

/** The sub-item types that take `text` through P5; tables take `rows`. */
const TEXT_TYPES = new Set(["long_text", "short_text", "choice"]);

/** Whether a sub-item takes an answer through P5. */
const takesAnswer = (question: PlanQuestion) =>
  TEXT_TYPES.has(question.answerType) || question.answerType === "table";

/** The prefix of the key metrics that are scenario columns (design-spec 6.4). */
const SCENARIO_PREFIX = "scenario:";

/** P4: one plan item (SDD 5.9 PlanItem), of a saved version when `versionId` names one. */
async function loadPlanItem(
  db: Executor,
  options: {
    scope: Scope;
    itemNo: number;
    versionId: string | undefined;
    today: string;
  },
): Promise<PlanItem> {
  const { scope, itemNo } = options;
  const planId = scope.planId as string;
  const plan = await requirePlan(db, planId);
  const sections = await loadPlanTemplate(db, plan.templateVersionId);
  const section = sections.find((candidate) => candidate.itemNo === itemNo);
  if (section === undefined) {
    throw new ApiError("NOT_FOUND", "The plan's template has no such item");
  }
  const version =
    options.versionId === undefined
      ? null
      : await findVersion(db, planId, options.versionId);
  const idea = await findIdea(db, plan.ideaId);
  if (idea === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [idea], scope.role);
  if (context === undefined) throw new Error(`No context for ${idea.id}`);

  const stored = await loadPlanAnswers(db, planId);
  const answers = new Map(
    version === null
      ? [...stored].map(([key, row]) => [key, storedAnswerRow(row)] as const)
      : version.snapshot.answers.map(
          (answer) => [answer.questionKey, snapshotAnswerRow(answer)] as const,
        ),
  );
  const prompts = section.questions;
  const answered = prompts.filter(takesAnswer);
  const users = await loadUserRefs(
    db,
    [...answers.values()].flatMap((row) =>
      row.updatedById === null ? [] : [row.updatedById],
    ),
    scope.workspaceId,
  );
  const comments = await loadCommentCounts(
    db,
    answered.map((question) => ({
      type: "plan_answer",
      id: planId,
      key: question.key,
    })),
  );

  const metricKeys = prompts.flatMap((question) =>
    question.options?.kind === "linked_metric"
      ? question.options.metricKeys
      : [],
  );
  const shownMetrics: KeyMetrics =
    version?.snapshot.keyMetrics ?? context.evaluation.keyMetrics;
  const shownScenarios =
    version?.snapshot.scenarios ?? context.evaluation.economics.scenarios;
  const scenarioKeys = new Set(
    metricKeys
      .filter((key) => key.startsWith(SCENARIO_PREFIX))
      .map((key) => key.slice(SCENARIO_PREFIX.length)),
  );

  const types = executionTypesOf(prompts);
  const executionRows =
    version === null
      ? (await loadExecutionRows(db, planId))
          .filter((row) => row.deletedAt === null)
          .map(storedExecutionRow)
      : version.snapshot.execution.map(snapshotExecutionRow);

  return {
    itemNo,
    title: section.title,
    guidance: section.guidance,
    readOnly:
      version !== null ||
      scope.planArchived ||
      scope.ideaArchived ||
      scope.role === "viewer",
    prompts: prompts.map(templateQuestionOf),
    answers: answered.map((question) =>
      planAnswerView(planId, question.key, answers.get(question.key), {
        users,
        comments,
      }),
    ),
    metrics: Object.fromEntries(
      metricKeys
        .filter((key) => !key.startsWith(SCENARIO_PREFIX))
        // A cost row the validation does not have (had not, for a version) is left out,
        // as in the key metrics: 21 says "Not in validation" (design-spec 6.0.7).
        .filter(
          (key) =>
            !key.startsWith(COST_ROW_METRIC_PREFIX) ||
            shownMetrics[key] !== undefined,
        )
        .map((key) => [key, keyMetricOf(shownMetrics, key)]),
    ),
    costRowNames: Object.fromEntries(
      await loadCostRowNames(
        db,
        context.loaded.validationId,
        metricKeys.flatMap((key) =>
          key.startsWith(COST_ROW_METRIC_PREFIX)
            ? [key.slice(COST_ROW_METRIC_PREFIX.length)]
            : [],
        ),
      ),
    ),
    scenarios: shownScenarios.filter((column) => scenarioKeys.has(column.key)),
    execution: await executionItemViews(
      db,
      scope.workspaceId,
      executionRows.filter((row) => types.has(row.type)),
      options.today,
    ),
    references: await loadPlanReferences(db, prompts, {
      workspaceId: scope.workspaceId,
      ideaId: plan.ideaId,
      planId,
      role: scope.role,
      context,
      answers,
    }),
  };
}

/** The rule a value of a table column of `type` follows (design-spec 6.0.8 for 21). */
const CELL_RULES: Record<
  "number" | "percent" | "money",
  z.ZodType<number, number>
> = {
  number: tableNumberCellSchema,
  percent: rateSchema,
  money: moneySchema,
};

/**
 * Checks and normalizes the rows a P5 save sends for a table sub-item. Each row gets
 * the template's columns in order, a column it leaves out as null, then the columns a
 * template migration removed that it sends back (SDD 5.9 P5).
 *
 * `judge` holds the checks against what is stored, which run after the lock version is
 * judged: a removed column takes only null or a value the stored rows hold, and a text
 * longer than its limit passes only when it is a value the column holds already (the
 * draft copies texts whole, design-spec 6.0.8). Each stored value can be matched as
 * many times as the stored rows hold it, so such a cell can be kept but not copied into
 * more rows. Matching by value, not by position, lets rows be added, removed and
 * reordered around it.
 *
 * @throws {ApiError} VALIDATION_FAILED for what the request settles alone
 */
function checkRows(
  question: PlanQuestion,
  sent: readonly PlanTableRow[],
  stored: readonly PlanTableRow[],
): { rows: PlanTableRow[]; judge: () => void } {
  if (question.options?.kind !== "table") {
    throw new Error(`${question.key} is a table without columns`);
  }
  const { columns } = question.options;
  const keys = new Set(columns.map((column) => column.key));
  // How many times the stored rows hold each value, by column.
  const held = new Map<string, Map<unknown, number>>();
  for (const row of stored) {
    for (const [key, value] of Object.entries(row)) {
      const values = held.get(key) ?? new Map<unknown, number>();
      values.set(value, (values.get(value) ?? 0) + 1);
      held.set(key, values);
    }
  }
  /** Matches one stored `value` of `key`, which no other cell may match again. */
  const take = (key: string, value: unknown) => {
    const values = held.get(key);
    const count = values?.get(value) ?? 0;
    if (values === undefined || count === 0) return false;
    values.set(value, count - 1);
    return true;
  };
  const deferred: (() => void)[] = [];
  const rows = sent.map((row, index) => {
    const at = (key: string) => `rows.${index}.${key}`;
    const next: PlanTableRow = {};
    for (const column of columns) {
      const value = row[column.key] ?? null;
      if (value === null) {
        next[column.key] = null;
        continue;
      }
      if (column.type === "text") {
        if (typeof value !== "string") {
          throw invalid(at(column.key), "invalid_type", "Must be a text");
        }
        const parsed = tableTextCellSchema.safeParse(value);
        if (!parsed.success) {
          const [issue] = standardIssueDetails(parsed.error.issues);
          if (issue?.code === "too_big") {
            deferred.push(() => {
              if (!take(column.key, value)) {
                throw invalid(at(column.key), issue.code, issue.message);
              }
            });
          } else {
            throw invalid(
              at(column.key),
              issue?.code ?? "custom",
              issue?.message ?? "Not a valid text",
            );
          }
        }
        next[column.key] = parsed.success ? parsed.data : value;
        continue;
      }
      if (typeof value !== "number") {
        throw invalid(at(column.key), "invalid_type", "Must be a number");
      }
      const parsed = CELL_RULES[column.type].safeParse(value);
      if (!parsed.success) {
        const [issue] = standardIssueDetails(parsed.error.issues);
        throw invalid(
          at(column.key),
          issue?.code ?? "custom",
          issue?.message ?? "Out of range",
        );
      }
      next[column.key] = value;
    }
    for (const [key, value] of Object.entries(row)) {
      if (keys.has(key)) continue;
      deferred.push(() => {
        if (!held.has(key)) {
          throw invalid(
            at(key),
            "unrecognized_keys",
            "Not a column of the table",
          );
        }
        if (value !== null && !take(key, value)) {
          throw invalid(
            at(key),
            "invalid_value",
            "A removed column keeps only its saved values",
          );
        }
      });
      next[key] = value;
    }
    return next;
  });
  return {
    rows,
    judge: () => {
      for (const check of deferred) check();
    },
  };
}

/**
 * What a P5 save of `question` makes of the answer `stored`, with the checks that need
 * the stored answer for {@link judgeAgainstStored}. Throws what the request settles
 * alone: a sub-item that takes no answer, a field its type does not take, a text too
 * long for a short text, a value not among the choices, a cell of the wrong type.
 *
 * @throws {ApiError} NOT_EDITABLE, INVALID_CHOICE or VALIDATION_FAILED
 */
function answerAfter(
  question: PlanQuestion,
  body: PlanAnswerSave,
  stored: PlanAnswerContent | null,
): { after: PlanAnswerContent; judge: () => void } {
  if (!takesAnswer(question)) {
    throw new ApiError("NOT_EDITABLE", "This sub-item takes no answer");
  }
  const current = stored ?? { text: null, rows: null };
  if (question.answerType === "table") {
    if (body.text !== undefined) {
      throw invalid("text", "unrecognized_keys", "A table takes rows");
    }
    if (body.rows === undefined) return { after: current, judge: () => {} };
    const checked = checkRows(question, body.rows ?? [], current.rows ?? []);
    return {
      after: {
        text: current.text,
        rows: checked.rows.length === 0 ? null : checked.rows,
      },
      judge: checked.judge,
    };
  }
  if (body.rows !== undefined) {
    throw invalid("rows", "unrecognized_keys", "Only a table takes rows");
  }
  const text = body.text;
  if (text === undefined) return { after: current, judge: () => {} };
  if (
    text !== null &&
    question.answerType === "short_text" &&
    countChars(text) > TEXT_LIMITS.short
  ) {
    throw invalid(
      "text",
      "too_big",
      `Must be at most ${TEXT_LIMITS.short} characters`,
    );
  }
  if (
    text !== null &&
    question.options?.kind === "choice" &&
    !question.options.choices.includes(text)
  ) {
    throw new ApiError("INVALID_CHOICE", "Not one of the choices");
  }
  return { after: { text, rows: current.rows }, judge: () => {} };
}

/** P5's answer as it is now, which the save made or left. */
async function answerView(db: Executor, scope: Scope, questionKey: string) {
  const planId = scope.planId as string;
  const [row] = await db
    .select()
    .from(planAnswers)
    .where(
      and(
        eq(planAnswers.businessPlanId, planId),
        eq(planAnswers.questionKey, questionKey),
      ),
    );
  const users = await loadUserRefs(
    db,
    row?.updatedById == null ? [] : [row.updatedById],
    scope.workspaceId,
  );
  const comments = await loadCommentCounts(db, [
    { type: "plan_answer", id: planId, key: questionKey },
  ]);
  return planAnswerView(
    planId,
    questionKey,
    row === undefined ? undefined : storedAnswerRow(row),
    { users, comments },
  );
}

const lockedItem = (row: PlanAnswerRow) => ({
  value: planAnswerContent(row),
  lockVersion: row.lockVersion,
  updatedAt: row.updatedAt,
  updatedById: row.updatedById,
});

/** What the plan item routes need from the app. */
export interface PlanItemRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const readErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  422: errorBodySchema,
} as const;

/** P4 and P5 (SDD 5.9): a plan item (21) and saving its answers. */
export function planItemRoutes({ access, db, now }: PlanItemRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/plans/:planId/items/:itemNo",
      async ({ scope, caller, params, query }) => {
        const { today } = await dueWindow(db, caller.id, new Date(now()));
        // One snapshot for the shares and the shared answers of the self-analysis
        // references, as S7 reads them: a share removed while this reads cannot let in
        // answers written after it went.
        return db.transaction(
          (tx) =>
            loadPlanItem(tx, {
              scope,
              itemNo: params.itemNo,
              versionId: query.versionId,
              today,
            }),
          { isolationLevel: "repeatable read", accessMode: "read only" },
        );
      },
      {
        scoped: { to: "planId", need: "read" },
        params: planItemParamsSchema,
        query: planVersionQuerySchema,
        response: { 200: planItemSchema, ...readErrors },
        detail: {
          summary: "P4 A plan item (21)",
          description:
            "itemNo is 1–30. With versionId, the answers, numbers and execution items are that saved version's; the references are always the validation's now. The shared self-analyses only for Owners and Members.",
        },
      },
    )
    .put(
      "/api/v1/plans/:planId/answers/:questionKey",
      async ({ scope, params, body, caller, request }) => {
        const planId = scope.planId as string;
        const { questionKey } = params;
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const when = await planContentTime(tx, planId, at);
          // Read under the plan's lock, which a template migration takes too.
          const plan = await requirePlan(tx, planId);
          const sections = await loadPlanTemplate(tx, plan.templateVersionId);
          const question = findPlanQuestion(sections, questionKey);
          if (question === undefined) {
            throw new ApiError(
              "QUESTION_NOT_FOUND",
              "The pinned template version has no such question",
            );
          }
          const [current] = await tx
            .select()
            .from(planAnswers)
            .where(
              and(
                eq(planAnswers.businessPlanId, planId),
                eq(planAnswers.questionKey, questionKey),
              ),
            )
            .for("update");
          const before =
            current === undefined ? null : planAnswerContent(current);
          const { after, judge } = answerAfter(question, body, before);
          await judgeAgainstStored(
            tx,
            {
              stored: current === undefined ? null : lockedItem(current),
              claim: body,
              workspaceId: scope.workspaceId,
              keyed: true,
            },
            judge,
          );
          const unchanged =
            current === undefined
              ? after.text === null && after.rows === null
              : isDeepStrictEqual(before, after);
          if (unchanged) return;
          if (current !== undefined) {
            await checkKeyedLockVersion(
              tx,
              lockedItem(current),
              body,
              scope.workspaceId,
            );
          }
          if (current === undefined) {
            await createKeyedItem(
              tx,
              async () =>
                (
                  await tx
                    .insert(planAnswers)
                    .values({
                      businessPlanId: planId,
                      questionKey,
                      ...after,
                      lockVersion: 1,
                      updatedById: caller.id,
                      createdAt: when,
                      updatedAt: when,
                    })
                    .onConflictDoNothing()
                    .returning({ id: planAnswers.id })
                )[0],
              async () => {
                const [row] = await tx
                  .select()
                  .from(planAnswers)
                  .where(
                    and(
                      eq(planAnswers.businessPlanId, planId),
                      eq(planAnswers.questionKey, questionKey),
                    ),
                  );
                if (row === undefined) throw new Error("No answer row");
                return lockedItem(row);
              },
              scope.workspaceId,
            );
          } else {
            await tx
              .update(planAnswers)
              .set({
                ...after,
                lockVersion: current.lockVersion + 1,
                updatedAt: when,
                updatedById: caller.id,
              })
              .where(eq(planAnswers.id, current.id));
          }
          await withHistory(
            tx,
            {
              container: {
                type: "business_plan",
                id: planId,
                workspaceId: scope.workspaceId,
              },
              changedById: caller.id,
              source: "manual",
              batchId: null,
              client: requestContext(request).client,
              at: when,
            },
            async () => ({
              target: { type: "plan_answer", id: planId, key: questionKey },
              action: current === undefined ? "create" : "update",
              before,
              after,
            }),
          );
        });
        return answerView(db, scope, questionKey);
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        params: planAnswerParamsSchema,
        body: planAnswerSaveSchema,
        parse: "json",
        response: {
          200: planAnswerSchema,
          ...readErrors,
          409: errorBodySchema,
        },
        detail: {
          summary: "P5 Save a plan answer",
          description:
            "text for a text or choice sub-item, rows for a table, created at version 1 on its first save. 422 NOT_EDITABLE for number and execution sub-items, QUESTION_NOT_FOUND, INVALID_CHOICE. A cell longer than its limit is accepted only while it keeps a value the table holds already (a draft's copy).",
        },
      },
    );
}
