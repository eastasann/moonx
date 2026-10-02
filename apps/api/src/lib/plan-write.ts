import { schema } from "@moonx/db";
import {
  MAX_SHORT_TEXT,
  type PutPlanAnswerBody,
  type QuestionOptions,
  type UpdatePlanBody,
  type UserRef,
  type Versioned,
} from "@moonx/schemas";
import { and, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { answerHistorySection } from "../history/sections";
import { planAnswerSnapshot, planHeaderSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Executor, Tx } from "./db";
import { UNSAVED, versionedOf } from "./dto";
import { checkLock } from "./lock";
import type { PlanAnswerRow } from "./plan-context";
import { findPlanQuestion } from "./plan-question";
import { loadUserRefs } from "./users";
import { hasText } from "./validation-data";
import { checkLockLazily, lostInsertRace, touchValidationActivity } from "./validation-write";

/** SDD 5.9 PlanAnswer. */
export interface PlanAnswer extends Versioned {
  questionKey: string;
  text: string | null;
  rows: Record<string, string | number | null>[] | null;
  copiedFrom: { source: string; copiedAt: string } | null;
  commentCount: number;
}

/** Where and by whom a plan is written. */
export interface PlanWriteContext {
  workspaceId: string;
  ideaId: string;
  planId: string;
  actor: HistoryActor;
  now: Date;
}

/**
 * Marks the plan, its idea and the workspace as active. The last step of every plan write: it
 * refuses an archived plan or idea, so a write racing an archive cannot leave a change behind
 * (409 ARCHIVED, design-spec 6.12). `updated_at` stays: it belongs to the header's own editor.
 */
export async function touchPlanActivity(
  tx: Tx,
  ids: { workspaceId: string; ideaId: string; planId: string },
  now: Date,
): Promise<void> {
  const touched = await tx
    .update(schema.businessPlans)
    .set({ lastActivityAt: now, updatedAt: sql`${schema.businessPlans.updatedAt}` })
    .where(and(eq(schema.businessPlans.id, ids.planId), isNull(schema.businessPlans.archivedAt)))
    .returning({ id: schema.businessPlans.id });
  if (touched.length === 0) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
  await touchValidationActivity(tx, ids, now);
}

/** Comment counts of the plan's answers by question key (design-spec 6.0.4). */
async function loadAnswerCommentCounts(db: Executor, workspaceId: string, planId: string) {
  const rows = await db
    .select({ key: schema.comments.targetKey, n: count() })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        eq(schema.comments.targetType, "plan_answer"),
        eq(schema.comments.targetId, planId),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetKey);
  return new Map(rows.flatMap((r) => (r.key ? [[r.key, r.n] as const] : [])));
}

/** SDD 5.9 PlanAnswer for each question key in order; unanswered ones have `lockVersion: 0`. */
export async function buildPlanAnswers(
  db: Executor,
  workspaceId: string,
  planId: string,
  answers: PlanAnswerRow[],
  questionKeys: string[],
): Promise<PlanAnswer[]> {
  const rowOf = new Map(answers.map((a) => [a.questionKey, a]));
  const [refs, comments] = await Promise.all([
    loadUserRefs(
      db,
      answers.map((a) => a.updatedById),
      workspaceId,
    ),
    loadAnswerCommentCounts(db, workspaceId, planId),
  ]);
  return questionKeys.map((key) => {
    const row = rowOf.get(key);
    return {
      ...(row ? versionedOf(row, refs) : UNSAVED),
      questionKey: key,
      text: row?.text ?? null,
      rows: (row?.rows as PlanAnswer["rows"]) ?? null,
      copiedFrom: (row?.copiedFrom as PlanAnswer["copiedFrom"]) ?? null,
      commentCount: comments.get(key) ?? 0,
    };
  });
}

async function loadPlanAnswersFor(tx: Executor, ctx: PlanWriteContext, keys: string[]) {
  const rows = await tx
    .select()
    .from(schema.planAnswers)
    .where(
      and(
        eq(schema.planAnswers.businessPlanId, ctx.planId),
        inArray(schema.planAnswers.questionKey, keys),
      ),
    );
  return buildPlanAnswers(tx, ctx.workspaceId, ctx.planId, rows, keys);
}

type Cell = string | number | null;

/**
 * Checks the rows of a table sub-item against the question's columns (SDD 5.9 P5): only known
 * column keys, text columns hold text, number columns numbers, percent columns a 0-1 fraction
 * and money columns an amount of at least 0. Empty text cells are stored as null.
 */
