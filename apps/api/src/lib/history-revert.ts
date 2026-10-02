import { schema } from "@moonx/db";
import type { ExecutionStatus, HistoryEntry, TargetType } from "@moonx/schemas";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import {
  answerSnapshot,
  assumptionSnapshot,
  competitorSnapshot,
  costItemSnapshot,
  economicsSnapshot,
  executionItemSnapshot,
  ideaSnapshot,
  planAnswerSnapshot,
  planHeaderSnapshot,
  researchLogSnapshot,
  riskSnapshot,
  selfAnalysisAnswerSnapshot,
} from "../history/snapshots";
import { type HistoryMeta, withHistory } from "../history/with-history";
import { toCostItem, toEconomicsInput } from "./cost-dto";
import { todayIn } from "./dashboard-data";
import type { Db, Executor, Tx } from "./db";
import { historyActor } from "./dto";
import { findQuestion } from "./evidence-write";
import {
  assertAssignable,
  assertFieldsFit,
  assertOneAssignee,
  assertStatus,
  buildExecutionItems,
} from "./execution";
import { type HistoryRow, toHistoryEntries } from "./history-dto";
import { type HistoryAccess, requireRevertable, resolveContainer } from "./history-target";
import { loadIdeas } from "./ideas";
import { loadPlanBundle } from "./plan-context";
import { findPlanQuestion } from "./plan-question";
import { buildPlanHome } from "./plan-view";
import {
  assertPlanNameFree,
  buildPlanAnswers,
  namedPlanWrite,
  touchPlanActivity,
} from "./plan-write";
import { buildSelfAnalysisAnswers } from "./self-analysis";
import { loadTemplateSections } from "./template";
import { loadValidationAnswers } from "./validation-answers";
import { ECONOMICS_FIELDS, loadValidationData } from "./validation-data";
import { toResearchLogEntries } from "./validation-research-log";
import {
  activeEvidenceIds,
  commentCountsById,
  commentCountsByKey,
  type DtoContext,
  toAssumption,
  toCompetitor,
  toRisk,
  userRefsOf,
} from "./validation-table-dto";
import { touchValidationActivity } from "./validation-write";

type State = Record<string, unknown>;
type EvidenceTarget = (typeof schema.evidenceLinks.$inferSelect)["targetType"];
type Values = Record<string, unknown>;

/** What a revert did to one item: its snapshot before and after, and the history action. */
interface Applied {
  before: unknown | null;
  after: unknown | null;
  action: "restore" | "delete";
}

/** A revert that has been checked and is ready to run. */
type Execute = () => Promise<Applied>;

interface Ref {
  type: TargetType;
  id: string;
  key: string | null;
}

interface Env {
  access: HistoryAccess;
  userId: string;
  now: Date;
}

/**
 * Applies the state to the item. `undo` is set when a whole operation is taken back (H3): there a
 * null state means "the item did not exist before" and a vanished item is skipped (null), while a
 * single entry (H2) names an item that must still be there (404).
 */
type Handler = (
  tx: Tx,
  env: Env,
  ref: Ref,
  state: State | null,
  undo: boolean,
) => Promise<Execute | null>;

/** Targets that are not restored entry by entry; a template version moves with its whole batch. */
const NOT_RESTORABLE = new Set<TargetType>(["pitch_slide", "template_version"]);

/** Sources whose batch H3 takes back. Drafts and duplicates would have to delete whole records. */
const UNDOABLE_SOURCES = new Set(["ai_import", "template_migration", "revert"]);

const notFound = () => new ApiError("NOT_FOUND", "Resource not found");
const refused = (path: string, message: string) =>
  validationFailed([{ path, code: "invalid", message }]);

const str = (state: State, key: string) => (state[key] as string | null | undefined) ?? null;
const num = (state: State, key: string) => (state[key] as number | null | undefined) ?? null;
const evidenceIdsOf = (state: State | null) => [
  ...((state?.evidence as string[] | undefined) ?? []),
];

function validationIdOf(env: Env, ref: Ref): string {
  const id = env.access.validationId;
  if (env.access.container.type !== "validation" || !id) throw notFound();
  if ((ref.type === "validation_answer" || ref.type === "economics_input") && ref.id !== id) {
    throw notFound();
  }
  return id;
}

function planIdOf(env: Env, ref: Ref): string {
  const id = env.access.planId;
  if (env.access.container.type !== "business_plan" || !id) throw notFound();
  if ((ref.type === "plan_answer" || ref.type === "business_plan") && ref.id !== id) {
    throw notFound();
  }
  return id;
}

