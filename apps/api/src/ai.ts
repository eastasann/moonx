import {
  type Database,
  type DatabaseTransaction,
  ideas,
  loadTemplateSections,
  planAnswerContent,
  planAnswers,
  researchLogEntries,
  type selfAnalyses,
  selfAnalysisAnswerContent,
  selfAnalysisAnswers,
  templateQuestions,
  templateVersions,
  users,
  validationAnswerContent,
  validationAnswers,
  validations,
  workspaces,
} from "@moonx/db";
import {
  type AiAnswerInput,
  type AiScope,
  buildAiExport,
  hasText,
  isImportable,
  isQuestionShown,
  type PlanReferenceInput,
  readChoice,
  scopeSections,
  type ValidationReferenceInput,
} from "@moonx/domain";
import {
  type AiEvidence,
  type AiExportQuery,
  aiExportQuerySchema,
  aiExportSchema,
  type Confidence,
  countChars,
  type Evidence,
  errorBodySchema,
  type Fau,
  type ImportChange,
  type ImportContext,
  importApplyResultSchema,
  importApplySchema,
  importContextQuerySchema,
  importContextSchema,
  type PlanTableRow,
  type Role,
  type TargetRef,
  TEXT_LIMITS,
  type TemplateKind,
  type TemplateQuestion,
  type TemplateSection,
} from "@moonx/schemas";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin, Caller, ScopeLocator } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  type HistoryChange,
  type HistoryContainer,
  type HistoryOperation,
  withHistory,
} from "./history";
import { findIdea, loadIdeaContexts } from "./idea-views";
import { lockActiveCaller } from "./lock";
import { planContentTime, requirePlan } from "./plan-views";
import type { Limit, RateLimiter } from "./rate-limit";
import type { Scope, ScopeRef } from "./scope";
import { writeInScope } from "./scope";
import {
  findSelfAnalysis,
  lockSelfAnalysis,
  notOpenedYet,
  startIfAnswered,
} from "./self-analysis";
import { loadUserRefs } from "./user-refs";
import {
  classificationOf,
  type ItemEvidence,
  loadEvidence,
} from "./validation-items";
import {
  liveAssumptions,
  liveCompetitors,
  liveRisks,
} from "./validation-lists";
import { invalid, sameContent } from "./validation-writes";

// X1–X3 (SDD 5.10): the AI round trip of 24 and 25 for the caller's self-analysis, a
// validation or a plan. The formats and the reading of a reply are packages/domain's.

type Executor = Database | DatabaseTransaction;
type SelfAnalysisRow = typeof selfAnalyses.$inferSelect;

/** X1 and X3 together, per user (SDD 7.2). X2 only reads and is not counted. */
export const AI_LIMIT: Limit = {
  name: "ai",
  max: 60,
  windowMs: 60 * 60 * 1000,
};

/** The resource of a validation or plan; none for the caller's own self-analysis. */
const refOf = (kind: unknown, id: unknown): ScopeRef | null => {
  const value = typeof id === "string" ? id : "";
  if (kind === "validation") return { validationId: value };
  if (kind === "business_plan") return { planId: value };
  return null;
};

const exportLocator: ScopeLocator = ({ query }) =>
  refOf(query.source, query.id);
const contextLocator: ScopeLocator = ({ query }) =>
  refOf(query.target, query.id);
const applyLocator: ScopeLocator = ({ body }) => {
  const { target } = body as { target: { type: TemplateKind; id?: string } };
  return refOf(target.type, target.id);
};

/** An answer as stored, of whatever it belongs to. */
interface StoredAnswer {
  questionKey: string;
  text: string | null;
  /** Self-analysis amount-with-reason answers. */
  amount: number | null;
  /** Validation answers. */
  fau: Fau | null;
  confidence: Confidence | null;
  /** Plan table sub-items. */
  rows: PlanTableRow[] | null;
  lockVersion: number;
  updatedAt: Date;
  updatedById: string | null;
}

/** Where an export reads from and an import writes to. */
interface AiTarget {
  kind: TemplateKind;
  /** The self-analysis, validation or plan. */
  id: string;
  /** X2 `target.name`: the self-analysis's owner, the validation's idea, the plan. */
  name: string;
  workspaceId: string | null;
  ideaId: string | null;
  ideaName: string | null;
  planName: string | null;
  currency: string;
  archived: boolean;
  templateVersionId: string;
  sections: TemplateSection[];
  /** Every stored answer by question ID, those a migration hid included. */
  answers: Map<string, StoredAnswer>;
}

/** `value`, which a row the request already found guarantees. */
function required<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new Error(`No ${what}`);
  return value;
}

const hasValue = (answer: StoredAnswer) =>
  hasText(answer.text) || answer.amount !== null;