function normalizeTableRows(
  options: QuestionOptions | null,
  rows: Record<string, Cell>[],
): Record<string, Cell>[] {
  if (options?.kind !== "table") return [];
  const columns = new Map(options.columns.map((c) => [c.key, c]));
  const details: { path: string; code: string; message: string }[] = [];
  const normalized = rows.map((row, index) => {
    const out: Record<string, Cell> = {};
    for (const [key, value] of Object.entries(row)) {
      const column = columns.get(key);
      const path = `rows.${index}.${key}`;
      if (!column) {
        details.push({ path, code: "unrecognized_keys", message: "Not a column of this table" });
        continue;
      }
      if (value == null) {
        out[key] = null;
      } else if (column.type === "text") {
        if (typeof value !== "string") {
          details.push({ path, code: "invalid_type", message: "Expected text" });
        } else {
          out[key] = hasText(value) ? value : null;
        }
      } else if (typeof value !== "number" || !Number.isFinite(value)) {
        details.push({ path, code: "invalid_type", message: "Expected a number" });
      } else if (column.type === "percent" && (value < 0 || value > 1)) {
        details.push({ path, code: "too_big", message: "Must be between 0 and 1" });
      } else if (column.type === "money" && (value < 0 || value > 1e12)) {
        details.push({ path, code: "too_big", message: "Must be between 0 and 1e12" });
      } else {
        out[key] = value;
      }
    }
    return out;
  });
  if (details.length > 0) throw validationFailed(details);
  return normalized;
}

/**
 * P5. Upserts one plan answer under the item's optimistic lock with one history row. Numbers and
 * execution sub-items are not editable here (422 NOT_EDITABLE); text goes to text questions and
 * rows to table questions.
 */
export async function savePlanAnswer(
  tx: Tx,
  ctx: PlanWriteContext,
  questionKey: string,
  body: PutPlanAnswerBody,
): Promise<PlanAnswer> {
  const question = await findPlanQuestion(tx, ctx.planId, questionKey);
  if (!question) throw new ApiError("QUESTION_NOT_FOUND", "No such question in this template");
  if (question.answerType === "linked_metric" || question.answerType === "execution_view") {
    throw new ApiError("NOT_EDITABLE", "This sub-item is not edited here");
  }
  const isTable = question.answerType === "table";
  if (isTable && body.text != null) {
    throw validationFailed([
      { path: "text", code: "invalid", message: "Table sub-items take rows, not text" },
    ]);
  }
  if (!isTable && body.rows != null) {
    throw validationFailed([
      { path: "rows", code: "invalid", message: "Only table sub-items take rows" },
    ]);
  }
  if (
    question.answerType === "short_text" &&
    typeof body.text === "string" &&
    body.text.length > MAX_SHORT_TEXT
  ) {
    throw validationFailed([
      { path: "text", code: "too_big", message: `Must be ${MAX_SHORT_TEXT} characters or fewer` },
    ]);
  }
  if (question.answerType === "choice" && hasText(body.text)) {
    const choices = question.options?.kind === "choice" ? question.options.choices : [];
    if (!choices.includes(body.text as string)) {
      throw new ApiError("INVALID_CHOICE", "The answer is not one of the choices");
    }
  }

  const [row] = await tx
    .select()
    .from(schema.planAnswers)
    .where(
      and(
        eq(schema.planAnswers.businessPlanId, ctx.planId),
        eq(schema.planAnswers.questionKey, questionKey),
      ),
    )
    .for("update");
  const view = async () => (await loadPlanAnswersFor(tx, ctx, [questionKey]))[0] as PlanAnswer;
  const lockVersion = await checkLockLazily(tx, {
    workspaceId: ctx.workspaceId,
    row: row ?? null,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: view,
  });

  const text =
    body.text === undefined ? (row?.text ?? null) : hasText(body.text) ? body.text : null;
  const rows =
    body.rows === undefined
      ? ((row?.rows as Record<string, Cell>[] | null) ?? null)
      : body.rows === null
        ? null
        : normalizeTableRows(question.options, body.rows);
  const before = planAnswerSnapshot(row ?? null);
  const after = planAnswerSnapshot({ text, rows });
  if (row && JSON.stringify(before) === JSON.stringify(after)) return view();
  if (!row && text == null && rows == null) return view();

  await withHistory(
    tx,
    {
      container: { type: "business_plan", id: ctx.planId },
      workspaceId: ctx.workspaceId,
      sectionKey: answerHistorySection(questionKey),
      target: { type: "plan_answer", id: ctx.planId, key: questionKey },
      actor: ctx.actor,
    },
    async () => {
      const stamp = { updatedById: ctx.actor.userId, updatedAt: ctx.now };
      if (row) {
        await tx
          .update(schema.planAnswers)
          .set({ text, rows, ...stamp, lockVersion })
          .where(eq(schema.planAnswers.id, row.id));
      } else {
        const [saved] = await tx
          .insert(schema.planAnswers)
          .values({
            businessPlanId: ctx.planId,
            questionKey,
            text,
            rows,
            ...stamp,
            lockVersion: 1,
          })
          .onConflictDoNothing()
          .returning({ id: schema.planAnswers.id });
        if (!saved) {
          const [current] = await tx
            .select()
            .from(schema.planAnswers)
            .where(
              and(
                eq(schema.planAnswers.businessPlanId, ctx.planId),
                eq(schema.planAnswers.questionKey, questionKey),
              ),
            );
          await lostInsertRace(tx, {
            workspaceId: ctx.workspaceId,
            row: current ?? null,
            currentValue: view,
          });
        }
      }
      return { result: undefined, before: row ? before : null, after };
    },
  );
  await touchPlanActivity(tx, ctx, ctx.now);
  return view();
}

