import {
  assumptions,
  competitors,
  costItems,
  type Database,
  type DatabaseTransaction,
  economicsInputs,
  evidenceLinks,
  researchLogContent,
  researchLogEntries,
  validationAnswers,
} from "@moonx/db";
import {
  type EvidenceUsage,
  errorBodySchema,
  type Fau,
  type ResearchLogEntry,
  researchLogDeletionSchema,
  researchLogDetailSchema,
  researchLogEntrySchema,
  researchLogInputSchema,
  researchLogListQuerySchema,
  researchLogPageSchema,
  researchLogUpdateSchema,
  type TargetRef,
} from "@moonx/schemas";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { withHistory } from "./history";
import { loadItemLabels } from "./labels";
import { itemLink } from "./links";
import { type Scope, writeInScope } from "./scope";
import { loadUserRefs } from "./user-refs";
import { validationTemplate } from "./validation";
import {
  type EvidenceRef,
  itemKey,
  loadCommentCounts,
  loadEvidence,
} from "./validation-items";
import {
  deleteListRow,
  listRowLocator,
  lockListRow,
  updateListRow,
  validationOperation,
  versionedView,
} from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type LogRow = typeof researchLogEntries.$inferSelect;

const contains = (text: string | null, needle: string) =>
  (text ?? "").toLocaleLowerCase("en").includes(needle.toLocaleLowerCase("en"));

/** The items that cite each research log entry, by entry. */
interface Usages {
  /** The items shown, in the order the evidence was attached. */
  shown: Map<string, EvidenceRef[]>;
  /** How many answers a template migration hid cite it (design-spec 6.0.7). */
  hidden: Map<string, number>;
}

/**
 * The items that cite each entry of `logIds` as evidence (SDD 5.7 V6・V7), through
 * links not detached. Rows deleted count nowhere (SDD 6.5). Answers to questions the
 * pinned version lacks, which a migration hid, are not shown but counted apart, so
 * deleting an entry they cite still warns of them (design-spec 6.0.3, 6.0.7).
 */
async function loadUsages(
  db: Executor,
  validationId: string,
  logIds: readonly string[],
): Promise<Usages> {
  const usages: Usages = { shown: new Map(), hidden: new Map() };
  if (logIds.length === 0) return usages;
  const links = await db
    .select({
      logId: evidenceLinks.researchLogEntryId,
      type: evidenceLinks.targetType,
      id: evidenceLinks.targetId,
      key: evidenceLinks.targetKey,
    })
    .from(evidenceLinks)
    .where(
      and(
        eq(evidenceLinks.validationId, validationId),
        inArray(evidenceLinks.researchLogEntryId, [...logIds]),
        isNull(evidenceLinks.deletedAt),
      ),
    )
    .orderBy(asc(evidenceLinks.createdAt), asc(evidenceLinks.id));
  const liveIds = async (
    table: typeof costItems | typeof competitors | typeof assumptions,
    type: EvidenceRef["type"],
  ) => {
    const ids = links.filter((link) => link.type === type).map((l) => l.id);
    if (ids.length === 0) return new Set<string>();
    const rows = await db
      .select({ id: table.id })
      .from(table as typeof competitors)
      .where(and(inArray(table.id, ids), isNull(table.deletedAt)));
    return new Set(rows.map((row) => row.id));
  };
  const live = {
    cost_item: await liveIds(costItems, "cost_item"),
    competitor: await liveIds(competitors, "competitor"),
    assumption: await liveIds(assumptions, "assumption"),
  };
  const questionKeys = links.some((link) => link.type === "validation_answer")
    ? new Set(
        (await validationTemplate(db, validationId)).sections.flatMap(
          (section) => section.questions.map((question) => question.key),
        ),
      )
    : new Set<string>();
  const hiddenKeys = new Map<string, Set<string>>();
  for (const link of links) {
    if (link.logId === null) continue;
    if (
      link.type === "validation_answer" &&
      !questionKeys.has(link.key ?? "")
    ) {
      const keys = hiddenKeys.get(link.logId) ?? new Set<string>();
      keys.add(link.key ?? "");
      hiddenKeys.set(link.logId, keys);
      continue;
    }
    if (
      (link.type === "cost_item" ||
        link.type === "competitor" ||
        link.type === "assumption") &&
      !live[link.type].has(link.id)
    ) {
      continue;
    }
    const list = usages.shown.get(link.logId) ?? [];
    const target = { type: link.type, id: link.id, key: link.key };
    if (!list.some((other) => itemKey(other) === itemKey(target))) {
      list.push(target);
    }
    usages.shown.set(link.logId, list);
  }
  for (const [logId, keys] of hiddenKeys) usages.hidden.set(logId, keys.size);
  return usages;
}

