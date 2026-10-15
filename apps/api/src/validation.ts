import {
  assumptionContent,
  assumptions,
  competitorContent,
  competitors,
  costItemContent,
  costItems,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  economicsInputContent,
  economicsInputs,
  evidenceLinks,
  loadTemplateSections,
  researchLogContent,
  researchLogEntries,
  validationAnswerContent,
  validationAnswers,
  validations,
} from "@moonx/db";
import { hasText, isQuestionShown, rowHasValue } from "@moonx/domain";
import { i18n } from "@moonx/i18n";
import {
  type Classification,
  type Confidence,
  countChars,
  economicsFieldSchema,
  errorBodySchema,
  evidenceCreateSchema,
  evidenceRemovalSchema,
  evidenceRemoveQuerySchema,
  evidenceResultSchema,
  type Fau,
  TEXT_LIMITS,
  type TemplateQuestion,
  type TemplateSection,
  uuidSchema,
  type ValidationAnswer,
  type ValidationAnswerSave,
  type ValidationHome,
  validationAnswerParamsSchema,
  validationAnswerSaveSchema,
  validationAnswerSchema,
  validationHomeSchema,
  validationQuestionsParamsSchema,
  validationQuestionsSchema,
} from "@moonx/schemas";
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin, ScopeLocator } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  type HistoryChange,
  type HistoryOperation,
  withHistory,
} from "./history";
import {
  decisionSummaries,
  findIdea,
  ideaDetail,
  ideaKeyMetrics,
  loadIdeaContexts,
  newestDecisionFirst,
  planSummaries,
  templateRef,
} from "./idea-views";
import {
  checkKeyedLockVersion,
  checkLockVersion,
  createKeyedItem,
  type LockClaim,
} from "./lock";
import { type Scope, writeInScope } from "./scope";
import { loadUserRefs } from "./user-refs";
import {
  activeEvidenceCount,
  attachedEvidenceIds,
  classificationOf,
  type EvidenceRef,
  loadCommentCounts,
  loadEvidence,
} from "./validation-items";

type Executor = Database | DatabaseTransaction;

/** How many decisions 13 lists before "See all" (design-spec 6.1). */
const HOME_DECISIONS = 5;

/** The question types 11 answers in a validation (design-spec 6.2). */
const ANSWERABLE = new Set<TemplateQuestion["answerType"]>([
  "long_text",
  "short_text",
  "choice",
]);

async function validationTemplate(
  db: Executor,
  validationId: string,
): Promise<{ templateVersionId: string; sections: TemplateSection[] }> {
  const [validation] = await db
    .select({ templateVersionId: validations.templateVersionId })
    .from(validations)
    .where(eq(validations.id, validationId));
  if (validation === undefined)
    throw new Error(`No validation ${validationId}`);
  const sections =
    (await loadTemplateSections(db, [validation.templateVersionId])).get(
      validation.templateVersionId,
    ) ?? [];
  return { templateVersionId: validation.templateVersionId, sections };
}

const findQuestion = (sections: readonly TemplateSection[], key: string) =>
  sections.flatMap((section) => section.questions).find((q) => q.key === key);

/** The answers of a validation as `isQuestionShown` reads them. */
async function shownAnswers(db: Executor, validationId: string) {
  const rows = await db
    .select()
    .from(validationAnswers)
    .where(eq(validationAnswers.validationId, validationId));
  return {
    rows: new Map(rows.map((row) => [row.questionKey, row])),
    inputs: new Map(rows.map((row) => [row.questionKey, { text: row.text }])),
  };
}

/**
 * The answers to `questions` of `validationId` (SDD 5.7 ValidationAnswer), one per
 * question: an unanswered one is empty at version 0.
 */