const evidenceKeyIs = (key: string | null) =>
  key == null ? isNull(schema.evidenceLinks.targetKey) : eq(schema.evidenceLinks.targetKey, key);

interface EvidenceRef {
  type: EvidenceTarget;
  id: string;
  key: string | null;
}

/**
 * Makes the active evidence links of one item the ones the snapshot lists: links the snapshot
 * does not have are removed (soft), removed links it has come back. Links are never created here.
 */
async function syncEvidence(
  tx: Tx,
  env: Env,
  validationId: string,
  target: EvidenceRef,
  wanted: string[],
): Promise<void> {
  const links = await tx
    .select({ id: schema.evidenceLinks.id, deletedAt: schema.evidenceLinks.deletedAt })
    .from(schema.evidenceLinks)
    .where(
      and(
        eq(schema.evidenceLinks.validationId, validationId),
        eq(schema.evidenceLinks.targetType, target.type),
        eq(schema.evidenceLinks.targetId, target.id),
        evidenceKeyIs(target.key),
      ),
    );
  const want = new Set(wanted);
  const remove = links.filter((l) => l.deletedAt == null && !want.has(l.id)).map((l) => l.id);
  const restore = links.filter((l) => l.deletedAt != null && want.has(l.id)).map((l) => l.id);
  if (remove.length > 0) {
    await tx
      .update(schema.evidenceLinks)
      .set({ deletedAt: env.now })
      .where(inArray(schema.evidenceLinks.id, remove));
  }
  if (restore.length > 0) {
    await tx
      .update(schema.evidenceLinks)
      .set({ deletedAt: null })
      .where(inArray(schema.evidenceLinks.id, restore));
  }
}

interface SoftRow {
  id: string;
  deletedAt: Date | null;
  lockVersion: number;
}

/**
 * Restores a row that is deleted softly: its content (and evidence links) from the state, the row
 * itself when it was deleted. A null state deletes it (the row did not exist before).
 */
async function restoreRow<R extends SoftRow>(
  tx: Tx,
  env: Env,
  spec: {
    /** Needed when `evidence` is set: the validation the links belong to. */
    validationId: string | null;
    load: () => Promise<R | undefined>;
    snapshot: (row: R, evidence: string[]) => unknown;
    evidence: { type: EvidenceTarget; id: string } | null;
    save: (row: R, values: Values) => Promise<R>;
    columns: (state: State) => Values;
    /** The rules the normal write path enforces on the columns, run before a restore writes them. */
    check?: (row: R, values: Values) => Promise<void>;
  },
  state: State | null,
  undo: boolean,
): Promise<Execute | null> {
  const row = await spec.load();
  if (!row) {
    if (state == null && undo) return null;
    throw notFound();
  }
  const active = row.deletedAt == null;
  if (state == null && !active) return null;
  const target = spec.evidence ? { ...spec.evidence, key: null } : null;
  return async () => {
    const before = active
      ? spec.snapshot(row, target ? await activeEvidenceIds(tx, target) : [])
      : null;
    const stamp = { updatedById: env.userId, updatedAt: env.now, lockVersion: row.lockVersion + 1 };
    if (state == null) {
      await spec.save(row, { ...stamp, deletedAt: env.now });
      return { before, after: null, action: "delete" };
    }
    const columns = spec.columns(state);
    await spec.check?.(row, columns);
    const saved = await spec.save(row, { ...stamp, deletedAt: null, ...columns });
    if (target) {
      await syncEvidence(tx, env, spec.validationId as string, target, evidenceIdsOf(state));
    }
    return {
      before,
      after: spec.snapshot(saved, target ? await activeEvidenceIds(tx, target) : []),
      action: "restore",
    };
  };
}

async function insertOnce<T>(insert: () => Promise<T>): Promise<T> {
  try {
    return await insert();
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505") {
      throw new ApiError("CONFLICT", "The item was changed by someone else");
    }
    throw error;
  }
}

/**
 * Restores an item that is identified by its key and exists once it has been answered: a row is
 * created for a state that has none, and a null state empties the item (its row stays).
 */