async function templateSectionsOf(db: Executor, versionId: string) {
  return (await loadTemplateSections(db, [versionId])).get(versionId) ?? [];
}

/**
 * The answers of a target by question ID. With `lock`, under `FOR UPDATE`, as an import
 * reads what it is about to write.
 */
async function storedAnswers(
  db: Executor,
  kind: TemplateKind,
  id: string,
  lock: boolean,
): Promise<Map<string, StoredAnswer>> {
  const none = { amount: null, fau: null, confidence: null, rows: null };
  let rows: StoredAnswer[];
  if (kind === "self_analysis") {
    const query = db
      .select()
      .from(selfAnalysisAnswers)
      .where(eq(selfAnalysisAnswers.selfAnalysisId, id));
    rows = (lock ? await query.for("update") : await query).map((row) => ({
      ...none,
      ...row,
    }));
  } else if (kind === "validation") {
    const query = db
      .select()
      .from(validationAnswers)
      .where(eq(validationAnswers.validationId, id));
    rows = (lock ? await query.for("update") : await query).map((row) => ({
      ...none,
      ...row,
    }));
  } else {
    const query = db
      .select()
      .from(planAnswers)
      .where(eq(planAnswers.businessPlanId, id));
    rows = (lock ? await query.for("update") : await query).map((row) => ({
      ...none,
      ...row,
      rows: row.rows as PlanTableRow[] | null,
    }));
  }
  return new Map(rows.map((row) => [row.questionKey, row]));
}

/** The caller's self-analysis, which an import has locked when it is the one given. */
async function selfAnalysisTarget(
  db: Executor,
  analysis: SelfAnalysisRow,
  caller: Caller,
  lock: boolean,
): Promise<AiTarget> {
  const [owner] = await db
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, caller.id));
  return {
    kind: "self_analysis",
    id: analysis.id,
    name: required(owner, `user ${caller.id}`).displayName,
    workspaceId: null,
    ideaId: null,
    ideaName: null,
    planName: null,
    currency: analysis.currency,
    archived: false,
    templateVersionId: analysis.templateVersionId,
    sections: await templateSectionsOf(db, analysis.templateVersionId),
    answers: await storedAnswers(db, "self_analysis", analysis.id, lock),
  };
}

/** The validation of the idea of `scope`. */
async function validationTarget(
  db: Executor,
  scope: Scope,
  lock: boolean,
): Promise<AiTarget> {
  const ideaId = scope.ideaId as string;
  const [row] = await db
    .select({
      id: validations.id,
      templateVersionId: validations.templateVersionId,
      ideaName: ideas.name,
      currency: workspaces.currency,
    })
    .from(validations)
    .innerJoin(ideas, eq(ideas.id, validations.ideaId))
    .innerJoin(workspaces, eq(workspaces.id, ideas.workspaceId))
    .where(eq(validations.ideaId, ideaId));
  if (row === undefined) throw new Error(`Idea ${ideaId} has no validation`);
  return {
    kind: "validation",
    id: row.id,
    name: row.ideaName,
    workspaceId: scope.workspaceId,
    ideaId,
    ideaName: row.ideaName,
    planName: null,
    currency: row.currency,
    archived: scope.ideaArchived,
    templateVersionId: row.templateVersionId,
    sections: await templateSectionsOf(db, row.templateVersionId),
    answers: await storedAnswers(db, "validation", row.id, lock),
  };
}

/** The plan of `scope`. */
async function planTarget(
  db: Executor,
  scope: Scope,
  lock: boolean,
): Promise<AiTarget> {
  const plan = await requirePlan(db, scope.planId as string);
  const [idea] = await db
    .select({ name: ideas.name, currency: workspaces.currency })
    .from(ideas)
    .innerJoin(workspaces, eq(workspaces.id, ideas.workspaceId))
    .where(eq(ideas.id, plan.ideaId));
  if (idea === undefined) throw new Error(`Plan ${plan.id} has no idea`);
  return {
    kind: "business_plan",
    id: plan.id,
    name: plan.name,
    workspaceId: scope.workspaceId,
    ideaId: plan.ideaId,
    ideaName: idea.name,
    planName: plan.name,
    currency: idea.currency,
    archived: scope.ideaArchived || scope.planArchived,
    templateVersionId: plan.templateVersionId,
    sections: await templateSectionsOf(db, plan.templateVersionId),
    answers: await storedAnswers(db, "business_plan", plan.id, lock),
  };
}

/**
 * What X1 and X2 read for `kind`: the caller's self-analysis when `scope` is null, the
 * validation or plan of `scope` otherwise.
 *
 * @throws {ApiError} NOT_FOUND before S1 GET made the caller's self-analysis
 */