/** The F/A/U of each item of `targets` that takes it, keyed by `itemKey`. */
async function loadFau(
  db: Executor,
  validationId: string,
  targets: readonly EvidenceRef[],
): Promise<Map<string, Fau | null>> {
  const keysOf = (type: EvidenceRef["type"]) =>
    targets.filter((t) => t.type === type).map((t) => t.key ?? "");
  const faus = new Map<string, Fau | null>();
  const answerKeys = keysOf("validation_answer");
  if (answerKeys.length > 0) {
    const rows = await db
      .select({
        key: validationAnswers.questionKey,
        fau: validationAnswers.fau,
      })
      .from(validationAnswers)
      .where(
        and(
          eq(validationAnswers.validationId, validationId),
          inArray(validationAnswers.questionKey, answerKeys),
        ),
      );
    for (const row of rows) {
      faus.set(
        itemKey({ type: "validation_answer", id: validationId, key: row.key }),
        row.fau,
      );
    }
  }
  if (keysOf("economics_input").length > 0) {
    const rows = await db
      .select({ key: economicsInputs.fieldKey, fau: economicsInputs.fau })
      .from(economicsInputs)
      .where(eq(economicsInputs.validationId, validationId));
    for (const row of rows) {
      faus.set(
        itemKey({ type: "economics_input", id: validationId, key: row.key }),
        row.fau,
      );
    }
  }
  const costIds = targets
    .filter((t) => t.type === "cost_item")
    .map((t) => t.id);
  if (costIds.length > 0) {
    const rows = await db
      .select({ id: costItems.id, fau: costItems.fau })
      .from(costItems)
      .where(inArray(costItems.id, costIds));
    for (const row of rows) {
      faus.set(itemKey({ type: "cost_item", id: row.id }), row.fau);
    }
  }
  return faus;
}

/**
 * The items shown that cite the entry `logId` (SDD 5.7 EvidenceUsage), as `viewerId`
 * opens them, and how many answers a migration hid cite it. A Fact is left without
 * evidence by its deletion when every link that counts is to this entry.
 */
async function usageViews(
  db: Executor,
  scope: Scope,
  viewerId: string,
  validationId: string,
  logId: string,
): Promise<{ usages: EvidenceUsage[]; hiddenCount: number }> {
  const loaded = await loadUsages(db, validationId, [logId]);
  const hiddenCount = loaded.hidden.get(logId) ?? 0;
  const targets = loaded.shown.get(logId);
  if (targets === undefined) return { usages: [], hiddenCount };
  const refs: TargetRef[] = targets.map((t) => ({
    type: t.type,
    id: t.id,
    key: t.key ?? null,
  }));
  const labels = await loadItemLabels(db, refs);
  const evidence = await loadEvidence(db, validationId, targets);
  const faus = await loadFau(db, validationId, targets);
  const place = {
    workspaceId: scope.workspaceId,
    ideaId: scope.ideaId,
    planId: null,
    selfAnalysisOwnerId: null,
  };
  const usages = refs.map((target) => {
    const counting = evidence(target).evidence.filter(
      (item) => item.researchLog === null || !item.researchLog.deleted,
    );
    return {
      target,
      label: labels(target),
      link: itemLink(target, place, viewerId),
      isOnlyEvidenceOfFact:
        faus.get(itemKey(target)) === "fact" &&
        counting.length > 0 &&
        counting.every((item) => item.researchLog?.id === logId),
    };
  });
  return { usages, hiddenCount };
}