async function restoreKeyed<R extends { lockVersion: number }>(
  tx: Tx,
  env: Env,
  spec: {
    validationId: string | null;
    load: () => Promise<R | undefined>;
    snapshot: (row: R | null, evidence: string[]) => unknown;
    evidence: EvidenceRef | null;
    write: (row: R | undefined, values: Values) => Promise<R>;
    columns: (state: State) => Values;
  },
  state: State | null,
): Promise<Execute | null> {
  const row = await spec.load();
  if (!row && state == null) return null;
  return async () => {
    const before = row
      ? spec.snapshot(row, spec.evidence ? await activeEvidenceIds(tx, spec.evidence) : [])
      : null;
    const values = {
      ...spec.columns(state ?? {}),
      updatedById: env.userId,
      updatedAt: env.now,
      lockVersion: (row?.lockVersion ?? 0) + 1,
    };
    // There is no row to lock for an unanswered item, so a concurrent revert or answer can insert
    // first; the unique key then settles it as the same 409 an optimistic-lock miss gives.
    const saved = row
      ? await spec.write(row, values)
      : await insertOnce(() => spec.write(row, values));
    if (spec.evidence && spec.validationId) {
      await syncEvidence(tx, env, spec.validationId, spec.evidence, evidenceIdsOf(state));
    }
    return {
      before,
      after: spec.snapshot(saved, spec.evidence ? await activeEvidenceIds(tx, spec.evidence) : []),
      action: "restore",
    };
  };
}

const researchLog: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const t = schema.researchLogEntries;
  return restoreRow(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.validationId, validationId)))
            .for("update")
        )[0],
      snapshot: (row) => researchLogSnapshot(row),
      evidence: null,
      save: async (row, values) =>
        (await tx.update(t).set(values).where(eq(t.id, row.id)).returning())[0] as typeof row,
      columns: (s) => ({
        observedOn: str(s, "observedOn"),
        topic: str(s, "topic") ?? "",
        observation: str(s, "observation"),
        sourceType: str(s, "sourceType"),
        sourceUrl: str(s, "sourceUrl"),
        supportsChecks: (s.supportsChecks as string[] | undefined) ?? [],
        supportsNote: str(s, "supportsNote"),
      }),
    },
    state,
    undo,
  );
};

const competitor: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const t = schema.competitors;
  return restoreRow(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.validationId, validationId)))
            .for("update")
        )[0],
      snapshot: competitorSnapshot,
      evidence: { type: "competitor", id: ref.id },
      save: async (row, values) =>
        (await tx.update(t).set(values).where(eq(t.id, row.id)).returning())[0] as typeof row,
      columns: (s) => ({
        name: str(s, "name") ?? "",
        type: str(s, "type"),
        targetCustomer: str(s, "targetCustomer"),
        offering: str(s, "offering"),
        typicalPrice: num(s, "typicalPrice"),
        priceNote: str(s, "priceNote"),
        strength: str(s, "strength"),
        weakness: str(s, "weakness"),
        whyChosen: str(s, "whyChosen"),
        whySurvive: str(s, "whySurvive"),
      }),
    },
    state,
    undo,
  );
};

const assumption: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const t = schema.assumptions;
  return restoreRow(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.validationId, validationId)))
            .for("update")
        )[0],
      snapshot: assumptionSnapshot,
      evidence: { type: "assumption", id: ref.id },
      save: async (row, values) =>
        (await tx.update(t).set(values).where(eq(t.id, row.id)).returning())[0] as typeof row,
      columns: (s) => ({
        statement: str(s, "statement") ?? "",
        whyBelieve: str(s, "whyBelieve"),
        evidenceNote: str(s, "evidenceNote"),
        confidence: str(s, "confidence"),
        disproveCondition: str(s, "disproveCondition"),
        nextCheck: str(s, "nextCheck"),
      }),
    },
    state,
    undo,
  );
};

const risk: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const t = schema.risks;
  return restoreRow(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.validationId, validationId)))
            .for("update")
        )[0],
      snapshot: (row) => riskSnapshot(row),
      evidence: null,
      save: async (row, values) =>
        (await tx.update(t).set(values).where(eq(t.id, row.id)).returning())[0] as typeof row,
      columns: (s) => ({
        statement: str(s, "statement") ?? "",
        probability: str(s, "probability"),
        impact: str(s, "impact"),
        whyMatters: str(s, "whyMatters"),
        mitigation: str(s, "mitigation"),
        howToValidate: str(s, "howToValidate"),
      }),
    },
    state,
    undo,
  );
};

const costItem: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const t = schema.costItems;
  return restoreRow(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.validationId, validationId)))
            .for("update")
        )[0],
      snapshot: costItemSnapshot,
      evidence: { type: "cost_item", id: ref.id },
      save: async (row, values) =>
        (await tx.update(t).set(values).where(eq(t.id, row.id)).returning())[0] as typeof row,
      columns: (s) => ({
        category: str(s, "category"),
        name: str(s, "name") ?? "",
        inputMode: str(s, "inputMode") ?? "amount",
        amount: num(s, "amount"),
        percent: num(s, "percent"),
        isLumpSum: (s.isLumpSum as boolean | undefined) ?? false,
        whyNeeded: str(s, "whyNeeded"),
        canReduce: str(s, "canReduce"),
        notes: str(s, "notes"),
        fau: str(s, "fau"),
        confidence: str(s, "confidence"),
      }),
    },
    state,
    undo,
  );
};