async function answerViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  questions: readonly TemplateQuestion[],
): Promise<ValidationAnswer[]> {
  const { rows, inputs } = await shownAnswers(db, validationId);
  const refs = questions.map((question) => ({
    type: "validation_answer" as const,
    id: validationId,
    key: question.key,
  }));
  const evidence = await loadEvidence(db, validationId, refs);
  const comments = await loadCommentCounts(db, refs);
  const users = await loadUserRefs(
    db,
    [...rows.values()].flatMap((row) =>
      row.updatedById === null ? [] : [row.updatedById],
    ),
    workspaceId,
  );
  return questions.map((question, index) => {
    const ref = refs[index] as EvidenceRef;
    const row = rows.get(question.key);
    const text = row?.text ?? null;
    return {
      questionKey: question.key,
      text,
      classification: classificationOf(
        {
          hasValue: hasText(text),
          fau: row?.fau ?? null,
          confidence: row?.confidence ?? null,
        },
        evidence(ref),
      ),
      hidden: !isQuestionShown(question, inputs),
      commentCount: comments(ref),
      lockVersion: row?.lockVersion ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      updatedBy:
        row?.updatedById == null ? null : (users.get(row.updatedById) ?? null),
    };
  });
}

/** The title of a section of 13 with its number (design-spec 6.1). */
function sectionTitle(key: string, sections: readonly TemplateSection[]) {
  if (key === "01" || key === "02" || key === "10") {
    const title = sections.find((section) => section.key === key)?.title;
    return title === undefined ? key : `${key} ${title}`;
  }
  return i18n.t(`validation:sections.${key as "03"}`);
}

/**
 * The answer to `key` as 13 and 19 quote it: its text when the question is in the
 * pinned version and shown, and not blank.
 */
export function quotedAnswer(
  state: {
    sections: readonly TemplateSection[];
    answers: readonly { questionKey: string; text: string | null }[];
  },
  key: string,
): string | null {
  const question = findQuestion(state.sections, key);
  if (question === undefined) return null;
  const answers = new Map(
    state.answers.map((answer) => [answer.questionKey, answer]),
  );
  if (!isQuestionShown(question, answers)) return null;
  const text = answers.get(key)?.text ?? null;
  return hasText(text) ? text : null;
}

/**
 * The question `key` of the pinned version, as one V3 save may answer it: its type
 * takes a text (design-spec 6.2), the text fits the type and is one of a choice's
 * choices (6.0.8), and the F/A/U sent follows 6.0.3.
 *
 * @throws {ApiError} QUESTION_NOT_FOUND, NOT_EDITABLE, INVALID_CHOICE,
 * CONFIDENCE_REQUIRED or VALIDATION_FAILED
 */
function answerableQuestion(
  sections: readonly TemplateSection[],
  key: string,
  body: ValidationAnswerSave,
): TemplateQuestion {
  const question = findQuestion(sections, key);
  if (question === undefined) {
    throw new ApiError(
      "QUESTION_NOT_FOUND",
      "The pinned template version has no such question",
    );
  }
  if (!ANSWERABLE.has(question.answerType)) {
    throw new ApiError("NOT_EDITABLE", "This question takes no answer");
  }
  const { text, classification: sent } = body;
  if (
    typeof text === "string" &&
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
    typeof text === "string" &&
    question.options?.kind === "choice" &&
    !question.options.choices.includes(text)
  ) {
    throw new ApiError("INVALID_CHOICE", "Not one of the choices");
  }
  if (sent === undefined) return question;
  if (sent.fau !== null && !question.hasFau) {
    throw invalid(
      "classification.fau",
      "invalid_value",
      "This question takes no F/A/U",
    );
  }
  if (sent.fau === "assumption" && sent.confidence == null) {
    throw new ApiError(
      "CONFIDENCE_REQUIRED",
      "An Assumption needs a confidence",
    );
  }
  if (sent.fau !== "assumption" && sent.confidence != null) {
    throw invalid(
      "classification.confidence",
      "invalid_value",
      "Only an Assumption has a confidence",
    );
  }
  return question;
}