async function loadTarget(
  db: Executor,
  kind: TemplateKind,
  caller: Caller,
  scope: Scope | null,
): Promise<AiTarget> {
  if (scope === null) {
    const analysis = await findSelfAnalysis(db, caller.id);
    if (analysis === undefined) throw notOpenedYet();
    return selfAnalysisTarget(db, analysis, caller, false);
  }
  return kind === "validation"
    ? validationTarget(db, scope, false)
    : planTarget(db, scope, false);
}

/** The evidence of the validation's answers to `keys`, by question ID. */
async function answerEvidence(
  db: Executor,
  validationId: string,
  keys: readonly string[],
): Promise<(key: string) => ItemEvidence> {
  const ref = (key: string) => ({
    type: "validation_answer" as const,
    id: validationId,
    key,
  });
  const evidence = await loadEvidence(db, validationId, keys.map(ref));
  return (key) => evidence(ref(key));
}

/** Evidence as the export writes it: research logs not deleted, and URLs. */
const exportedEvidence = (evidence: readonly Evidence[]): AiEvidence[] =>
  evidence.flatMap((piece): AiEvidence[] => {
    if (piece.kind === "url") {
      if (piece.url === null)
        throw new Error(`URL evidence ${piece.id} has no URL`);
      return [{ type: "url", url: piece.url, note: piece.note }];
    }
    const log = piece.researchLog;
    return log === null || log.deleted
      ? []
      : [{ type: "research_log", date: log.observedOn, topic: log.topic }];
  });

/** The answers of `target` as the export reads them, with F/A/U and evidence for a validation. */
async function exportAnswers(
  db: Executor,
  target: AiTarget,
): Promise<Map<string, AiAnswerInput>> {
  const keys = [...target.answers.keys()];
  const evidence =
    target.kind === "validation"
      ? await answerEvidence(db, target.id, keys)
      : null;
  return new Map(
    [...target.answers].map(([key, row]) => {
      if (evidence === null) {
        return [key, { text: row.text, amount: row.amount }];
      }
      const item = evidence(key);
      const classification = classificationOf(
        {
          hasValue: hasText(row.text),
          fau: row.fau,
          confidence: row.confidence,
        },
        item,
      );
      return [
        key,
        {
          text: row.text,
          amount: null,
          fau: {
            fau: classification.fau,
            confidence: classification.confidence,
            state: classification.state,
          },
          evidence: exportedEvidence(item.evidence),
        },
      ];
    }),
  );
}

/** The rows of the Reference (design-spec 6.6) of a validation or plan. */
async function loadReference(
  db: Executor,
  target: AiTarget,
  role: Role,
): Promise<ValidationReferenceInput | PlanReferenceInput> {
  const idea = await findIdea(db, target.ideaId as string);
  if (idea === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [idea], role);
  if (context === undefined) throw new Error(`No context for ${idea.id}`);
  const { keyMetrics, checks } = context.evaluation;
  if (target.kind === "business_plan") {
    return {
      kind: "business_plan",
      keyMetrics,
      tables: new Map(
        [...target.answers].map(([key, row]) => [key, row.rows] as const),
      ),
    };
  }
  const validationId = target.id;
  // 14's order: newest observation first, undated last (V6).
  const logs = await db
    .select()
    .from(researchLogEntries)
    .where(
      and(
        eq(researchLogEntries.validationId, validationId),
        isNull(researchLogEntries.deletedAt),
      ),
    )
    .orderBy(
      sql`${researchLogEntries.observedOn} desc nulls last`,
      desc(researchLogEntries.createdAt),
      asc(researchLogEntries.id),
    );
  return {
    kind: "validation",
    keyMetrics,
    checks,
    competitors: await liveCompetitors(db, validationId),
    researchLog: logs,
    assumptions: await liveAssumptions(db, validationId),
    risks: await liveRisks(db, validationId),
  };
}

const exportScope = (query: AiExportQuery): AiScope => {
  if (query.items !== undefined) {
    return { kind: "items", itemNos: query.items };
  }
  if (query.part !== undefined) return { kind: "part", part: query.part };
  if (query.sections !== undefined) {
    return { kind: "sections", keys: query.sections };
  }
  return { kind: "all" };
};

async function callerTimeZone(db: Executor, userId: string) {
  const [me] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .where(eq(users.id, userId));
  return required(me, `user ${userId}`).timezone;
}

/**
 * The questions a template migration hid that still hold an answer among `keys`, as
 * the newest published version of the same template that had them defines them (SDD
 * 5.10 ImportContext).
 */
