import { schema } from "@moonx/db";
import { parseChoice } from "@moonx/domain";
import {
  type AiImportApplyBody,
  type Classification,
  type ConflictCurrent,
  MAX_SHORT_TEXT,
  type QuestionOptions,
  type TemplateKind,
  type Versioned,
} from "@moonx/schemas";
import { and, eq, inArray } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import type { HistoryActor } from "../history/with-history";
import { type AiTarget, IMPORTABLE_TYPES, type TargetAnswer } from "./ai-target";
import type { Tx } from "./db";
import { savePlanAnswer } from "./plan-write";
import { ensureSelfAnalysis, saveSelfAnalysisAnswer } from "./self-analysis";
import type { TemplateQuestionRow } from "./template";
import { saveAnswer } from "./validation-answers";
import { hasText } from "./validation-data";

/** SDD 5.10 ImportContext. */
export interface ImportContext {
  target: { type: TemplateKind; id: string; name: string };
  questions: {
    questionKey: string;
    title: string;
    sectionKey: string;
    answerType: TemplateQuestionRow["answerType"];
    options: QuestionOptions | null;
    importable: boolean;
    hidden: boolean;
    current: {
      text: string | null;
      amount: number | null;
      classification: Classification | null;
    } & Versioned;
  }[];
}

/** X2: every question of the target with what it holds now, so the import can match and diff. */
export function buildImportContext(target: AiTarget): ImportContext {
  return {
    target: { type: target.kind, id: target.id, name: target.name },
    questions: target.sections.flatMap(({ rows }) =>
      rows.map((q) => {
        const answer = target.answers.get(q.key) as TargetAnswer;
        return {
          questionKey: q.key,
          title: q.title,
          sectionKey: q.sectionKey,
          answerType: q.answerType,
          options: q.options,
          importable: IMPORTABLE_TYPES.has(q.answerType),
          hidden: answer.hidden,
          current: {
            text: answer.text,
            amount: answer.amount,
            classification: answer.classification,
            lockVersion: answer.lockVersion,
            updatedAt: answer.updatedAt,
            updatedBy: answer.updatedBy,
          },
        };
      }),
    ),
  };
}

/**
 * Locks the target's parent row and then its answer rows (in key order, so two imports cannot
 * deadlock) so no one edits them between the conflict check and the writes. Rows that do not
 * exist yet cannot be locked: a person who creates one meanwhile is caught by `applyAiImport`.
 */
export async function lockImportRows(
  tx: Tx,
  target: { type: TemplateKind; id: string },
  keys: string[],
): Promise<void> {
  const parent =
    target.type === "self_analysis"
      ? { table: schema.selfAnalyses, id: schema.selfAnalyses.id }
      : target.type === "validation"
        ? { table: schema.validations, id: schema.validations.id }
        : { table: schema.businessPlans, id: schema.businessPlans.id };
  await tx
    .select({ id: parent.id })
    .from(parent.table)
    .where(eq(parent.id, target.id))
    .for("update");
  if (target.type === "self_analysis") {
    await tx
      .select({ id: schema.selfAnalysisAnswers.id })
      .from(schema.selfAnalysisAnswers)
      .where(
        and(
          eq(schema.selfAnalysisAnswers.selfAnalysisId, target.id),
          inArray(schema.selfAnalysisAnswers.questionKey, keys),
        ),
      )
      .orderBy(schema.selfAnalysisAnswers.questionKey)
      .for("update");
  } else if (target.type === "validation") {
    await tx
      .select({ id: schema.validationAnswers.id })
      .from(schema.validationAnswers)
      .where(
        and(
          eq(schema.validationAnswers.validationId, target.id),
          inArray(schema.validationAnswers.questionKey, keys),
        ),
      )
      .orderBy(schema.validationAnswers.questionKey)
      .for("update");
  } else {
    await tx
      .select({ id: schema.planAnswers.id })
      .from(schema.planAnswers)
      .where(
        and(
          eq(schema.planAnswers.businessPlanId, target.id),
          inArray(schema.planAnswers.questionKey, keys),
        ),
      )
      .orderBy(schema.planAnswers.questionKey)
      .for("update");
  }
}

/** Who applies an import, where, and when. */
export interface ApplyContext {
  actor: HistoryActor;
  now: Date;
}

interface Prepared {
  index: number;
  question: TemplateQuestionRow;
  answer: TargetAnswer;
  text: string | null | undefined;
  amount: number | null | undefined;
  change: AiImportApplyBody["changes"][number];
}

/**
 * Re-checks every change as the server must (the client checked it too): the question exists,
 * is importable and visible, amounts only go to amount questions, a choice is one of the choices
 * (case aside), and a short text is short. Nothing is written here.
 */