/** The entries `rows` of `validationId` as 14 lists them (SDD 5.7 ResearchLogEntry). */
async function entryViews(
  db: Executor,
  workspaceId: string,
  validationId: string,
  rows: readonly LogRow[],
): Promise<ResearchLogEntry[]> {
  const usages = await loadUsages(
    db,
    validationId,
    rows.map((row) => row.id),
  );
  const refs = rows.map((row) => ({
    type: "research_log_entry" as const,
    id: row.id,
  }));
  const comments = await loadCommentCounts(db, refs);
  const users = await loadUserRefs(
    db,
    rows.flatMap((row) => [
      row.createdById,
      ...(row.updatedById === null ? [] : [row.updatedById]),
    ]),
    workspaceId,
  );
  return rows.map((row, index) => {
    const createdBy = users.get(row.createdById);
    if (createdBy === undefined) throw new Error(`No user ${row.createdById}`);
    return {
      id: row.id,
      validationId,
      ...researchLogContent(row),
      ...versionedView(row, users),
      createdBy,
      usedAsEvidenceCount: usages.shown.get(row.id)?.length ?? 0,
      commentCount: comments(refs[index] as (typeof refs)[number]),
    };
  });
}

/** The entry `entryId`, and the validation it is in. */
async function entryView(
  db: Executor,
  workspaceId: string,
  entryId: string,
): Promise<{ view: ResearchLogEntry; validationId: string }> {
  const [row] = await db
    .select()
    .from(researchLogEntries)
    .where(eq(researchLogEntries.id, entryId));
  if (row === undefined) throw new Error(`No research log entry ${entryId}`);
  const [view] = await entryViews(db, workspaceId, row.validationId, [row]);
  if (view === undefined) throw new Error("No research log view");
  return { view, validationId: row.validationId };
}

/** Finds the validation of a research log entry not deleted (V7). */
const entryLocator = listRowLocator(researchLogEntries, "entryId");