/** V1: the hub of one idea's validation (SDD 5.7 ValidationHome). */
async function validationHome(
  db: Database,
  scope: Scope,
): Promise<ValidationHome> {
  const ideaId = scope.ideaId as string;
  const row = await findIdea(db, ideaId);
  if (row === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [row], scope.role);
  if (context === undefined) throw new Error(`No context for ${ideaId}`);
  const { loaded, evaluation, plans } = context;
  const decisions = await db
    .select()
    .from(decisionLogEntries)
    .where(
      and(
        eq(decisionLogEntries.ideaId, ideaId),
        eq(decisionLogEntries.kind, "validation_decision"),
      ),
    )
    .orderBy(...newestDecisionFirst)
    .limit(HOME_DECISIONS);
  const livePlans = plans.filter((plan) => !plan.archived);
  return {
    validationId: loaded.validationId,
    idea: await ideaDetail(db, context),
    template: await templateRef(db, loaded.templateVersionId),
    summary: {
      customer: quotedAnswer(loaded.state, "V.01.WHO"),
      problem: quotedAnswer(loaded.state, "V.01.PROBLEM"),
      solution: hasText(row.proposedSolution) ? row.proposedSolution : null,
      marketType: quotedAnswer(loaded.state, "V.02.OCEAN"),
    },
    keyMetrics: ideaKeyMetrics(evaluation.keyMetrics),
    economicsWarnings: evaluation.economics.warnings,
    nextSteps: evaluation.nextSteps,
    checks: evaluation.checks,
    fau: evaluation.fau,
    sections: evaluation.sections.map((section) => ({
      ...section,
      title: sectionTitle(section.key, loaded.state.sections),
    })),
    decisions: await decisionSummaries(db, scope.workspaceId, decisions),
    plans: await planSummaries(db, scope.workspaceId, livePlans),
    archivedPlanCount: plans.length - livePlans.length,
    canAddPlan: row.latestDecision === "proceed" && row.archivedAt === null,
  };
}

/** The 422 VALIDATION_FAILED of one input the body schema could not judge alone. */
const invalid = (path: string, code: string, message: string) =>
  new ApiError("VALIDATION_FAILED", message, {
    details: [{ path, code, message }],
  });

/** An item evidence is attached to, locked for the change (ADR-019). */
interface LockedTarget {
  ref: EvidenceRef;
  /** The stored version; null for an answer or number not saved yet. */
  row: {
    lockVersion: number;
    updatedAt: Date;
    updatedById: string | null;
  } | null;
  /** Whether the item takes F/A/U: answers, numbers and cost rows do. */
  hasFau: boolean;
  hasValue: boolean;
  fau: Fau | null;
  confidence: Confidence | null;
  /** The history content of the item with `fau` and the evidence `evidenceIds`. */
  content(
    state: { fau: Fau | null; confidence: Confidence | null },
    evidenceIds: readonly string[],
  ): unknown;
  /**
   * Saves the first version of an answer or number with nothing in it yet. Rows have
   * none: they exist before evidence can name them.
   */
  create?: (at: Date, userId: string) => Promise<void>;
  /** Raises the version, and sets F/A/U when given. */
  bump(
    state: { fau: Fau | null; confidence: Confidence | null },
    at: Date,
    userId: string,
  ): Promise<void>;
}

const notHere = () =>
  new ApiError("NOT_FOUND", "No such item in this validation");

/**
 * Locks the item `target` of `validationId` for an evidence change (V4, V5).
 *
 * @param sections The pinned version's sections, whose questions an answer must be one
 * of; null to take any answer, as removing evidence does (V5): a migration may have
 * hidden the question since the evidence was attached.
 * @throws {ApiError} NOT_FOUND for a row that is not in the validation or deleted, or an
 * answer or number of another validation; QUESTION_NOT_FOUND for a question the pinned
 * version lacks; VALIDATION_FAILED for a key that names no question or number
 */