async function retiredQuestions(
  db: Executor,
  templateVersionId: string,
  keys: readonly string[],
): Promise<TemplateQuestion[]> {
  if (keys.length === 0) return [];
  const [pinned] = await db
    .select({ templateId: templateVersions.templateId })
    .from(templateVersions)
    .where(eq(templateVersions.id, templateVersionId));
  if (pinned === undefined) {
    throw new Error(`No template version ${templateVersionId}`);
  }
  const holders = await db
    .selectDistinctOn([templateQuestions.questionKey], {
      key: templateQuestions.questionKey,
      versionId: templateVersions.id,
    })
    .from(templateQuestions)
    .innerJoin(
      templateVersions,
      eq(templateVersions.id, templateQuestions.templateVersionId),
    )
    .where(
      and(
        eq(templateVersions.templateId, pinned.templateId),
        eq(templateVersions.status, "published"),
        inArray(templateQuestions.questionKey, [...keys]),
      ),
    )
    .orderBy(
      asc(templateQuestions.questionKey),
      desc(templateVersions.versionNumber),
    );
  const sections = await loadTemplateSections(
    db,
    holders.map((holder) => holder.versionId),
  );
  return holders.flatMap((holder) =>
    (sections.get(holder.versionId) ?? [])
      .flatMap((section) => section.questions)
      .filter((question) => question.key === holder.key),
  );
}

/** X2 (SDD 5.10 ImportContext). */
async function importContext(
  db: Executor,
  target: AiTarget,
): Promise<ImportContext> {
  const pinned = target.sections.flatMap((section) => section.questions);
  const pinnedKeys = new Set(pinned.map((question) => question.key));
  const retired = (
    await retiredQuestions(
      db,
      target.templateVersionId,
      [...target.answers.values()]
        .filter((row) => !pinnedKeys.has(row.questionKey) && hasValue(row))
        .map((row) => row.questionKey),
    )
  ).filter((question) => isImportable(question, target.kind));
  const keys = [...pinned, ...retired].map((question) => question.key);
  const evidence =
    target.kind === "validation"
      ? await answerEvidence(db, target.id, keys)
      : null;
  const authors = await loadUserRefs(
    db,
    [...target.answers.values()].flatMap((row) =>
      row.updatedById === null ? [] : [row.updatedById],
    ),
    target.workspaceId,
  );
  const texts = new Map(
    [...target.answers].map(([key, row]) => [key, { text: row.text }]),
  );
  const entry = (question: TemplateQuestion, hidden: boolean) => {
    const row = target.answers.get(question.key);
    const text = row?.text ?? null;
    return {
      questionKey: question.key,
      title: question.title,
      prompt: question.prompt,
      sectionKey: question.sectionKey,
      answerType: question.answerType,
      options: question.options,
      importable: isImportable(question, target.kind),
      hasFau: target.kind === "validation" && question.hasFau,
      hidden,
      current: {
        text,
        amount: row?.amount ?? null,
        classification:
          evidence === null
            ? null
            : classificationOf(
                {
                  hasValue: hasText(text),
                  fau: row?.fau ?? null,
                  confidence: row?.confidence ?? null,
                },
                evidence(question.key),
              ),
        lockVersion: row?.lockVersion ?? 0,
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedBy:
          row?.updatedById == null
            ? null
            : (authors.get(row.updatedById) ?? null),
      },
    };
  };
  return {
    target: {
      type: target.kind,
      id: target.id,
      name: target.name,
      workspaceId: target.workspaceId,
      ideaId: target.ideaId,
      currency: target.currency,
      archived: target.archived,
    },
    sections: target.sections.map((section) => ({
      key: section.key,
      title: section.title,
      part: section.part,
      importable: section.questions.some((question) =>
        isImportable(question, target.kind),
      ),
    })),
    questions: [
      ...pinned.map((question) =>
        entry(question, !isQuestionShown(question, texts)),
      ),
      ...retired.map((question) => entry(question, true)),
    ],
  };
}

// ---- X3 ----

/** An answer's content as an import changes it. */
interface AnswerState {
  text: string | null;
  amount: number | null;
  fau: Fau | null;
  confidence: Confidence | null;
}

/** A change X3 checked against the template, before it reads what is stored. */
interface CheckedChange {
  index: number;
  change: ImportChange;
  /** Null for a question a template migration hid, which is refused after the versions. */
  question: TemplateQuestion | null;
  /** The text to write: a choice as the template spells it; undefined keeps it. */
  text: string | null | undefined;
}

/**
 * Checks each change against the pinned template, as far as that settles it (SDD 5.10
 * X3): the question exists, its type is one an import can write, and its values fit
 * its type (design-spec 6.0.8 for 11 and 21). Whether it is hidden depends on what is
 * stored, so {@link applyChanges} refuses that after the versions.
 *
 * @throws {ApiError} QUESTION_NOT_FOUND, NOT_IMPORTABLE, CONFIDENCE_REQUIRED or
 * VALIDATION_FAILED, for the first change that fails
 */