const FINISHED = new Set(["done", "resolved"]);

const executionItem: Handler = async (tx, env, ref, state, undo) => {
  const planId = planIdOf(env, ref);
  const t = schema.executionItems;
  return restoreRow(
    tx,
    env,
    {
      validationId: null,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.id, ref.id), eq(t.businessPlanId, planId)))
            .for("update")
        )[0],
      snapshot: (row) => executionItemSnapshot(row),
      evidence: null,
      check: async (row, values) => {
        const v = values as {
          assigneeUserId: string | null;
          assigneeName: string | null;
          status: ExecutionStatus | null;
        };
        assertOneAssignee(v);
        assertFieldsFit(row.type, values);
        assertStatus(row.type, v.status);
        if (v.assigneeUserId) {
          await assertAssignable(tx, env.access.workspaceId as string, v.assigneeUserId);
        }
      },
      save: async (row, values) => {
        const status = values.status as string | null | undefined;
        const derived =
          status === undefined
            ? {}
            : {
                completedAt:
                  status != null && FINISHED.has(status) ? (row.completedAt ?? env.now) : null,
                kpiActualUpdatedAt:
                  (values.kpiActual as string | null) === row.kpiActual
                    ? row.kpiActualUpdatedAt
                    : values.kpiActual
                      ? env.now
                      : null,
              };
        return (
          await tx
            .update(t)
            .set({ ...values, ...derived })
            .where(eq(t.id, row.id))
            .returning()
        )[0] as typeof row;
      },
      columns: (s) => ({
        title: str(s, "title") ?? "",
        assigneeUserId: str(s, "assigneeUserId"),
        assigneeName: str(s, "assigneeName"),
        dueDate: str(s, "dueDate"),
        status: str(s, "status"),
        goal: str(s, "goal"),
        exitCondition: str(s, "exitCondition"),
        launchTiming: str(s, "launchTiming"),
        actions: str(s, "actions"),
        completionCriteria: str(s, "completionCriteria"),
        kpiArea: str(s, "kpiArea"),
        kpiTarget: str(s, "kpiTarget"),
        kpiReviewFrequency: str(s, "kpiReviewFrequency"),
        kpiActual: str(s, "kpiActual"),
        whyItMatters: str(s, "whyItMatters"),
        answer: str(s, "answer"),
      }),
    },
    state,
    undo,
  );
};

const validationAnswer: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const key = ref.key ?? "";
  if (!(await findQuestion(tx, validationId, key))) {
    if (undo) return null;
    throw notFound();
  }
  const t = schema.validationAnswers;
  return restoreKeyed(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.validationId, validationId), eq(t.questionKey, key)))
            .for("update")
        )[0],
      snapshot: (row, evidence) => answerSnapshot(row, evidence),
      evidence: { type: "validation_answer", id: validationId, key },
      write: async (row, values) =>
        (row
          ? await tx.update(t).set(values).where(eq(t.id, row.id)).returning()
          : await tx
              .insert(t)
              .values({ ...values, validationId, questionKey: key } as never)
              .returning())[0] as NonNullable<typeof row>,
      columns: (s) => ({
        text: str(s, "text"),
        fau: str(s, "fau"),
        confidence: str(s, "confidence"),
      }),
    },
    state,
  );
};

const economicsInput: Handler = async (tx, env, ref, state, undo) => {
  const validationId = validationIdOf(env, ref);
  const key = ref.key as (typeof ECONOMICS_FIELDS)[number];
  if (!ECONOMICS_FIELDS.includes(key)) {
    if (undo) return null;
    throw notFound();
  }
  const t = schema.economicsInputs;
  return restoreKeyed(
    tx,
    env,
    {
      validationId,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.validationId, validationId), eq(t.fieldKey, key)))
            .for("update")
        )[0],
      snapshot: (row, evidence) => economicsSnapshot(row, evidence),
      evidence: { type: "economics_input", id: validationId, key },
      write: async (row, values) =>
        (row
          ? await tx.update(t).set(values).where(eq(t.id, row.id)).returning()
          : await tx
              .insert(t)
              .values({ ...values, validationId, fieldKey: key } as never)
              .returning())[0] as NonNullable<typeof row>,
      columns: (s) => ({
        value: num(s, "value"),
        fau: str(s, "fau"),
        confidence: str(s, "confidence"),
      }),
    },
    state,
  );
};