async function lockTarget(
  tx: DatabaseTransaction,
  validationId: string,
  sections: readonly TemplateSection[] | null,
  target: EvidenceRef,
  workspaceId: string,
): Promise<LockedTarget> {
  const versionOf = (row: {
    lockVersion: number;
    updatedAt: Date;
    updatedById: string | null;
  }) => ({
    lockVersion: row.lockVersion,
    updatedAt: row.updatedAt,
    updatedById: row.updatedById,
  });
  const bumped = (lockVersion: number, at: Date, userId: string) => ({
    lockVersion: lockVersion + 1,
    updatedAt: at,
    updatedById: userId,
  });
  // Competitors and assumptions take evidence but no F/A/U (design-spec 6.0.3).
  const withoutFau = {
    hasFau: false,
    hasValue: true,
    fau: null,
    confidence: null,
  };
  switch (target.type) {
    case "validation_answer": {
      if (target.id !== validationId) throw notHere();
      const key = target.key ?? "";
      if (key === "") throw invalid("target.key", "invalid_type", "Required");
      const question = sections === null ? null : findQuestion(sections, key);
      if (question === undefined) {
        throw new ApiError(
          "QUESTION_NOT_FOUND",
          "The pinned template version has no such question",
        );
      }
      const [row] = await tx
        .select()
        .from(validationAnswers)
        .where(
          and(
            eq(validationAnswers.validationId, validationId),
            eq(validationAnswers.questionKey, key),
          ),
        )
        .for("update");
      return {
        ref: { type: target.type, id: validationId, key },
        row: row === undefined ? null : versionOf(row),
        hasFau: question?.hasFau ?? true,
        hasValue: hasText(row?.text ?? null),
        fau: row?.fau ?? null,
        confidence: row?.confidence ?? null,
        content: (state, ids) =>
          validationAnswerContent({ text: row?.text ?? null, ...state }, ids),
        create: async (at, userId) => {
          await createKeyedItem(
            tx,
            async () =>
              (
                await tx
                  .insert(validationAnswers)
                  .values({
                    validationId,
                    questionKey: key,
                    lockVersion: 1,
                    updatedById: userId,
                    createdAt: at,
                    updatedAt: at,
                  })
                  .onConflictDoNothing()
                  .returning({ id: validationAnswers.id })
              )[0],
            async () => {
              const [stored] = await tx
                .select()
                .from(validationAnswers)
                .where(
                  and(
                    eq(validationAnswers.validationId, validationId),
                    eq(validationAnswers.questionKey, key),
                  ),
                );
              if (stored === undefined) throw new Error("No answer row");
              return {
                ...versionOf(stored),
                value: validationAnswerContent(stored, []),
              };
            },
            workspaceId,
          );
        },
        bump: async (state, at, userId) => {
          await tx
            .update(validationAnswers)
            .set({ ...state, ...bumped(row?.lockVersion ?? 0, at, userId) })
            .where(
              and(
                eq(validationAnswers.validationId, validationId),
                eq(validationAnswers.questionKey, key),
              ),
            );
        },
      };
    }
    case "economics_input": {
      if (target.id !== validationId) throw notHere();
      const field = economicsFieldSchema.safeParse(target.key);
      if (!field.success) {
        throw invalid("target.key", "invalid_value", "Not a number of 18");
      }
      const key = field.data;
      const [row] = await tx
        .select()
        .from(economicsInputs)
        .where(
          and(
            eq(economicsInputs.validationId, validationId),
            eq(economicsInputs.fieldKey, key),
          ),
        )
        .for("update");
      return {
        ref: { type: target.type, id: validationId, key },
        row: row === undefined ? null : versionOf(row),
        hasFau: true,
        hasValue: row?.value != null,
        fau: row?.fau ?? null,
        confidence: row?.confidence ?? null,
        content: (state, ids) =>
          economicsInputContent({ value: row?.value ?? null, ...state }, ids),
        create: async (at, userId) => {
          await createKeyedItem(
            tx,
            async () =>
              (
                await tx
                  .insert(economicsInputs)
                  .values({
                    validationId,
                    fieldKey: key,
                    lockVersion: 1,
                    updatedById: userId,
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
                    eq(economicsInputs.fieldKey, key),
                  ),
                );
              if (stored === undefined) throw new Error("No number row");
              return {
                ...versionOf(stored),
                value: economicsInputContent(stored, []),
              };
            },
            workspaceId,
          );
        },
        bump: async (state, at, userId) => {
          await tx
            .update(economicsInputs)
            .set({ ...state, ...bumped(row?.lockVersion ?? 0, at, userId) })
            .where(
              and(
                eq(economicsInputs.validationId, validationId),
                eq(economicsInputs.fieldKey, key),
              ),
            );
        },
      };
    }
    case "cost_item": {
      const [row] = await tx
        .select()
        .from(costItems)
        .where(
          and(
            eq(costItems.id, target.id),
            eq(costItems.validationId, validationId),
            isNull(costItems.deletedAt),
          ),
        )
        .for("update");
      if (row === undefined) throw notHere();
      return {
        ref: { type: target.type, id: row.id },
        row: versionOf(row),
        hasFau: true,
        hasValue: rowHasValue(row),
        fau: row.fau,
        confidence: row.confidence,
        content: (state, ids) => costItemContent({ ...row, ...state }, ids),
        bump: async (state, at, userId) => {
          await tx
            .update(costItems)
            .set({ ...state, ...bumped(row.lockVersion, at, userId) })
            .where(eq(costItems.id, row.id));
        },
      };
    }
    case "competitor": {
      const [row] = await tx
        .select()
        .from(competitors)
        .where(
          and(
            eq(competitors.id, target.id),
            eq(competitors.validationId, validationId),
            isNull(competitors.deletedAt),
          ),
        )
        .for("update");
      if (row === undefined) throw notHere();
      return {
        ...withoutFau,
        ref: { type: target.type, id: row.id },
        row: versionOf(row),
        content: (_state, ids) => competitorContent(row, ids),
        bump: async (_state, at, userId) => {
          await tx
            .update(competitors)
            .set(bumped(row.lockVersion, at, userId))
            .where(eq(competitors.id, row.id));
        },
      };
    }
    case "assumption": {
      const [row] = await tx
        .select()
        .from(assumptions)
        .where(
          and(
            eq(assumptions.id, target.id),
            eq(assumptions.validationId, validationId),
            isNull(assumptions.deletedAt),
          ),
        )
        .for("update");
      if (row === undefined) throw notHere();
      return {
        ...withoutFau,
        ref: { type: target.type, id: row.id },
        row: versionOf(row),
        content: (_state, ids) => assumptionContent(row, ids),
        bump: async (_state, at, userId) => {
          await tx
            .update(assumptions)
            .set(bumped(row.lockVersion, at, userId))
            .where(eq(assumptions.id, row.id));
        },
      };
    }
  }
}