function checkChanges(
  target: AiTarget,
  changes: readonly ImportChange[],
): CheckedChange[] {
  const questions = new Map(
    target.sections
      .flatMap((section) => section.questions)
      .map((question) => [question.key, question]),
  );
  const seen = new Set<string>();
  return changes.map((change, index): CheckedChange => {
    const at = (path: string) => `changes.${index}.${path}`;
    if (seen.has(change.questionKey)) {
      throw invalid(
        at("questionKey"),
        "invalid_value",
        "The same question twice",
      );
    }
    seen.add(change.questionKey);
    const question = questions.get(change.questionKey);
    if (question === undefined) {
      const stored = target.answers.get(change.questionKey);
      if (stored !== undefined && hasValue(stored)) {
        return { index, change, question: null, text: change.text };
      }
      throw new ApiError(
        "QUESTION_NOT_FOUND",
        "The pinned template version has no such question",
      );
    }
    if (!isImportable(question, target.kind)) {
      throw new ApiError(
        "NOT_IMPORTABLE",
        "Tables, numbers and execution items cannot be imported",
      );
    }
    if (
      change.amount !== undefined &&
      change.amount !== null &&
      question.answerType !== "amount_with_reason"
    ) {
      throw invalid(
        at("amount"),
        "invalid_value",
        "Only an amount-with-reason question takes an amount",
      );
    }
    let text = change.text;
    if (typeof text === "string") {
      if (
        question.answerType === "short_text" &&
        countChars(text) > TEXT_LIMITS.short
      ) {
        throw invalid(
          at("text"),
          "too_big",
          `Must be at most ${TEXT_LIMITS.short} characters`,
        );
      }
      if (question.options?.kind === "choice") {
        const choice = readChoice(text, question.options.choices);
        if (choice === null) {
          throw invalid(at("text"), "invalid_value", "Not one of the choices");
        }
        text = choice;
      }
    }
    const sent = change.classification;
    if (sent !== undefined) {
      if (target.kind !== "validation" || !question.hasFau) {
        throw invalid(
          at("classification"),
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
          at("classification.confidence"),
          "invalid_value",
          "Only an Assumption has a confidence",
        );
      }
    }
    return { index, change, question, text };
  });
}

/** One answer an import writes, with what it held. */
interface Write extends CheckedChange {
  question: TemplateQuestion;
  stored: StoredAnswer | undefined;
  after: AnswerState;
  textChanged: boolean;
}

const stateOf = (stored: StoredAnswer | undefined): AnswerState => ({
  text: stored?.text ?? null,
  amount: stored?.amount ?? null,
  fau: stored?.fau ?? null,
  confidence: stored?.confidence ?? null,
});

/** The answer `checked` leaves (SDD 5.10 X3): a validation answer whose text changed loses its F/A/U unless one is sent. */
function stateAfter(
  target: AiTarget,
  checked: CheckedChange,
  stored: StoredAnswer | undefined,
): { after: AnswerState; textChanged: boolean } {
  const before = stateOf(stored);
  const { change } = checked;
  const text = checked.text === undefined ? before.text : checked.text;
  const textChanged = text !== before.text;
  let { fau, confidence } = before;
  if (target.kind === "validation") {
    if (change.classification !== undefined) {
      fau = change.classification.fau;
      confidence = change.classification.confidence ?? null;
    } else if (textChanged) {
      fau = null;
      confidence = null;
    }
  }
  return {
    after: {
      text,
      amount: change.amount === undefined ? before.amount : change.amount,
      fau,
      confidence,
    },
    textChanged,
  };
}

/** The 409 CONFLICT_MULTI of the answers someone else changed first (SDD 5.10 X3). */
async function conflictMulti(
  db: Executor,
  target: AiTarget,
  lost: readonly StoredAnswer[],
): Promise<ApiError> {
  const authors = await loadUserRefs(
    db,
    lost.flatMap((row) => (row.updatedById === null ? [] : [row.updatedById])),
    target.workspaceId,
  );
  return new ApiError(
    "CONFLICT_MULTI",
    "Someone else changed some of these answers first",
    {
      conflicts: lost.map((row) => ({
        questionKey: row.questionKey,
        current: {
          value: { text: row.text, amount: row.amount },
          lockVersion: row.lockVersion,
          updatedAt: row.updatedAt.toISOString(),
          updatedBy:
            row.updatedById === null
              ? null
              : (authors.get(row.updatedById) ?? null),
        },
      })),
    },
  );
}

/** How an import stores the answers of one kind of target and records their history. */
interface AnswerStore {
  /** Inserts the first save of an answer; false when another request made it first. */
  insert(key: string, after: AnswerState): Promise<boolean>;
  update(stored: StoredAnswer, after: AnswerState): Promise<void>;
  /** The answer as the history keeps it (packages/db history-values.ts). */
  content(key: string, state: AnswerState, stored?: StoredAnswer): unknown;
  ref(key: string): TargetRef;
}