function prepare(target: AiTarget, changes: AiImportApplyBody["changes"]): Prepared[] {
  const questions = new Map(
    target.sections.flatMap(({ rows }) => rows.map((q) => [q.key, q] as const)),
  );
  const seen = new Set<string>();
  return changes.map((change, index) => {
    const path = `changes.${index}`;
    if (seen.has(change.questionKey)) {
      throw validationFailed([
        { path: `${path}.questionKey`, code: "invalid", message: "Each question may appear once" },
      ]);
    }
    seen.add(change.questionKey);
    const question = questions.get(change.questionKey);
    if (!question) throw new ApiError("QUESTION_NOT_FOUND", "No such question in this template");
    const answer = target.answers.get(question.key) as TargetAnswer;
    if (!IMPORTABLE_TYPES.has(question.answerType) || answer.hidden) {
      throw new ApiError("NOT_IMPORTABLE", `${question.key} cannot be imported`);
    }
    if (change.amount !== undefined && question.answerType !== "amount_with_reason") {
      throw validationFailed([
        {
          path: `${path}.amount`,
          code: "invalid",
          message: "Only amount questions take an amount",
        },
      ]);
    }
    let text = change.text;
    if (question.answerType === "choice" && hasText(text)) {
      const choice = parseChoice(
        text,
        question.options?.kind === "choice" ? question.options.choices : [],
      );
      if (choice == null) {
        throw validationFailed([
          { path: `${path}.text`, code: "invalid_value", message: "Not one of the choices" },
        ]);
      }
      text = choice;
    }
    if (
      question.answerType === "short_text" &&
      typeof text === "string" &&
      text.length > MAX_SHORT_TEXT
    ) {
      throw validationFailed([
        {
          path: `${path}.text`,
          code: "too_big",
          message: `Must be ${MAX_SHORT_TEXT} characters or fewer`,
        },
      ]);
    }
    return { index, question, answer, text, amount: change.amount, change };
  });
}

/**
 * X3. Applies all changes or none: the changes are checked, every base `lockVersion` is compared
 * with the locked row (any mismatch is a 409 CONFLICT_MULTI naming all of them, with nothing
 * written), then each answer is saved through the same function as its single-item API, with the
 * history source `ai_import` and one `batchId`. In a validation a changed text drops the F/A/U
 * unless the change brings its own (design-spec 6.7), and the count of answers left unclassified
 * is returned for the "needs F/A/U" notice.
 */
export async function applyAiImport(
  tx: Tx,
  target: AiTarget,
  ctx: ApplyContext,
  body: AiImportApplyBody,
): Promise<{ applied: number; needsClassification: number; batchId: string }> {
  const prepared = prepare(target, body.changes);
  const conflicts = prepared.filter((p) => p.answer.lockVersion !== p.change.baseLockVersion);
  if (conflicts.length > 0) {
    throw new ApiError("CONFLICT_MULTI", "Some answers were changed by someone else", {
      conflicts: conflicts.map((p) => ({
        questionKey: p.question.key,
        current: {
          value: { text: p.answer.text, amount: p.answer.amount },
          lockVersion: p.answer.lockVersion,
          updatedAt: p.answer.updatedAt ?? ctx.now.toISOString(),
          updatedBy: p.answer.updatedBy,
        } satisfies ConflictCurrent,
      })),
    });
  }

  const batchId = crypto.randomUUID();
  const actor: HistoryActor = { ...ctx.actor, source: "ai_import", batchId };
  const analysis =
    target.kind === "self_analysis" ? await ensureSelfAnalysis(tx, actor.userId) : null;
  let applied = 0;
  let needsClassification = 0;
  async function saveOne(
    p: Prepared,
    lock: { lockVersion: number },
  ): Promise<{ lockVersion: number; classification?: Classification }> {
    let saved: { lockVersion: number; classification?: Classification };
    if (target.kind === "self_analysis") {
      saved = await saveSelfAnalysisAnswer(
        tx,
        { analysis: analysis as NonNullable<typeof analysis>, actor, now: ctx.now },
        p.question.key,
        { text: p.text, amount: p.amount, ...lock },
      );
    } else if (target.kind === "validation") {
      const textChanged =
        p.text !== undefined && (hasText(p.text) ? p.text : null) !== p.answer.text;
      saved = await saveAnswer(
        tx,
        {
          workspaceId: target.workspaceId as string,
          ideaId: target.ideaId as string,
          validationId: target.id,
          actor,
          now: ctx.now,
        },
        p.question.key,
        {
          text: p.text,
          classification: p.change.classification ?? (textChanged ? { fau: null } : undefined),
          ...lock,
        },
      );
    } else {
      saved = await savePlanAnswer(
        tx,
        {
          workspaceId: target.workspaceId as string,
          ideaId: target.ideaId as string,
          planId: target.id,
          actor,
          now: ctx.now,
        },
        p.question.key,
        { text: p.text, ...lock },
      );
    }
    return saved;
  }

  for (const p of prepared) {
    const lock = { lockVersion: p.change.baseLockVersion };
    let saved: { lockVersion: number; classification?: Classification };
    try {
      saved = await saveOne(p, lock);
    } catch (error) {
      // An answer created by someone else after the locks were taken: report it like the others.
      if (error instanceof ApiError && error.code === "CONFLICT") {
        throw new ApiError("CONFLICT_MULTI", "Some answers were changed by someone else", {
          conflicts: [{ questionKey: p.question.key, current: error.extra.current }],
        });
      }
      throw error;
    }
    if (saved.lockVersion !== p.answer.lockVersion) {
      applied += 1;
      if (saved.classification?.state === "unclassified") needsClassification += 1;
    }
  }
  return { applied, needsClassification, batchId };
}
