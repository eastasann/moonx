import { schema } from "@moonx/db";
import {
  MAX_SHORT_TEXT,
  type PutAnswerBody,
  type QuestionOptions,
  type TemplateSection,
  type ValidationAnswer,
} from "@moonx/schemas";
import { and, asc, count, eq, isNull } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { answerSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Executor, Tx } from "./db";
import { UNSAVED, versionedOf } from "./dto";
import {
  classificationOfTarget,
  findQuestion,
  type LockedTarget,
  linkIdsOf,
  lockTarget,
} from "./evidence-write";
import { applyClassification } from "./fau-rules";
import { loadUserRefs } from "./users";
import {
  type AnswerRow,
  hasText,
  isActiveEvidence,
  isQuestionVisible,
  loadValidationData,
  type QuestionDef,
  type ValidationData,
} from "./validation-data";
import { checkLockLazily, lostInsertRace, touchValidationActivity } from "./validation-write";

/** The section of the validation's pinned template version, with its questions in order. */
export async function loadTemplateSection(
  db: Executor,
  templateVersionId: string,
  sectionKey: string,
): Promise<TemplateSection | null> {
  const [section] = await db
    .select()
    .from(schema.templateSections)
    .where(
      and(
        eq(schema.templateSections.templateVersionId, templateVersionId),
        eq(schema.templateSections.key, sectionKey),
      ),
    );
  if (!section) return null;
  const questions = await db
    .select()
    .from(schema.templateQuestions)
    .where(eq(schema.templateQuestions.templateSectionId, section.id))
    .orderBy(asc(schema.templateQuestions.sortOrder));
  return {
    key: section.key,
    part: section.part,
    title: section.title,
    guidance: section.guidance,
    questions: questions.map((q) => ({
      key: q.questionKey,
      sectionKey: section.key,
      title: q.title,
      prompt: q.prompt,
      example: q.example,
      hint: q.hint,
      answerType: q.answerType,
      options: q.options as QuestionOptions | null,
      displayCondition: q.displayCondition as Record<string, string[]> | null,
      hasFau: q.hasFau,
    })),
  };
}

/** Comments on answers, replies included, deleted ones left out (design-spec 6.0.4). */
async function loadAnswerCommentCounts(db: Executor, workspaceId: string, validationId: string) {
  const rows = await db
    .select({ key: schema.comments.targetKey, n: count() })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        eq(schema.comments.targetType, "validation_answer"),
        eq(schema.comments.targetId, validationId),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetKey);
  return new Map(rows.flatMap((r) => (r.key ? [[r.key, r.n] as const] : [])));
}

/**
 * SDD 5.7 ValidationAnswer for each of the given questions, in the order given: one per
 * question, unanswered ones with `lockVersion: 0`. Hidden questions are returned with `hidden`.
 */
export async function buildValidationAnswers(
  db: Executor,
  workspaceId: string,
  data: ValidationData,
  questions: QuestionDef[],
): Promise<ValidationAnswer[]> {
  const rowOf = new Map(data.answers.map((a) => [a.questionKey, a]));
  const textOf = (key: string) => {
    const text = rowOf.get(key)?.text;
    return hasText(text) ? (text as string) : null;
  };
  const refs = await loadUserRefs(
    db,
    data.answers.map((a) => a.updatedById),
    workspaceId,
  );
  const comments = await loadAnswerCommentCounts(db, workspaceId, data.validationId);
  return questions.map((question) => {
    const row = rowOf.get(question.key) ?? null;
    const target: LockedTarget = {
      type: "validation_answer",
      key: question.key,
      sectionKey: question.sectionKey,
      row,
    };
    return {
      ...(row ? versionedOf(row, refs) : UNSAVED),
      questionKey: question.key,
      text: row?.text ?? null,
      classification: classificationOfTarget(data, target, data.validationId),
      hidden: !isQuestionVisible(question, textOf),
      commentCount: comments.get(question.key) ?? 0,
    };
  });
}