function answerStore(
  tx: DatabaseTransaction,
  target: AiTarget,
  options: {
    userId: string;
    at: Date;
    evidence: ((key: string) => ItemEvidence) | null;
  },
): AnswerStore {
  const { userId, at } = options;
  const stamp = { updatedById: userId, updatedAt: at };
  const bumped = (stored: StoredAnswer) => ({
    ...stamp,
    lockVersion: stored.lockVersion + 1,
  });
  const created = { ...stamp, createdAt: at, lockVersion: 1 };
  const kind = target.kind;
  const ref = (key: string): TargetRef => ({
    type:
      kind === "self_analysis"
        ? "self_analysis_answer"
        : kind === "validation"
          ? "validation_answer"
          : "plan_answer",
    id: target.id,
    key,
  });
  if (kind === "self_analysis") {
    return {
      ref,
      content: (_key, state) => selfAnalysisAnswerContent(state),
      async insert(key, after) {
        const rows = await tx
          .insert(selfAnalysisAnswers)
          .values({
            selfAnalysisId: target.id,
            questionKey: key,
            text: after.text,
            amount: after.amount,
            ...created,
          })
          .onConflictDoNothing()
          .returning({ id: selfAnalysisAnswers.id });
        return rows.length > 0;
      },
      async update(stored, after) {
        await tx
          .update(selfAnalysisAnswers)
          .set({ text: after.text, amount: after.amount, ...bumped(stored) })
          .where(
            and(
              eq(selfAnalysisAnswers.selfAnalysisId, target.id),
              eq(selfAnalysisAnswers.questionKey, stored.questionKey),
            ),
          );
      },
    };
  }
  if (kind === "validation") {
    const evidenceIds = (key: string) =>
      options.evidence?.(key).evidence.map((piece) => piece.id) ?? [];
    return {
      ref,
      content: (key, state) => validationAnswerContent(state, evidenceIds(key)),
      async insert(key, after) {
        const rows = await tx
          .insert(validationAnswers)
          .values({
            validationId: target.id,
            questionKey: key,
            text: after.text,
            fau: after.fau,
            confidence: after.confidence,
            ...created,
          })
          .onConflictDoNothing()
          .returning({ id: validationAnswers.id });
        return rows.length > 0;
      },
      async update(stored, after) {
        await tx
          .update(validationAnswers)
          .set({
            text: after.text,
            fau: after.fau,
            confidence: after.confidence,
            ...bumped(stored),
          })
          .where(
            and(
              eq(validationAnswers.validationId, target.id),
              eq(validationAnswers.questionKey, stored.questionKey),
            ),
          );
      },
    };
  }
  return {
    ref,
    content: (_key, state, stored) =>
      planAnswerContent({ text: state.text, rows: stored?.rows ?? null }),
    async insert(key, after) {
      const rows = await tx
        .insert(planAnswers)
        .values({
          businessPlanId: target.id,
          questionKey: key,
          text: after.text,
          ...created,
        })
        .onConflictDoNothing()
        .returning({ id: planAnswers.id });
      return rows.length > 0;
    },
    async update(stored, after) {
      await tx
        .update(planAnswers)
        .set({ text: after.text, ...bumped(stored) })
        .where(
          and(
            eq(planAnswers.businessPlanId, target.id),
            eq(planAnswers.questionKey, stored.questionKey),
          ),
        );
    },
  };
}

/**
 * Applies the changes of X3 to `target`, read under `FOR UPDATE` in `tx`: every answer
 * that changes, or none (SDD 5.10). The checks come in the order of SDD 5.1「同時編集」:
 * what the template settles first, then the versions (all the conflicts at once), then
 * what depends on what is stored (hidden questions, a Fact's evidence).
 *
 * @param operation Its `at` is when the answers change: for a plan, the time
 * `planContentTime` gives.
 * @throws {ApiError} CONFLICT_MULTI, FACT_REQUIRES_EVIDENCE, or what `checkChanges`
 * throws
 */