const selfAnalysisAnswer: Handler = async (tx, env, ref, state, undo) => {
  const analysisId = env.access.container.id;
  if (env.access.container.type !== "self_analysis" || ref.id !== analysisId) throw notFound();
  const key = ref.key ?? "";
  const [analysis] = await tx
    .select()
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.id, analysisId));
  if (!analysis) throw notFound();
  const sections = await loadTemplateSections(tx, analysis.templateVersionId);
  if (!sections.some(({ rows }) => rows.some((q) => q.key === key))) {
    if (undo) return null;
    throw notFound();
  }
  const t = schema.selfAnalysisAnswers;
  return restoreKeyed(
    tx,
    env,
    {
      validationId: null,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.selfAnalysisId, analysisId), eq(t.questionKey, key)))
            .for("update")
        )[0],
      snapshot: (row) => selfAnalysisAnswerSnapshot(row),
      evidence: null,
      write: async (row, values) => {
        const saved = (
          row
            ? await tx.update(t).set(values).where(eq(t.id, row.id)).returning()
            : await tx
                .insert(t)
                .values({ ...values, selfAnalysisId: analysisId, questionKey: key } as never)
                .returning()
        )[0] as NonNullable<typeof row>;
        if (analysis.status === "not_started") {
          await tx
            .update(schema.selfAnalyses)
            .set({ status: "in_progress" })
            .where(eq(schema.selfAnalyses.id, analysisId));
        }
        return saved;
      },
      columns: (s) => ({ text: str(s, "text"), amount: num(s, "amount") }),
    },
    state,
  );
};

const planAnswer: Handler = async (tx, env, ref, state, undo) => {
  const planId = planIdOf(env, ref);
  const key = ref.key ?? "";
  if (!(await findPlanQuestion(tx, planId, key))) {
    if (undo) return null;
    throw notFound();
  }
  const t = schema.planAnswers;
  return restoreKeyed(
    tx,
    env,
    {
      validationId: null,
      load: async () =>
        (
          await tx
            .select()
            .from(t)
            .where(and(eq(t.businessPlanId, planId), eq(t.questionKey, key)))
            .for("update")
        )[0],
      snapshot: (row) => planAnswerSnapshot(row),
      evidence: null,
      write: async (row, values) =>
        (row
          ? await tx.update(t).set(values).where(eq(t.id, row.id)).returning()
          : await tx
              .insert(t)
              .values({ ...values, businessPlanId: planId, questionKey: key } as never)
              .returning())[0] as NonNullable<typeof row>,
      columns: (s) => ({
        text: str(s, "text"),
        rows: (s.rows as unknown[] | null | undefined) ?? null,
      }),
    },
    state,
  );
};

const planHeader: Handler = async (tx, env, ref, state) => {
  const planId = planIdOf(env, ref);
  if (state == null) throw refused("entryId", "The plan header cannot be removed");
  const t = schema.businessPlans;
  const [row] = await tx.select().from(t).where(eq(t.id, planId)).for("update");
  if (!row) throw notFound();
  return async () => {
    const next = {
      name: str(state, "name") ?? row.name,
      businessName: str(state, "businessName") ?? row.businessName,
      preparedBy: str(state, "preparedBy") ?? row.preparedBy,
    };
    if (next.name !== row.name) {
      await assertPlanNameFree(tx, env.access.ideaId as string, next.name, planId);
    }
    await namedPlanWrite(() =>
      tx
        .update(t)
        .set({
          ...next,
          lockVersion: row.lockVersion + 1,
          updatedById: env.userId,
          updatedAt: env.now,
        })
        .where(eq(t.id, planId)),
    );
    return { before: planHeaderSnapshot(row), after: planHeaderSnapshot(next), action: "restore" };
  };
};

const idea: Handler = async (tx, env, ref, state) => {
  const ideaId = env.access.ideaId;
  if (env.access.container.type !== "idea" || !ideaId || ref.id !== ideaId) throw notFound();
  if (state == null) throw refused("entryId", "The idea summary cannot be removed");
  const t = schema.ideas;
  const [row] = await tx.select().from(t).where(eq(t.id, ideaId)).for("update");
  if (!row) throw notFound();
  return async () => {
    const next = {
      name: str(state, "name") ?? row.name,
      oneLineConcept: str(state, "oneLineConcept") ?? row.oneLineConcept,
      proposedSolution: str(state, "proposedSolution"),
    };
    await tx
      .update(t)
      .set({
        ...next,
        lockVersion: row.lockVersion + 1,
        updatedById: env.userId,
        updatedAt: env.now,
      })
      .where(eq(t.id, ideaId));
    return { before: ideaSnapshot(row), after: ideaSnapshot(next), action: "restore" };
  };
};