/** The classification of a locked item after a change to its evidence or F/A/U. */
async function classificationAfter(
  db: Executor,
  validationId: string,
  target: LockedTarget,
  state: { fau: Fau | null; confidence: Confidence | null },
): Promise<Classification> {
  const evidence = await loadEvidence(db, validationId, [target.ref]);
  return classificationOf(
    { hasValue: target.hasValue, ...state },
    evidence(target.ref),
  );
}

/**
 * Checks the version a change to `target` claims, keyed items by their own rule. An
 * item not saved yet has no version to lose.
 */
async function checkTargetVersion(
  tx: DatabaseTransaction,
  target: LockedTarget,
  value: unknown,
  claim: LockClaim,
  workspaceId: string,
) {
  if (target.row === null) return;
  const check =
    target.create === undefined ? checkLockVersion : checkKeyedLockVersion;
  await check(tx, { ...target.row, value }, claim, workspaceId);
}

/** Finds the validation of an evidence link that is attached (V5). */
const evidenceLocator: ScopeLocator = async ({ params, db }) => {
  const id = params.evidenceId ?? "";
  if (!uuidSchema.safeParse(id).success) return null;
  const [link] = await db
    .select({ validationId: evidenceLinks.validationId })
    .from(evidenceLinks)
    .where(and(eq(evidenceLinks.id, id), isNull(evidenceLinks.deletedAt)));
  return link === undefined ? null : { validationId: link.validationId };
};