async function applyChanges(
  tx: DatabaseTransaction,
  target: AiTarget,
  changes: readonly ImportChange[],
  operation: HistoryOperation,
): Promise<{ applied: number; needsClassification: number }> {
  const checked = checkChanges(target, changes);
  const writes: Write[] = [];
  const lost: StoredAnswer[] = [];
  for (const change of checked) {
    const { question } = change;
    if (question === null) continue;
    const stored = target.answers.get(change.change.questionKey);
    const { after, textChanged } = stateAfter(target, change, stored);
    // An answer left as it is passes whatever version it was read at, as V3 lets
    // through a save that changes nothing.
    if (sameContent(stateOf(stored), after)) continue;
    if (
      stored !== undefined &&
      stored.lockVersion !== change.change.baseLockVersion
    ) {
      lost.push(stored);
      continue;
    }
    writes.push({ ...change, question, stored, after, textChanged });
  }
  if (lost.length > 0) throw await conflictMulti(tx, target, lost);

  // Hidden by what is stored: 02 OCEAN's answer, or a migration that left an answer.
  const texts = new Map(
    [...target.answers].map(([key, row]) => [key, { text: row.text }]),
  );
  for (const { question } of checked) {
    if (question === null) {
      throw new ApiError(
        "NOT_IMPORTABLE",
        "A template migration hid this question",
      );
    }
    if (!isQuestionShown(question, texts)) {
      throw new ApiError("NOT_IMPORTABLE", "The question is hidden");
    }
  }

  const evidence =
    target.kind === "validation"
      ? await answerEvidence(
          tx,
          target.id,
          writes.map((write) => write.question.key),
        )
      : null;
  for (const write of writes) {
    if (evidence === null) continue;
    const { fau } = write.after;
    if (
      !hasText(write.after.text) &&
      (fau === "fact" || fau === "assumption")
    ) {
      throw invalid(
        `changes.${write.index}.classification.fau`,
        "invalid_value",
        "A Fact or Assumption needs an answer",
      );
    }
    if (
      fau === "fact" &&
      (write.textChanged || write.stored?.fau !== "fact") &&
      evidence(write.question.key).activeCount === 0
    ) {
      throw new ApiError(
        "FACT_REQUIRES_EVIDENCE",
        "A Fact needs evidence that is still attached",
      );
    }
  }

  const store = answerStore(tx, target, {
    userId: operation.changedById,
    at: operation.at,
    evidence,
  });
  const taken: string[] = [];
  for (const write of writes) {
    const key = write.question.key;
    if (write.stored !== undefined) {
      await store.update(write.stored, write.after);
    } else if (!(await store.insert(key, write.after))) {
      taken.push(key);
    }
  }
  if (taken.length > 0) {
    // Two first saves met at the insert; the one that lost read no version of the
    // answer, so it is a conflict as any other (SDD 5.1「同時編集」).
    const now = await storedAnswers(tx, target.kind, target.id, false);
    throw await conflictMulti(
      tx,
      target,
      taken.flatMap((key) => now.get(key) ?? []),
    );
  }
  await withHistory(tx, operation, async () =>
    writes.map(
      (write): HistoryChange => ({
        target: store.ref(write.question.key),
        action: write.stored === undefined ? "create" : "update",
        before:
          write.stored === undefined
            ? null
            : store.content(
                write.question.key,
                stateOf(write.stored),
                write.stored,
              ),
        after: store.content(write.question.key, write.after, write.stored),
      }),
    ),
  );
  return {
    applied: writes.length,
    needsClassification: writes.filter(
      (write) =>
        target.kind === "validation" &&
        write.question.hasFau &&
        hasText(write.after.text) &&
        write.after.fau === null,
    ).length,
  };
}

/** What the AI routes need from the app. */
export interface AiRoutesOptions {
  access: AccessPlugin;
  db: Database;
  limiter: RateLimiter;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  422: errorBodySchema,
} as const;

