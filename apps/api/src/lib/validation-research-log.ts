import { isDeepStrictEqual } from "node:util";
import { schema } from "@moonx/db";
import { createI18n } from "@moonx/i18n";
import type {
  EvidenceUsage,
  ResearchLogEntry,
  ResearchLogInput,
  UpdateResearchLogBody,
  UserRef,
} from "@moonx/schemas";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { ApiError } from "../errors";
import { HISTORY_SECTION } from "../history/sections";
import { researchLogSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Executor, Tx } from "./db";
import { excerpt } from "./decision-log";
import { versionedOf } from "./dto";
import { type LockedTarget, linkTargetOf, targetRefOf } from "./evidence-write";
import { loadUserRefs } from "./users";
import {
  type AnswerRow,
  type ECONOMICS_FIELDS,
  isActiveEvidence,
  loadValidationData,
  type ResearchLogRow,
  type ValidationData,
} from "./validation-data";
import { checkLockLazily, touchValidationActivity } from "./validation-write";

const t = createI18n().t;

const blankToNull = (value: string | null | undefined) =>
  value == null || value.trim() === "" ? null : value;

/** Column values of a research log from request fields; blank optional text is stored as null. */
export function researchLogValues(input: Partial<ResearchLogInput>) {
  const values: Partial<typeof schema.researchLogEntries.$inferInsert> = {};
  if (input.observedOn !== undefined) values.observedOn = input.observedOn;
  if (input.topic !== undefined) values.topic = input.topic;
  if (input.observation !== undefined) values.observation = blankToNull(input.observation);
  if (input.sourceType !== undefined) values.sourceType = input.sourceType;
  if (input.sourceUrl !== undefined) values.sourceUrl = input.sourceUrl;
  if (input.supportsChecks !== undefined) values.supportsChecks = input.supportsChecks;
  if (input.supportsNote !== undefined) values.supportsNote = blankToNull(input.supportsNote);
  return values;
}

/**
 * Inserts a research log entry and its `create` history row. Used by V6 and by V4's
 * `newResearchLog`, which must write both in the caller's transaction.
 */
export async function insertResearchLog(
  tx: Tx,
  opts: {
    workspaceId: string;
    validationId: string;
    input: ResearchLogInput;
    actor: HistoryActor;
    now: Date;
  },
): Promise<ResearchLogRow> {
  const id = crypto.randomUUID();
  return withHistory(
    tx,
    {
      container: { type: "validation", id: opts.validationId },
      workspaceId: opts.workspaceId,
      sectionKey: HISTORY_SECTION.researchLog,
      target: { type: "research_log_entry", id },
      actor: opts.actor,
    },
    async () => {
      const [row] = await tx
        .insert(schema.researchLogEntries)
        .values({
          ...researchLogValues(opts.input),
          id,
          topic: opts.input.topic,
          validationId: opts.validationId,
          createdById: opts.actor.userId,
          updatedById: opts.actor.userId,
          lockVersion: 0,
          createdAt: opts.now,
          updatedAt: opts.now,
        })
        .returning();
      const created = row as ResearchLogRow;
      return { result: created, before: null, after: researchLogSnapshot(created) };
    },
  );
}

/** Counts of active evidence links and comments per research log entry. */
async function loadCounts(db: Executor, workspaceId: string, ids: string[]) {
  const used = new Map<string, number>();
  const comments = new Map<string, number>();
  if (ids.length === 0) return { used, comments };
  const usedRows = await db
    .select({ id: schema.evidenceLinks.researchLogEntryId, n: count() })
    .from(schema.evidenceLinks)
    .where(
      and(
        inArray(schema.evidenceLinks.researchLogEntryId, ids),
        isNull(schema.evidenceLinks.deletedAt),
      ),
    )
    .groupBy(schema.evidenceLinks.researchLogEntryId);
  for (const r of usedRows) if (r.id) used.set(r.id, r.n);
  const commentRows = await db
    .select({ id: schema.comments.targetId, n: count() })
    .from(schema.comments)
    .where(
      and(
        eq(schema.comments.workspaceId, workspaceId),
        eq(schema.comments.targetType, "research_log_entry"),
        inArray(schema.comments.targetId, ids),
        isNull(schema.comments.deletedAt),
      ),
    )
    .groupBy(schema.comments.targetId);
  for (const r of commentRows) comments.set(r.id, r.n);
  return { used, comments };
}