const HANDLERS: Partial<Record<TargetType, Handler>> = {
  research_log_entry: researchLog,
  competitor,
  assumption,
  risk,
  cost_item: costItem,
  execution_item: executionItem,
  validation_answer: validationAnswer,
  economics_input: economicsInput,
  self_analysis_answer: selfAnalysisAnswer,
  plan_answer: planAnswer,
  business_plan: planHeader,
  idea,
};

/** Who reverts, when, and through which request. */
export interface RevertContext {
  user: { id: string; timezone: string };
  request: Request;
  now: Date;
}

const refOf = (row: HistoryRow): Ref => ({
  type: row.targetType as TargetType,
  id: row.targetId,
  key: row.targetKey,
});

/** The last step of a write on a history container: marks it active and refuses an archived one. */
export async function touchContainer(tx: Tx, access: HistoryAccess, now: Date): Promise<void> {
  const workspaceId = access.workspaceId as string;
  const ideaId = access.ideaId as string;
  if (access.container.type === "business_plan") {
    await touchPlanActivity(tx, { workspaceId, ideaId, planId: access.planId as string }, now);
  } else if (access.container.type !== "self_analysis") {
    await touchValidationActivity(tx, { workspaceId, ideaId }, now);
  }
}

/**
 * Prepares one revert and writes it with its history row: action `restore` (or `delete` when the
 * revert removes a row that an operation created), source `revert`, `revertedFromId` the entry.
 * Returns the new history row id, or null when there was nothing to do.
 */
async function applyAndRecord(
  tx: Tx,
  env: Env,
  request: Request,
  entry: HistoryRow,
  state: State | null,
  undo: boolean,
  batchId: string | null,
): Promise<string | null> {
  const handler = HANDLERS[entry.targetType as TargetType];
  if (!handler) throw refused("entryId", "This entry cannot be reverted");
  const execute = await handler(tx, env, refOf(entry), state, undo);
  if (!execute) return null;
  const entryId = crypto.randomUUID();
  // The action is only known once the revert has run, and withHistory reads it afterwards.
  const meta: HistoryMeta = {
    entryId,
    container: { type: entry.containerType, id: entry.containerId },
    workspaceId: entry.workspaceId,
    ownerUserId: entry.ownerUserId,
    sectionKey: entry.sectionKey,
    target: refOf(entry),
    actor: historyActor(request, { id: env.userId }, "revert", batchId),
    revertedFromId: entry.id,
  };
  await withHistory(tx, meta, async () => {
    const applied = await execute();
    meta.action = applied.action;
    return { result: undefined, before: applied.before, after: applied.after };
  });
  return entryId;
}

const loadRow = async (db: Executor, id: string) =>
  (await db.select().from(schema.changeHistory).where(eq(schema.changeHistory.id, id)))[0];

/** The history row's container, checked against the row's own workspace. */
async function accessOf(db: Executor, user: { id: string }, entry: HistoryRow) {
  const access = await resolveContainer(db, user, entry.containerType, entry.containerId);
  if (access.workspaceId !== entry.workspaceId) throw notFound();
  return access;
}