/** What the validation routes need from the app. */
export interface ValidationRoutesOptions {
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

/** V1–V5 (SDD 5.7): the validation hub, its questions, answers and evidence. */
export function validationRoutes({ access, db, now }: ValidationRoutesOptions) {
  const operation = (
    request: Request,
    scope: Scope,
    validationId: string,
    userId: string,
    at: Date,
  ): HistoryOperation => ({
    container: {
      type: "validation",
      id: validationId,
      workspaceId: scope.workspaceId,
    },
    changedById: userId,
    source: "manual",
    batchId: null,
    client: requestContext(request).client,
    at,
  });

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/ideas/:ideaId/validation",
      ({ scope }) => validationHome(db, scope),
      {
        scoped: { to: "ideaId", need: "read" },
        response: { 200: validationHomeSchema, ...readErrors },
        detail: {
          summary: "V1 The validation hub of an idea (13)",
          description:
            "Checks, Next steps, the F/A/U breakdown and key metrics are calculated by packages/domain. Links a caller cannot enter (a Viewer's 19 and new research log entries, an archived idea's) are null.",
        },
      },
    )
    .get(
      "/api/v1/validations/:validationId/questions/:sectionKey",
      async ({ scope, params }) => {
        const { sections } = await validationTemplate(db, params.validationId);
        const section = ["01", "02", "10"].includes(params.sectionKey)
          ? sections.find((s) => s.key === params.sectionKey)
          : undefined;
        if (section === undefined) {
          throw new ApiError("NOT_FOUND", "No such question section");
        }
        return {
          section,
          answers: await answerViews(
            db,
            scope.workspaceId,
            params.validationId,
            section.questions,
          ),
        };
      },
      {
        scoped: { to: "validationId", need: "read" },
        params: validationQuestionsParamsSchema,
        response: { 200: validationQuestionsSchema, ...readErrors },
        detail: {
          summary: "V2 The questions of a section (11)",
          description:
            "sectionKey is 01, 02 or 10. One answer per question, unanswered and hidden ones included.",
        },
      },
    )
    .put(
      "/api/v1/validations/:validationId/answers/:questionKey",
      async ({ scope, params, body, caller, request }) => {
        const { validationId, questionKey } = params;
        const at = new Date(now());
        const question = await writeInScope(db, scope, at, async (tx) => {
          // Read under the idea's lock, which a template migration takes too.
          const { sections } = await validationTemplate(tx, validationId);
          const question = answerableQuestion(sections, questionKey, body);
          const text = body.text;
          const sent = body.classification;
          const [current] = await tx
            .select()
            .from(validationAnswers)
            .where(
              and(
                eq(validationAnswers.validationId, validationId),
                eq(validationAnswers.questionKey, questionKey),
              ),
            )
            .for("update");
          const nextText = text === undefined ? (current?.text ?? null) : text;
          let fau = sent === undefined ? (current?.fau ?? null) : sent.fau;
          let confidence =
            sent === undefined
              ? (current?.confidence ?? null)
              : (sent.confidence ?? null);
          // Clearing the value clears F/A/U, Unknown aside (design-spec 6.0.3).
          if (!hasText(nextText) && (fau === "fact" || fau === "assumption")) {
            if (sent !== undefined) {
              throw invalid(
                "classification.fau",
                "invalid_value",
                "A Fact or Assumption needs an answer",
              );
            }
            fau = null;
            confidence = null;
          }
          const ref = {
            type: "validation_answer" as const,
            id: validationId,
            key: questionKey,
          };
          const evidenceIds = await attachedEvidenceIds(tx, validationId, ref);
          const before =
            current === undefined
              ? null
              : validationAnswerContent(current, evidenceIds);
          const after = validationAnswerContent(
            { text: nextText, fau, confidence },
            evidenceIds,
          );
          const unchanged =
            current === undefined
              ? after.text === null && after.fau === null
              : before?.text === after.text &&
                before?.fau === after.fau &&
                before?.confidence === after.confidence;
          if (unchanged) return question;
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
            fau === "fact" &&
            current?.fau !== "fact" &&
            (await activeEvidenceCount(tx, validationId, ref)) === 0
          ) {
            throw new ApiError(
              "FACT_REQUIRES_EVIDENCE",
              "A Fact needs evidence: attach it through V4 with setFact",
            );
          }
          const values = { text: nextText, fau, confidence };
          if (current === undefined) {
            await createKeyedItem(
              tx,
              async () =>
                (
                  await tx
                    .insert(validationAnswers)
                    .values({
                      validationId,
                      questionKey,
                      ...values,
                      lockVersion: 1,
                      updatedById: caller.id,
                      createdAt: at,
                      updatedAt: at,
                    })
                    .onConflictDoNothing()
                    .returning({ id: validationAnswers.id })
                )[0],
              async () => {
                const [stored] = await tx
                  .select()
                  .from(validationAnswers)
                  .where(
                    and(
                      eq(validationAnswers.validationId, validationId),
                      eq(validationAnswers.questionKey, questionKey),
                    ),
                  );
                if (stored === undefined) throw new Error("No answer row");
                return {
                  value: validationAnswerContent(stored, evidenceIds),
                  lockVersion: stored.lockVersion,
                  updatedAt: stored.updatedAt,
                  updatedById: stored.updatedById,
                };
              },
              scope.workspaceId,
            );
          } else {
            await tx
              .update(validationAnswers)
              .set({
                ...values,
                lockVersion: current.lockVersion + 1,
                updatedAt: at,
                updatedById: caller.id,
              })
              .where(eq(validationAnswers.id, current.id));
          }
          await withHistory(
            tx,
            operation(request, scope, validationId, caller.id, at),
            async () => ({
              target: ref,
              action: current === undefined ? "create" : "update",
              before,
              after,
            }),
          );
          return question;
        });
        const [answer] = await answerViews(
          db,
          scope.workspaceId,
          validationId,
          [question],
        );
        if (answer === undefined) throw new Error("No answer view");
        return answer;
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        params: validationAnswerParamsSchema,
        body: validationAnswerSaveSchema,
        parse: "json",
        response: { 200: validationAnswerSchema, ...writeErrors },
        detail: {
          summary: "V3 Save an answer and its F/A/U",
          description:
            "Creates the answer at version 1 on its first save. Clearing the text clears F/A/U except Unknown. A Fact needs active evidence (V4 setFact), an Assumption a confidence.",
        },
      },
    )
    .post(
      "/api/v1/validations/:validationId/evidence",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const result = await writeInScope(db, scope, at, async (tx) => {
          // Read under the idea's lock, which a template migration takes too.
          const { sections } = await validationTemplate(tx, validationId);
          const target = await lockTarget(
            tx,
            validationId,
            sections,
            {
              type: body.target.type,
              id: body.target.id,
              key: body.target.key,
            },
            scope.workspaceId,
          );
          const beforeIds = await attachedEvidenceIds(
            tx,
            validationId,
            target.ref,
          );
          const current = { fau: target.fau, confidence: target.confidence };
          await checkTargetVersion(
            tx,
            target,
            target.content(current, beforeIds),
            body,
            scope.workspaceId,
          );
          if (body.setFact === true && (!target.hasFau || !target.hasValue)) {
            throw invalid(
              "setFact",
              "invalid_value",
              "Only an item with a value and F/A/U can become a Fact",
            );
          }
          if (body.researchLogEntryId !== undefined) {
            const [log] = await tx
              .select({ id: researchLogEntries.id })
              .from(researchLogEntries)
              .where(
                and(
                  eq(researchLogEntries.id, body.researchLogEntryId),
                  eq(researchLogEntries.validationId, validationId),
                  isNull(researchLogEntries.deletedAt),
                ),
              );
            if (log === undefined) {
              throw invalid(
                "researchLogEntryId",
                "invalid_value",
                "No such research log entry in this validation",
              );
            }
            const [twice] = await tx
              .select({ id: evidenceLinks.id })
              .from(evidenceLinks)
              .where(
                and(
                  eq(evidenceLinks.validationId, validationId),
                  eq(evidenceLinks.targetType, target.ref.type),
                  eq(evidenceLinks.targetId, target.ref.id),
                  target.ref.key == null
                    ? isNull(evidenceLinks.targetKey)
                    : eq(evidenceLinks.targetKey, target.ref.key),
                  eq(evidenceLinks.researchLogEntryId, log.id),
                  isNull(evidenceLinks.deletedAt),
                ),
              );
            if (twice !== undefined) {
              throw invalid(
                "researchLogEntryId",
                "invalid_value",
                "This research log entry is already evidence of the item",
              );
            }
          }
          const changes: HistoryChange[] = [];
          let logId = body.researchLogEntryId ?? null;
          if (body.newResearchLog !== undefined) {
            const input = body.newResearchLog;
            const [log] = await tx
              .insert(researchLogEntries)
              .values({
                validationId,
                observedOn: input.observedOn ?? null,
                topic: input.topic,
                observation: input.observation ?? null,
                sourceType: input.sourceType ?? null,
                sourceUrl: input.sourceUrl ?? null,
                supportsChecks: input.supportsChecks ?? [],
                supportsNote: input.supportsNote ?? null,
                createdById: caller.id,
                updatedById: caller.id,
                createdAt: at,
                updatedAt: at,
              })
              .returning();
            if (log === undefined)
              throw new Error("research log insert failed");
            logId = log.id;
            changes.push({
              target: { type: "research_log_entry", id: log.id },
              action: "create",
              before: null,
              after: researchLogContent(log),
            });
          }
          if (target.row === null) {
            if (target.create === undefined)
              throw new Error(`${target.ref.type} ${target.ref.id} has no row`);
            await target.create(at, caller.id);
          }
          const [link] = await tx
            .insert(evidenceLinks)
            .values({
              workspaceId: scope.workspaceId,
              validationId,
              targetType: target.ref.type,
              targetId: target.ref.id,
              targetKey: target.ref.key ?? null,
              researchLogEntryId: logId,
              url: logId === null ? (body.url ?? null) : null,
              note: body.note ?? null,
              createdById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: evidenceLinks.id });
          if (link === undefined) throw new Error("evidence insert failed");
          const next =
            body.setFact === true
              ? { fau: "fact" as const, confidence: null }
              : current;
          if (target.row !== null) await target.bump(next, at, caller.id);
          changes.push({
            target: target.ref,
            action: target.row === null ? "create" : "update",
            before:
              target.row === null ? null : target.content(current, beforeIds),
            after: target.content(next, [...beforeIds, link.id]),
          });
          await withHistory(
            tx,
            operation(request, scope, validationId, caller.id, at),
            async () => changes,
          );
          return {
            linkId: link.id,
            target,
            next,
            lockVersion: (target.row?.lockVersion ?? 0) + 1,
          };
        });
        const classification = await classificationAfter(
          db,
          validationId,
          result.target,
          result.next,
        );
        const evidence = classification.evidence.find(
          (item) => item.id === result.linkId,
        );
        if (evidence === undefined) throw new Error("The evidence is gone");
        return status(201, {
          evidence,
          classification,
          lockVersion: result.lockVersion,
        });
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: evidenceCreateSchema,
        parse: "json",
        response: { 201: evidenceResultSchema, ...writeErrors },
        detail: {
          summary: "V4 Attach evidence (M2)",
          description:
            "One of researchLogEntryId, newResearchLog or url. lockVersion is the item's; attaching raises it. setFact makes an item with a value a Fact. Competitors and assumptions take evidence without F/A/U.",
        },
      },
    )
    .delete(
      "/api/v1/evidence/:evidenceId",
      async ({ scope, params, query, caller, request }) => {
        const at = new Date(now());
        const result = await writeInScope(db, scope, at, async (tx) => {
          const [link] = await tx
            .select()
            .from(evidenceLinks)
            .where(eq(evidenceLinks.id, params.evidenceId))
            .for("update");
          if (link === undefined || link.deletedAt !== null) {
            throw new ApiError("NOT_FOUND", "The evidence is already removed");
          }
          const target = await lockTarget(
            tx,
            link.validationId,
            null,
            {
              type: link.targetType,
              id: link.targetId,
              key: link.targetKey,
            },
            scope.workspaceId,
          );
          if (target.row === null) {
            throw new Error(`Evidence ${link.id} is on an item never saved`);
          }
          const beforeIds = await attachedEvidenceIds(
            tx,
            link.validationId,
            target.ref,
          );
          const current = { fau: target.fau, confidence: target.confidence };
          const claim: LockClaim = {
            lockVersion: query.lockVersion,
            force: query.force,
          };
          await checkTargetVersion(
            tx,
            target,
            target.content(current, beforeIds),
            claim,
            scope.workspaceId,
          );
          await tx
            .update(evidenceLinks)
            .set({ deletedAt: at, updatedAt: at })
            .where(eq(evidenceLinks.id, link.id));
          // A Fact whose last counting evidence goes becomes Unclassified, never a
          // "Fact · No evidence" (design-spec 6.0.3 M2).
          const next =
            target.fau === "fact" &&
            (await activeEvidenceCount(tx, link.validationId, target.ref)) === 0
              ? { fau: null, confidence: null }
              : current;
          await target.bump(next, at, caller.id);
          await withHistory(
            tx,
            operation(request, scope, link.validationId, caller.id, at),
            async () => ({
              target: target.ref,
              action: "update",
              before: target.content(current, beforeIds),
              after: target.content(
                next,
                beforeIds.filter((id) => id !== link.id),
              ),
            }),
          );
          return {
            validationId: link.validationId,
            target,
            next,
            lockVersion: target.row.lockVersion + 1,
          };
        });
        return {
          classification: await classificationAfter(
            db,
            result.validationId,
            result.target,
            result.next,
          ),
          lockVersion: result.lockVersion,
        };
      },
      {
        scoped: { to: evidenceLocator, need: "writeUnarchived" },
        query: evidenceRemoveQuerySchema,
        response: { 200: evidenceRemovalSchema, ...writeErrors },
        detail: {
          summary: "V5 Remove evidence",
          description:
            "lockVersion is the version of the item the evidence is on; removing raises it. Removing a Fact's last counting evidence makes it Unclassified.",
        },
      },
    );
}