/** SDD 5.7 ResearchLogEntry for each row, in the order given. */
export async function toResearchLogEntries(
  db: Executor,
  workspaceId: string,
  rows: ResearchLogRow[],
): Promise<ResearchLogEntry[]> {
  if (rows.length === 0) return [];
  const refs = await loadUserRefs(
    db,
    rows.flatMap((r) => [r.createdById, r.updatedById]),
    workspaceId,
  );
  const { used, comments } = await loadCounts(
    db,
    workspaceId,
    rows.map((r) => r.id),
  );
  return rows.map((row) => ({
    ...versionedOf(row, refs),
    id: row.id,
    observedOn: row.observedOn,
    topic: row.topic,
    observation: row.observation,
    sourceType: row.sourceType,
    sourceUrl: row.sourceUrl,
    supportsChecks: row.supportsChecks,
    supportsNote: row.supportsNote,
    createdBy: refs.get(row.createdById) as UserRef,
    usedAsEvidenceCount: used.get(row.id) ?? 0,
    commentCount: comments.get(row.id) ?? 0,
  }));
}

/**
 * The items whose evidence includes the entry, with whether the entry is all that keeps a Fact
 * a Fact. Deleted rows are not listed: nothing can open them.
 */
export async function loadEvidenceUsages(
  db: Executor,
  data: ValidationData,
  ids: { workspaceId: string; ideaId: string },
  logId: string,
): Promise<EvidenceUsage[]> {
  const links = data.evidence
    .filter((l) => l.researchLogEntryId === logId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  if (links.length === 0) return [];

  const titles = new Map<string, string>();
  if (links.some((l) => l.targetType === "validation_answer")) {
    const questions = await db
      .select({
        key: schema.templateQuestions.questionKey,
        title: schema.templateQuestions.title,
      })
      .from(schema.templateQuestions)
      .where(eq(schema.templateQuestions.templateVersionId, data.templateVersionId));
    for (const q of questions) titles.set(q.key, q.title);
  }

  const otherActive = (link: (typeof links)[number]) =>
    data.evidence.filter(
      (e) =>
        e.id !== link.id &&
        e.targetType === link.targetType &&
        e.targetId === link.targetId &&
        (e.targetKey ?? null) === (link.targetKey ?? null) &&
        isActiveEvidence(data, e),
    ).length;

  const usages: EvidenceUsage[] = [];
  for (const link of links) {
    const stub = (target: LockedTarget, label: string, fau: string | null) => {
      const ref = targetRefOf(target, data.validationId);
      usages.push({
        target: ref,
        label,
        link: linkTargetOf(target, ids),
        isOnlyEvidenceOfFact: fau === "fact" && otherActive(link) === 0,
      });
    };
    switch (link.targetType) {
      case "validation_answer": {
        const question = data.questions.find((q) => q.key === link.targetKey);
        if (!question || !link.targetKey) break;
        const row: AnswerRow | undefined = data.answers.find(
          (a) => a.questionKey === link.targetKey,
        );
        stub(
          {
            type: "validation_answer",
            key: link.targetKey,
            sectionKey: question.sectionKey,
            row: row ?? null,
          },
          `${question.sectionKey} ${titles.get(link.targetKey) ?? link.targetKey}`,
          row?.fau ?? null,
        );
        break;
      }
      case "economics_input": {
        const row = data.economicsInputs.find((r) => r.fieldKey === link.targetKey);
        const field = link.targetKey as (typeof ECONOMICS_FIELDS)[number];
        stub(
          { type: "economics_input", key: field, row: row ?? null },
          t(`validation:economicsFields.${field}`),
          row?.fau ?? null,
        );
        break;
      }
      case "cost_item": {
        const row = data.costItems.find((r) => r.id === link.targetId);
        if (row) stub({ type: "cost_item", row }, row.name, row.fau);
        break;
      }
      case "competitor": {
        const row = data.competitors.find((r) => r.id === link.targetId);
        if (row) stub({ type: "competitor", row }, row.name, null);
        break;
      }
      case "assumption": {
        const row = data.assumptions.find((r) => r.id === link.targetId);
        if (row) stub({ type: "assumption", row }, excerpt(row.statement) ?? "", null);
        break;
      }
    }
  }
  return usages;
}

interface ResearchLogContext {
  workspaceId: string;
  ideaId: string;
  validationId: string;
  actor: HistoryActor;
  now: Date;
}

async function lockEntry(tx: Tx, validationId: string, entryId: string): Promise<ResearchLogRow> {
  const [row] = await tx
    .select()
    .from(schema.researchLogEntries)
    .where(
      and(
        eq(schema.researchLogEntries.id, entryId),
        eq(schema.researchLogEntries.validationId, validationId),
        isNull(schema.researchLogEntries.deletedAt),
      ),
    )
    .for("update");
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  return row;
}

const historyMeta = (ctx: ResearchLogContext, entryId: string) => ({
  container: { type: "validation" as const, id: ctx.validationId },
  workspaceId: ctx.workspaceId,
  sectionKey: HISTORY_SECTION.researchLog,
  target: { type: "research_log_entry" as const, id: entryId },
  actor: ctx.actor,
});

/** V7 PATCH. A request that changes nothing writes nothing and keeps the version. */
export async function updateResearchLog(
  tx: Tx,
  ctx: ResearchLogContext,
  entryId: string,
  body: UpdateResearchLogBody,
): Promise<ResearchLogEntry> {
  const row = await lockEntry(tx, ctx.validationId, entryId);
  const entryOf = async (current: ResearchLogRow) =>
    (await toResearchLogEntries(tx, ctx.workspaceId, [current]))[0] as ResearchLogEntry;
  const lockVersion = await checkLockLazily(tx, {
    workspaceId: ctx.workspaceId,
    row,
    sent: { lockVersion: body.lockVersion, force: body.force },
    currentValue: () => entryOf(row),
  });

  const { lockVersion: _lock, force: _force, ...fields } = body;
  const values = researchLogValues(fields);
  const before = researchLogSnapshot(row);
  const after = researchLogSnapshot({ ...row, ...values } as ResearchLogRow);
  if (isDeepStrictEqual(before, after)) return entryOf(row);

  const saved = await withHistory(tx, historyMeta(ctx, entryId), async () => {
    const [updated] = await tx
      .update(schema.researchLogEntries)
      .set({ ...values, lockVersion, updatedById: ctx.actor.userId, updatedAt: ctx.now })
      .where(eq(schema.researchLogEntries.id, entryId))
      .returning();
    return { result: updated as ResearchLogRow, before, after };
  });
  await touchValidationActivity(tx, ctx, ctx.now);
  return entryOf(saved);
}

/**
 * V7 DELETE. Soft-deletes the entry and returns the items it was evidence of. The links stay
 * (history can restore the entry) but stop counting, so a Fact that rested on it only becomes
 * "Fact (no evidence)" (design-spec 6.0.3).
 */
export async function deleteResearchLog(
  tx: Tx,
  ctx: ResearchLogContext,
  entryId: string,
): Promise<EvidenceUsage[]> {
  const row = await lockEntry(tx, ctx.validationId, entryId);
  const data = (await loadValidationData(tx, [ctx.validationId])).get(ctx.validationId);
  if (!data) throw new ApiError("NOT_FOUND", "Resource not found");
  const affected = await loadEvidenceUsages(tx, data, ctx, entryId);
  await withHistory(tx, historyMeta(ctx, entryId), async () => {
    await tx
      .update(schema.researchLogEntries)
      .set({
        deletedAt: ctx.now,
        lockVersion: row.lockVersion + 1,
        updatedById: ctx.actor.userId,
        updatedAt: ctx.now,
      })
      .where(eq(schema.researchLogEntries.id, entryId));
    return { result: undefined, before: researchLogSnapshot(row), after: null };
  });
  await touchValidationActivity(tx, ctx, ctx.now);
  return affected;
}