/** X1–X3 (SDD 5.10): the AI export (24), what an import needs to know (24, 25), and applying it (25). */
export function aiRoutes({ access, db, limiter, now }: AiRoutesOptions) {
  /**
   * Counts one X1 or X3 against {@link AI_LIMIT}; in `tx`, the count goes if the import
   * is refused.
   *
   * @throws {ApiError} RATE_LIMITED
   */
  const count = async (userId: string, tx?: DatabaseTransaction) => {
    const counted = await limiter.consume("user", AI_LIMIT, userId, tx);
    if (!counted.allowed) {
      throw new ApiError("RATE_LIMITED", "Too many AI exports and imports", {
        retryAfterSeconds: counted.retryAfterSeconds,
      });
    }
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/ai/export",
      async ({ caller, scope, query }) => {
        const target = await loadTarget(db, query.source, caller, scope);
        const aiScope = exportScope(query);
        const scoped = scopeSections(target.kind, target.sections, aiScope);
        if ("problem" in scoped) {
          if (scoped.problem.kind === "empty") {
            throw new ApiError("EMPTY_SCOPE", "The scope holds no question");
          }
          throw invalid(
            aiScope.kind === "items" ? "items" : "sections",
            "invalid_value",
            `The template has no ${scoped.problem.key}`,
          );
        }
        // Refusals before this are not counted, as P13 counts only what it makes.
        await count(caller.id);
        const [version] = await db
          .select({
            versionNumber: templateVersions.versionNumber,
            aiPrompt: templateVersions.aiPrompt,
          })
          .from(templateVersions)
          .where(eq(templateVersions.id, target.templateVersionId));
        if (version === undefined) {
          throw new Error(`No template version ${target.templateVersionId}`);
        }
        return buildAiExport(
          {
            kind: target.kind,
            sections: target.sections,
            scope: aiScope,
            answers: await exportAnswers(db, target),
            prompt: target.kind === "self_analysis" ? version.aiPrompt : "",
            templateVersion: version.versionNumber,
            currency: target.currency,
            ideaName: target.ideaName,
            planName: target.planName,
            ownerName: target.kind === "self_analysis" ? target.name : null,
            exportedAt: new Date(now()),
            timeZone: await callerTimeZone(db, caller.id),
            includeEmpty: query.includeEmpty,
            includeExamples: query.includeExamples,
            reference:
              query.includeReference && scope !== null
                ? await loadReference(db, target, scope.role)
                : null,
          },
          scoped.sections,
        );
      },
      {
        located: { to: exportLocator, need: "write" },
        query: aiExportQuerySchema,
        response: { 200: aiExportSchema, ...errors, 429: errorBodySchema },
        detail: {
          summary: "X1 Export for an AI (24)",
          description:
            "The caller's self-analysis (no id), or the validation or plan id, archived ones included. sections (self-analysis, validation), items or part (plan) narrow the scope; without them it is the whole. Hidden questions and those an import cannot write are left out. Nothing is recorded. Counted with X3, 60 per user per hour (429 RATE_LIMITED); refusals before the export are not counted.",
        },
      },
    )
    .get(
      "/api/v1/ai/import/context",
      async ({ caller, scope, query }) =>
        importContext(db, await loadTarget(db, query.target, caller, scope)),
      {
        located: { to: contextLocator, need: "write" },
        query: importContextQuerySchema,
        response: { 200: importContextSchema, ...errors },
        detail: {
          summary: "X2 Where an import goes (24, 25)",
          description:
            "The template's sections and questions with the answers they hold now and their versions. Archived ideas and plans are read too (target.archived). Not counted.",
        },
      },
    )
    .post(
      "/api/v1/ai/import/apply",
      async ({ caller, scope, body, request }) => {
        const at = new Date(now());
        const batchId = crypto.randomUUID();
        const operation = (
          container: HistoryContainer,
          when: Date,
        ): HistoryOperation => ({
          container,
          changedById: caller.id,
          source: "ai_import",
          batchId,
          client: requestContext(request).client,
          at: when,
        });
        let result: { applied: number; needsClassification: number };
        if (scope === null) {
          // Writes to a self-analysis lock it after the caller (SDD 5.8).
          result = await db.transaction(async (tx) => {
            await lockActiveCaller(tx, caller.id);
            const analysis = await lockSelfAnalysis(tx, caller.id);
            await count(caller.id, tx);
            const target = await selfAnalysisTarget(tx, analysis, caller, true);
            const applied = await applyChanges(
              tx,
              target,
              body.changes,
              operation(
                {
                  type: "self_analysis",
                  id: analysis.id,
                  ownerUserId: caller.id,
                },
                at,
              ),
            );
            await startIfAnswered(tx, analysis, target.sections, at);
            return applied;
          });
        } else {
          result = await writeInScope(db, scope, at, async (tx) => {
            await count(caller.id, tx);
            if (body.target.type === "validation") {
              const target = await validationTarget(tx, scope, true);
              return applyChanges(
                tx,
                target,
                body.changes,
                operation(
                  {
                    type: "validation",
                    id: target.id,
                    workspaceId: scope.workspaceId,
                  },
                  at,
                ),
              );
            }
            const target = await planTarget(tx, scope, true);
            // Under the plan's lock, after its latest version (SDD 6.3「+ changes」).
            const when = await planContentTime(tx, target.id, at);
            return applyChanges(
              tx,
              target,
              body.changes,
              operation(
                {
                  type: "business_plan",
                  id: target.id,
                  workspaceId: scope.workspaceId,
                },
                when,
              ),
            );
          });
        }
        return { ...result, batchId };
      },
      {
        located: { to: applyLocator, need: "writeUnarchived" },
        body: importApplySchema,
        parse: "json",
        response: {
          200: importApplyResultSchema,
          ...errors,
          409: errorBodySchema,
          429: errorBodySchema,
        },
        detail: {
          summary: "X3 Apply an AI import (25)",
          description:
            "All the changes in one transaction, or none. 409 CONFLICT_MULTI (error.conflicts) when an answer that changes was saved since baseLockVersion; 422 NOT_IMPORTABLE for tables, numbers, execution items and hidden questions, QUESTION_NOT_FOUND, VALIDATION_FAILED for a value that does not fit or a question twice. A validation answer whose text changes becomes Unclassified unless classification is sent. History ai_import under one batchId. Counted with X1, 60 per user per hour (429 RATE_LIMITED); a refused import is not counted.",
        },
      },
    );
}