/** The DTO of the item in the shape of its own GET / PATCH endpoint (SDD 5.11 H2 `target`). */
async function viewTarget(
  db: Executor,
  access: HistoryAccess,
  user: { id: string; timezone: string },
  ref: Ref,
  now: Date,
): Promise<unknown> {
  const workspaceId = access.workspaceId as string;
  const validationId = access.validationId as string;
  switch (ref.type) {
    case "validation_answer":
      return (await loadValidationAnswers(db, workspaceId, validationId, [ref.key ?? ""]))[0];
    case "economics_input":
    case "competitor":
    case "assumption":
    case "risk":
    case "cost_item": {
      const data = (await loadValidationData(db, [validationId])).get(validationId);
      if (!data) throw notFound();
      const rows =
        ref.type === "competitor"
          ? data.competitors
          : ref.type === "assumption"
            ? data.assumptions
            : ref.type === "risk"
              ? data.risks
              : ref.type === "cost_item"
                ? data.costItems
                : data.economicsInputs;
      const refs = await userRefsOf(db, workspaceId, rows);
      const comments =
        ref.type === "economics_input"
          ? await commentCountsByKey(db, workspaceId, "economics_input", validationId, [
              ...ECONOMICS_FIELDS,
            ])
          : await commentCountsById(
              db,
              workspaceId,
              ref.type,
              rows.map((r) => (r as { id: string }).id),
            );
      const c: DtoContext = { data, refs, comments };
      if (ref.type === "economics_input") {
        const field = ref.key as (typeof ECONOMICS_FIELDS)[number];
        return toEconomicsInput(
          c,
          field,
          data.economicsInputs.find((r) => r.fieldKey === field),
        );
      }
      const found = (rows as { id: string }[]).find((r) => r.id === ref.id);
      if (!found) throw notFound();
      if (ref.type === "competitor") return toCompetitor(c, found as (typeof data.competitors)[0]);
      if (ref.type === "assumption") return toAssumption(c, found as (typeof data.assumptions)[0]);
      if (ref.type === "risk") return toRisk(c, found as (typeof data.risks)[0]);
      return toCostItem(c, found as (typeof data.costItems)[0]);
    }
    case "research_log_entry": {
      const [row] = await db
        .select()
        .from(schema.researchLogEntries)
        .where(eq(schema.researchLogEntries.id, ref.id));
      if (!row) throw notFound();
      return (await toResearchLogEntries(db, workspaceId, [row]))[0];
    }
    case "execution_item": {
      const [row] = await db
        .select()
        .from(schema.executionItems)
        .where(eq(schema.executionItems.id, ref.id));
      if (!row) throw notFound();
      return (
        await buildExecutionItems(db, { workspaceId, today: todayIn(user.timezone, now) }, [row])
      )[0];
    }
    case "self_analysis_answer": {
      const [analysis] = await db
        .select()
        .from(schema.selfAnalyses)
        .where(eq(schema.selfAnalyses.id, ref.id));
      if (!analysis) throw notFound();
      return (await buildSelfAnalysisAnswers(db, analysis, [ref.key ?? ""]))[0];
    }
    case "plan_answer": {
      const rows = await db
        .select()
        .from(schema.planAnswers)
        .where(
          and(
            eq(schema.planAnswers.businessPlanId, ref.id),
            eq(schema.planAnswers.questionKey, ref.key ?? ""),
          ),
        );
      return (await buildPlanAnswers(db, workspaceId, ref.id, rows, [ref.key ?? ""]))[0];
    }
    case "business_plan": {
      const bundle = await loadPlanBundle(db, ref.id);
      return buildPlanHome(
        db,
        bundle,
        { role: access.role as "owner" | "member" | "viewer", today: todayIn(user.timezone, now) },
        null,
      );
    }
    case "idea": {
      const [row] = await db.select().from(schema.ideas).where(eq(schema.ideas.id, ref.id));
      const [loaded] = await loadIdeas(db, workspaceId, row ? [row] : []);
      if (!loaded) throw notFound();
      return loaded.detail;
    }
    default:
      throw notFound();
  }
}

/**
 * H2. Restores the item to the state right after the entry (the state before it for a `delete`
 * entry, which undoes the deletion). The revert is a new history row; the lock version goes up
 * and no conflict is checked, because restoring is an overwrite the person chose (ADR-019).
 */
export async function revertEntry(
  db: Db,
  ctx: RevertContext,
  entryId: string,
): Promise<{ entry: HistoryEntry; target: unknown }> {
  const entry = await loadRow(db, entryId);
  if (!entry) throw notFound();
  const access = await accessOf(db, ctx.user, entry);
  requireRevertable(access);
  if (NOT_RESTORABLE.has(entry.targetType as TargetType)) {
    throw refused("entryId", "This entry cannot be reverted one at a time");
  }
  const state = (entry.action === "delete" ? entry.before : entry.after) as State | null;
  if (state == null) throw refused("entryId", "This entry holds no state to restore");

  const newId = await db.transaction(async (tx) => {
    const id = await applyAndRecord(
      tx,
      { access, userId: ctx.user.id, now: ctx.now },
      ctx.request,
      entry,
      state,
      false,
      null,
    );
    await touchContainer(tx, access, ctx.now);
    return id as string;
  });
  const [written] = await toHistoryEntries(db, access, [(await loadRow(db, newId)) as HistoryRow]);
  return {
    entry: written as HistoryEntry,
    target: await viewTarget(db, access, ctx.user, refOf(entry), ctx.now),
  };
}