/** The header as P2 PATCH answers a conflict with. */
function headerValue(row: { name: string; businessName: string; preparedBy: string }) {
  return planHeaderSnapshot(row);
}

/**
 * Runs a write that sets a plan name and answers a unique-index violation (SQLSTATE 23505) of
 * (idea, name) with 409 NAME_TAKEN. The name check before the write cannot see a rename or create
 * that commits meanwhile, and the index is case-sensitive while the check is not.
 */
export async function namedPlanWrite<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    if (cause?.code === "23505" || (error as { code?: string }).code === "23505") {
      throw new ApiError("NAME_TAKEN", "A plan with this name already exists");
    }
    throw error;
  }
}

/** 409 NAME_TAKEN when another plan of the idea has this name, archived ones included. */
export async function assertPlanNameFree(
  tx: Executor,
  ideaId: string,
  name: string,
  exceptPlanId: string | null,
): Promise<void> {
  const taken = await tx
    .select({ id: schema.businessPlans.id })
    .from(schema.businessPlans)
    .where(
      and(
        eq(schema.businessPlans.ideaId, ideaId),
        sql`lower(${schema.businessPlans.name}) = lower(${name})`,
      ),
    );
  if (taken.some((t) => t.id !== exceptPlanId)) {
    throw new ApiError("NAME_TAKEN", "A plan with this name already exists");
  }
}

/** P2 PATCH: name, Business Name and Prepared By under the header's lock. */
export async function updatePlanHeader(
  tx: Tx,
  ctx: PlanWriteContext,
  body: UpdatePlanBody,
): Promise<void> {
  const [row] = await tx
    .select()
    .from(schema.businessPlans)
    .where(eq(schema.businessPlans.id, ctx.planId))
    .for("update");
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  const lockVersion = await checkLock(tx, {
    workspaceId: ctx.workspaceId,
    row,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: () => headerValue(row),
  });
  const next = {
    name: body.name ?? row.name,
    businessName: body.businessName ?? row.businessName,
    preparedBy: body.preparedBy ?? row.preparedBy,
  };
  const before = planHeaderSnapshot(row);
  if (JSON.stringify(before) === JSON.stringify(planHeaderSnapshot(next))) return;
  if (next.name !== row.name) await assertPlanNameFree(tx, ctx.ideaId, next.name, ctx.planId);
  await withHistory(
    tx,
    {
      container: { type: "business_plan", id: ctx.planId },
      workspaceId: ctx.workspaceId,
      target: { type: "business_plan", id: ctx.planId },
      actor: ctx.actor,
    },
    async () => {
      await namedPlanWrite(() =>
        tx
          .update(schema.businessPlans)
          .set({ ...next, lockVersion, updatedById: ctx.actor.userId, updatedAt: ctx.now })
          .where(eq(schema.businessPlans.id, ctx.planId)),
      );
      return { result: undefined, before, after: planHeaderSnapshot(next) };
    },
  );
  await touchPlanActivity(tx, ctx, ctx.now);
}

/** P3: archive or restore a plan. Idempotent. */
export async function setPlanArchived(
  tx: Tx,
  planId: string,
  archived: boolean,
  now: Date,
): Promise<void> {
  await tx
    .update(schema.businessPlans)
    .set({
      archivedAt: archived ? now : null,
      updatedAt: sql`${schema.businessPlans.updatedAt}`,
    })
    .where(
      and(
        eq(schema.businessPlans.id, planId),
        archived ? isNull(schema.businessPlans.archivedAt) : undefined,
      ),
    );
}

export type { UserRef };