/** What the research log routes need from the app. */
export interface ResearchLogRoutesOptions {
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

/** V6–V7 (SDD 5.7): the research log of 14 and M2. */
export function researchLogRoutes({
  access,
  db,
  now,
}: ResearchLogRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/validations/:validationId/research-log",
      async ({ scope, params, query }) => {
        const { validationId } = params;
        const rows = await db
          .select()
          .from(researchLogEntries)
          .where(
            and(
              eq(researchLogEntries.validationId, validationId),
              isNull(researchLogEntries.deletedAt),
              query.supports === undefined
                ? undefined
                : sql`${query.supports} = any(${researchLogEntries.supportsChecks})`,
              query.sourceType === undefined
                ? undefined
                : eq(researchLogEntries.sourceType, query.sourceType),
            ),
          )
          .orderBy(
            sql`${researchLogEntries.observedOn} desc nulls last`,
            desc(researchLogEntries.createdAt),
            asc(researchLogEntries.id),
          );
        const needle = query.q ?? "";
        const matching =
          needle === ""
            ? rows
            : rows.filter(
                (row) =>
                  contains(row.topic, needle) ||
                  contains(row.observation, needle),
              );
        const offset = query.cursor ?? 0;
        const end = offset + query.limit;
        return {
          items: await entryViews(
            db,
            scope.workspaceId,
            validationId,
            matching.slice(offset, end),
          ),
          nextCursor: end < matching.length ? String(end) : null,
        };
      },
      {
        scoped: { to: "validationId", need: "read" },
        query: researchLogListQuerySchema,
        response: {
          200: researchLogPageSchema,
          ...readErrors,
          422: errorBodySchema,
        },
        detail: {
          summary: "V6 The research log (14)",
          description:
            "The newest observation first, entries without a date last, then the newest recorded. supports and sourceType filter; q matches the topic or the observation, ignoring case.",
        },
      },
    )
    .post(
      "/api/v1/validations/:validationId/research-log",
      async ({ scope, params, body, caller, request, status }) => {
        const { validationId } = params;
        const at = new Date(now());
        const entryId = await writeInScope(db, scope, at, async (tx) => {
          const [row] = await tx
            .insert(researchLogEntries)
            .values({
              validationId,
              observedOn: body.observedOn ?? null,
              topic: body.topic,
              observation: body.observation ?? null,
              sourceType: body.sourceType ?? null,
              sourceUrl: body.sourceUrl ?? null,
              supportsChecks: body.supportsChecks ?? [],
              supportsNote: body.supportsNote ?? null,
              createdById: caller.id,
              updatedById: caller.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning();
          if (row === undefined) throw new Error("research log insert failed");
          await withHistory(
            tx,
            validationOperation(request, scope, validationId, caller.id, at),
            async () => ({
              target: { type: "research_log_entry", id: row.id },
              action: "create",
              before: null,
              after: researchLogContent(row),
            }),
          );
          return row.id;
        });
        const { view } = await entryView(db, scope.workspaceId, entryId);
        return status(201, view);
      },
      {
        scoped: { to: "validationId", need: "writeUnarchived" },
        body: researchLogInputSchema,
        parse: "json",
        response: { 201: researchLogEntrySchema, ...writeErrors },
        detail: {
          summary: "V6 Record a research log entry (14)",
          description:
            "observedOn left out is saved as no date: the form fills in today. Blank optional texts are saved as null.",
        },
      },
    )
    .get(
      "/api/v1/research-log/:entryId",
      async ({ scope, params, caller }) => {
        const { view, validationId } = await entryView(
          db,
          scope.workspaceId,
          params.entryId,
        );
        const { usages, hiddenCount } = await usageViews(
          db,
          scope,
          caller.id,
          validationId,
          params.entryId,
        );
        return { ...view, usages, hiddenUsageCount: hiddenCount };
      },
      {
        scoped: { to: entryLocator, need: "read" },
        response: { 200: researchLogDetailSchema, ...readErrors },
        detail: {
          summary: "V7 A research log entry and where it is evidence (14)",
          description:
            "usages lists the items shown that cite it, in the order the evidence was attached: what 14 shows and what deleting it would leave a Fact without evidence. hiddenUsageCount counts the answers a template migration hid that cite it, which the deletion's confirmation mentions by number. A deleted entry is 404.",
        },
      },
    )
    .patch(
      "/api/v1/research-log/:entryId",
      async ({ scope, params, body, caller, request }) => {
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, researchLogEntries, params.entryId);
          const values = {
            observedOn:
              body.observedOn === undefined ? row.observedOn : body.observedOn,
            topic: body.topic ?? row.topic,
            observation:
              body.observation === undefined
                ? row.observation
                : body.observation,
            sourceType:
              body.sourceType === undefined ? row.sourceType : body.sourceType,
            sourceUrl:
              body.sourceUrl === undefined ? row.sourceUrl : body.sourceUrl,
            supportsChecks: body.supportsChecks ?? row.supportsChecks,
            supportsNote:
              body.supportsNote === undefined
                ? row.supportsNote
                : body.supportsNote,
          };
          await updateListRow(tx, {
            table: researchLogEntries,
            row,
            target: { type: "research_log_entry", id: row.id },
            before: researchLogContent(row),
            after: researchLogContent(values),
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
          });
        });
        return (await entryView(db, scope.workspaceId, params.entryId)).view;
      },
      {
        scoped: { to: entryLocator, need: "writeUnarchived" },
        body: researchLogUpdateSchema,
        parse: "json",
        response: { 200: researchLogEntrySchema, ...writeErrors },
        detail: {
          summary: "V7 Edit a research log entry (14)",
          description:
            "Only the fields sent change, under the optimistic lock: 409 CONFLICT with the stored entry when lockVersion is stale, unless force.",
        },
      },
    )
    .delete(
      "/api/v1/research-log/:entryId",
      async ({ scope, params, caller, request }) => {
        const at = new Date(now());
        const affected = await writeInScope(db, scope, at, async (tx) => {
          const row = await lockListRow(tx, researchLogEntries, params.entryId);
          const cited = await usageViews(
            tx,
            scope,
            caller.id,
            row.validationId,
            row.id,
          );
          await deleteListRow(tx, {
            table: researchLogEntries,
            id: row.id,
            target: { type: "research_log_entry", id: row.id },
            before: researchLogContent(row),
            operation: validationOperation(
              request,
              scope,
              row.validationId,
              caller.id,
              at,
            ),
          });
          return cited;
        });
        return {
          affected: affected.usages,
          hiddenAffectedCount: affected.hiddenCount,
        };
      },
      {
        scoped: { to: entryLocator, need: "writeUnarchived" },
        response: {
          200: researchLogDeletionSchema,
          ...readErrors,
          409: errorBodySchema,
        },
        detail: {
          summary: "V7 Delete a research log entry (14)",
          description:
            "Deletes it logically. The evidence that cites it stays attached but no longer counts: a Fact it was the only evidence of becomes Fact · No evidence. affected and hiddenAffectedCount are what V7 GET's usages and hiddenUsageCount were.",
        },
      },
    );
}