/** Restores the pinned template version of a container to the one a migration row recorded. */
async function restoreTemplateVersion(
  tx: Tx,
  env: Env,
  request: Request,
  entry: HistoryRow,
  batchId: string,
): Promise<boolean> {
  const wanted = entry.before as { versionId: string; versionNumber: number } | null;
  if (!wanted) return false;
  const kind = entry.targetKey;
  const table =
    kind === "self_analysis"
      ? schema.selfAnalyses
      : kind === "validation"
        ? schema.validations
        : schema.businessPlans;
  const [row] = await tx
    .select({ versionId: table.templateVersionId })
    .from(table)
    .where(eq(table.id, entry.targetId))
    .for("update");
  if (!row) throw notFound();
  if (row.versionId === wanted.versionId) return false;
  const [current] = await tx
    .select({ versionNumber: schema.templateVersions.versionNumber })
    .from(schema.templateVersions)
    .where(eq(schema.templateVersions.id, row.versionId));
  const [target] = await tx
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .where(eq(schema.templateVersions.id, wanted.versionId));
  if (!target) throw notFound();
  await withHistory(
    tx,
    {
      container: { type: entry.containerType, id: entry.containerId },
      workspaceId: entry.workspaceId,
      ownerUserId: entry.ownerUserId,
      sectionKey: entry.sectionKey,
      target: refOf(entry),
      actor: historyActor(request, { id: env.userId }, "revert", batchId),
      action: "restore",
      revertedFromId: entry.id,
    },
    async () => {
      await tx
        .update(table)
        .set({ templateVersionId: wanted.versionId })
        .where(eq(table.id, entry.targetId));
      return {
        result: undefined,
        before: { versionId: row.versionId, versionNumber: current?.versionNumber ?? null },
        after: wanted,
      };
    },
  );
  return true;
}

/**
 * H3. Takes back one operation (AI import, template migration, or an earlier revert) in one
 * transaction: each row of the batch, newest first, goes back to its state before the operation,
 * and is recorded as a revert of its own under a new `batchId`. Rows whose item no longer exists
 * (a question the template no longer has, a row deleted since) are skipped and not counted.
 * A plan draft or a duplicate would have to delete the records it made, which no design document
 * allows, so those batches are refused.
 */
export async function revertBatch(
  db: Db,
  ctx: RevertContext,
  batchId: string,
): Promise<{ reverted: number; batchId: string }> {
  const batchRows = (d: Executor) =>
    d
      .select()
      .from(schema.changeHistory)
      .where(eq(schema.changeHistory.batchId, batchId))
      .orderBy(desc(schema.changeHistory.changedAt), desc(schema.changeHistory.id));
  const first = (await batchRows(db))[0];
  if (!first) throw notFound();
  const access = await accessOf(db, ctx.user, first);
  requireRevertable(access);

  const newBatchId = crypto.randomUUID();
  const env: Env = { access, userId: ctx.user.id, now: ctx.now };
  const reverted = await db.transaction(async (tx) => {
    // The advisory lock makes a repeated or concurrent request for the same batch wait, so the
    // check below sees the revert the first one committed. It comes before the row locks so
    // that the waiting request holds none of them.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${batchId}::text, 0))`);
    const rows = await batchRows(tx);
    if (
      rows.some(
        (r) => r.containerType !== first.containerType || r.containerId !== first.containerId,
      )
    ) {
      throw refused("batchId", "The batch spans more than one screen");
    }
    if (rows.some((r) => !UNDOABLE_SOURCES.has(r.source))) {
      throw refused("batchId", "This kind of operation cannot be taken back");
    }
    await assertNotTakenBack(
      tx,
      rows.map((r) => r.id),
    );

    let count = 0;
    for (const row of rows) {
      let done: boolean;
      if (row.targetType === "template_version") {
        done = await restoreTemplateVersion(tx, env, ctx.request, row, newBatchId);
      } else {
        done =
          (await applyAndRecord(
            tx,
            env,
            ctx.request,
            row,
            row.before as State | null,
            true,
            newBatchId,
          )) != null;
      }
      if (done) count += 1;
    }
    await touchContainer(tx, access, ctx.now);
    return count;
  });
  return { reverted, batchId: newBatchId };
}

/**
 * 409 CONFLICT while a revert batch of these rows stands: taking the same batch back twice would
 * overwrite what was edited after the first revert. A revert that was itself taken back no longer
 * stands, so the original can be reverted again. Single-entry reverts (H2) carry no batch.
 */
async function assertNotTakenBack(tx: Tx, entryIds: string[]): Promise<void> {
  const h = schema.changeHistory;
  const reverts = await tx
    .selectDistinct({ batchId: h.batchId })
    .from(h)
    .where(and(eq(h.source, "revert"), isNotNull(h.batchId), inArray(h.revertedFromId, entryIds)));
  for (const { batchId: revertBatchId } of reverts) {
    const own = tx
      .select({ id: h.id })
      .from(h)
      .where(eq(h.batchId, revertBatchId as string));
    const [undone] = await tx
      .select({ id: h.id })
      .from(h)
      .where(and(eq(h.source, "revert"), isNotNull(h.batchId), inArray(h.revertedFromId, own)))
      .limit(1);
    if (!undone) throw new ApiError("CONFLICT", "This operation has already been taken back");
  }
}