/** The answers to the given question keys of one validation (V3 response, V8 patterns, V15 worth). */
export async function loadValidationAnswers(
  db: Executor,
  workspaceId: string,
  validationId: string,
  questionKeys: string[],
): Promise<ValidationAnswer[]> {
  const data = (await loadValidationData(db, [validationId])).get(validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  const questions = questionKeys.flatMap((key) => data.questions.filter((q) => q.key === key));
  return buildValidationAnswers(db, workspaceId, data, questions);
}

const chosenFrom = (options: unknown): string[] => {
  const o = options as QuestionOptions | null;
  return o?.kind === "choice" ? o.choices : [];
};

/** Where and by whom an answer is saved. */
export interface SaveAnswerContext {
  workspaceId: string;
  ideaId: string;
  validationId: string;
  actor: HistoryActor;
  now: Date;
}

/**
 * V3. Upserts one answer: text and/or F/A/U with the item's optimistic lock and one history row.
 * An answer that would not change writes nothing and keeps its version.
 */
export async function saveAnswer(
  tx: Tx,
  ctx: SaveAnswerContext,
  questionKey: string,
  body: PutAnswerBody,
): Promise<ValidationAnswer> {
  const { validationId, workspaceId } = ctx;
  const question = await findQuestion(tx, validationId, questionKey);
  if (!question) throw new ApiError("QUESTION_NOT_FOUND", "No such question in this template");

  const target = (await lockTarget(tx, validationId, {
    type: "validation_answer",
    id: validationId,
    key: questionKey,
  })) as Extract<LockedTarget, { type: "validation_answer" }>;
  const row: AnswerRow | null = target.row;
  const data = (await loadValidationData(tx, [validationId])).get(validationId) as ValidationData;
  const view = async () =>
    (
      await buildValidationAnswers(
        tx,
        workspaceId,
        data,
        data.questions.filter((q) => q.key === questionKey),
      )
    )[0];

  const lockVersion = await checkLockLazily(tx, {
    workspaceId,
    row,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: view,
  });

  const text =
    body.text === undefined ? (row?.text ?? null) : hasText(body.text) ? body.text : null;
  if (
    question.answerType === "short_text" &&
    body.text !== undefined &&
    text != null &&
    text.length > MAX_SHORT_TEXT
  ) {
    throw validationFailed([
      { path: "text", code: "too_big", message: `Must be ${MAX_SHORT_TEXT} characters or fewer` },
    ]);
  }
  if (question.answerType === "choice" && body.text !== undefined && text != null) {
    if (!chosenFrom(question.options).includes(text)) {
      throw new ApiError("INVALID_CHOICE", "The answer is not one of the choices");
    }
  }

  const links = data.evidence.filter(
    (l) =>
      l.targetType === "validation_answer" &&
      l.targetId === validationId &&
      l.targetKey === questionKey,
  );
  const change = applyClassification(
    {
      current: { fau: row?.fau ?? null, confidence: row?.confidence ?? null },
      hasValue: hasText(text),
      input: body.classification,
      activeEvidenceCount: links.filter((l) => isActiveEvidence(data, l)).length,
    },
    false,
  );

  const unchanged =
    (row?.text ?? null) === text &&
    (row?.fau ?? null) === change.fau &&
    (row?.confidence ?? null) === change.confidence;
  if (unchanged) return (await view()) as ValidationAnswer;

  const evidence = linkIdsOf(data, target, validationId);
  const stamp = { updatedById: ctx.actor.userId, updatedAt: ctx.now };
  await withHistory(
    tx,
    {
      container: { type: "validation", id: validationId },
      workspaceId,
      sectionKey: question.sectionKey,
      target: { type: "validation_answer", id: validationId, key: questionKey },
      actor: ctx.actor,
    },
    async () => {
      const values = { text, fau: change.fau, confidence: change.confidence };
      let saved: AnswerRow | undefined;
      if (row) {
        [saved] = await tx
          .update(schema.validationAnswers)
          .set({ ...values, ...stamp, lockVersion })
          .where(eq(schema.validationAnswers.id, row.id))
          .returning();
      } else {
        [saved] = await tx
          .insert(schema.validationAnswers)
          .values({ ...values, ...stamp, validationId, questionKey, lockVersion: 1 })
          .onConflictDoNothing()
          .returning();
        if (!saved) {
          const [current] = await tx
            .select()
            .from(schema.validationAnswers)
            .where(
              and(
                eq(schema.validationAnswers.validationId, validationId),
                eq(schema.validationAnswers.questionKey, questionKey),
              ),
            );
          await lostInsertRace(tx, {
            workspaceId,
            row: current ?? null,
            currentValue: async () =>
              (await loadValidationAnswers(tx, workspaceId, validationId, [questionKey]))[0],
          });
        }
      }
      return {
        result: undefined,
        before: row ? answerSnapshot(row, evidence) : null,
        after: answerSnapshot(saved as AnswerRow, evidence),
      };
    },
  );
  await touchValidationActivity(tx, ctx, ctx.now);
  return (
    await loadValidationAnswers(tx, workspaceId, validationId, [questionKey])
  )[0] as ValidationAnswer;
}
