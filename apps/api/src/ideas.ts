import {
  assumptionContent,
  assumptions,
  competitorContent,
  competitors,
  costItemContent,
  costItems,
  type Database,
  type DatabaseTransaction,
  economicsInputContent,
  economicsInputs,
  evidenceLinks,
  ideaContent,
  ideas,
  researchLogContent,
  researchLogEntries,
  riskContent,
  risks,
  templateCostDefaults,
  validationAnswerContent,
  validationAnswers,
  validations,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  fitWithSuffix,
  IDEA_NAME_MAX,
  type IdeaDecisionFilter,
  type IdeaSort,
  ideaCreateSchema,
  ideaDetailSchema,
  ideaDuplicateResultSchema,
  ideaDuplicateSchema,
  ideaListQuerySchema,
  ideaPageSchema,
  ideaUpdateSchema,
} from "@moonx/schemas";
import { and, asc, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  type HistoryChange,
  type HistoryOperation,
  withHistory,
} from "./history";
import {
  type IdeaRow,
  ideaSummaries,
  latestTemplateVersion,
  loadIdeaContexts,
  loadIdeaDetail,
  loadStages,
} from "./idea-views";
import { checkLockVersion } from "./lock";
import { recordChange, type Scope, writeInScope } from "./scope";

/** The suffix of a copy's default name (design-spec 6.8). */
const COPY_SUFFIX = " (copy)";

const decisionMatches = (filter: IdeaDecisionFilter, row: IdeaRow) => {
  switch (filter) {
    case "all":
      return true;
    case "not_dropped":
      return row.latestDecision !== "drop";
    case "undecided":
      return row.latestDecision === null;
    default:
      return row.latestDecision === filter;
  }
};

const byId = (a: IdeaRow, b: IdeaRow) => a.id.localeCompare(b.id);

/** The orders of 6 (design-spec 6.8): newest activity, newest made, or by name. */
const ORDERS: Record<IdeaSort, (a: IdeaRow, b: IdeaRow) => number> = {
  updated: (a, b) =>
    b.lastActivityAt.getTime() - a.lastActivityAt.getTime() || byId(a, b),
  created: (a, b) =>
    b.createdAt.getTime() - a.createdAt.getTime() || byId(a, b),
  name: (a, b) =>
    a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || byId(a, b),
};

const contains = (text: string, needle: string) =>
  text.toLocaleLowerCase("en").includes(needle.toLocaleLowerCase("en"));

/**
 * Locks `workspaceId` against its deletion for the rest of the transaction, so a row
 * made in it never meets a deleted workspace (U7 deletes personal ones).
 *
 * @throws {ApiError} NOT_FOUND when the workspace is gone
 */
async function holdWorkspace(tx: DatabaseTransaction, workspaceId: string) {
  const [row] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .for("key share");
  if (row === undefined) throw new ApiError("NOT_FOUND", "No such workspace");
}

const createdRow = (target: HistoryChange["target"], after: unknown) =>
  ({ target, action: "create", before: null, after }) satisfies HistoryChange;

/**
 * Copies the idea `sourceId` and its validation's content into a new idea proposed by
 * `callerId` (design-spec 6.8): answers, F/A/U, research logs, competitors,
 * assumptions, risks, cost rows, numbers and evidence links, with the evidence moved
 * onto the copied logs and rows. Deleted rows, decisions, plans, comments and history
 * stay behind. Writes one `duplicate` history row per copied item under one batch, so
 * H3 can undo the whole copy.
 *
 * The source is locked for the copy, so no write inside it can make the copy mix two
 * states, and undoing its creation (which does not wait) answers 409 BUSY meanwhile.
 *
 * @throws {ApiError} NOT_FOUND when the source's creation was undone meanwhile
 */
async function duplicateIdea(
  tx: DatabaseTransaction,
  options: {
    sourceId: string;
    name: string | undefined;
    callerId: string;
    operation: Omit<HistoryOperation, "container">;
  },
): Promise<string> {
  const { callerId, operation } = options;
  const { at } = operation;
  const [source] = await tx
    .select()
    .from(ideas)
    .where(eq(ideas.id, options.sourceId))
    .for("no key update");
  if (source === undefined || source.deletedAt !== null) {
    throw new ApiError("NOT_FOUND", "The idea no longer exists");
  }
  const [sourceValidation] = await tx
    .select()
    .from(validations)
    .where(eq(validations.ideaId, source.id));
  if (sourceValidation === undefined)
    throw new Error(`Idea ${source.id} has no validation`);
  const fromId = sourceValidation.id;

  const ideaId = crypto.randomUUID();
  const idea = {
    name:
      options.name ?? fitWithSuffix(source.name, COPY_SUFFIX, IDEA_NAME_MAX),
    oneLineConcept: source.oneLineConcept,
    proposedSolution: source.proposedSolution,
  };
  await tx.insert(ideas).values({
    id: ideaId,
    workspaceId: source.workspaceId,
    ...idea,
    proposerId: callerId,
    duplicatedFromId: source.id,
    updatedById: callerId,
    lastActivityAt: at,
    createdAt: at,
    updatedAt: at,
  });
  const validationId = crypto.randomUUID();
  await tx.insert(validations).values({
    id: validationId,
    ideaId,
    templateVersionId: sourceValidation.templateVersionId,
    createdAt: at,
    updatedAt: at,
  });

  const live = <T extends { deletedAt: Date | null }>(rows: T[]) =>
    rows.filter((row) => row.deletedAt === null);
  const fresh = { updatedById: callerId, createdAt: at, updatedAt: at };
  // Lists that break ties by when a row was made (research logs by date, risks in the
  // automatic order, evidence on an item) keep the source's order: each copy is made a
  // millisecond after the one before it.
  const nth = (index: number) => {
    const made = new Date(at.getTime() + index);
    return { createdAt: made, updatedAt: made };
  };
  const newIds = new Map<string, string>();
  const renew = (id: string) => {
    const copy = crypto.randomUUID();
    newIds.set(id, copy);
    return copy;
  };

  const logs = live(
    await tx
      .select()
      .from(researchLogEntries)
      .where(eq(researchLogEntries.validationId, fromId))
      .orderBy(asc(researchLogEntries.createdAt), asc(researchLogEntries.id)),
  ).map(({ id, deletedAt, lockVersion, ...log }, index) => ({
    ...log,
    ...fresh,
    ...nth(index),
    id: renew(id),
    validationId,
    createdById: callerId,
  }));
  const competitorRows = live(
    await tx
      .select()
      .from(competitors)
      .where(eq(competitors.validationId, fromId))
      .orderBy(asc(competitors.sortOrder), asc(competitors.id)),
  ).map(({ id, deletedAt, lockVersion, ...row }) => ({
    ...row,
    ...fresh,
    id: renew(id),
    validationId,
  }));
  const assumptionRows = live(
    await tx
      .select()
      .from(assumptions)
      .where(eq(assumptions.validationId, fromId))
      .orderBy(asc(assumptions.sortOrder), asc(assumptions.id)),
  ).map(({ id, deletedAt, lockVersion, ...row }) => ({
    ...row,
    ...fresh,
    id: renew(id),
    validationId,
  }));
  const riskRows = live(
    await tx
      .select()
      .from(risks)
      .where(eq(risks.validationId, fromId))
      .orderBy(asc(risks.createdAt), asc(risks.id)),
  ).map(({ id, deletedAt, lockVersion, ...row }, index) => ({
    ...row,
    ...fresh,
    ...nth(index),
    id: renew(id),
    validationId,
  }));
  const costRows = live(
    await tx
      .select()
      .from(costItems)
      .where(eq(costItems.validationId, fromId))
      .orderBy(
        asc(costItems.category),
        asc(costItems.sortOrder),
        asc(costItems.id),
      ),
  ).map(({ id, deletedAt, lockVersion, ...row }) => ({
    ...row,
    ...fresh,
    id: renew(id),
    validationId,
  }));
  // A keyed item's first save makes it version 1 (SDD 5.1「同時編集」).
  const answerRows = (
    await tx
      .select()
      .from(validationAnswers)
      .where(eq(validationAnswers.validationId, fromId))
      .orderBy(asc(validationAnswers.questionKey))
  ).map(({ id, ...row }) => ({
    ...row,
    ...fresh,
    id: crypto.randomUUID(),
    validationId,
    lockVersion: 1,
  }));
  const inputRows = (
    await tx
      .select()
      .from(economicsInputs)
      .where(eq(economicsInputs.validationId, fromId))
      .orderBy(asc(economicsInputs.fieldKey))
  ).map(({ id, ...row }) => ({
    ...row,
    ...fresh,
    id: crypto.randomUUID(),
    validationId,
    lockVersion: 1,
  }));

  // Evidence follows its item and log into the copy; evidence on a deleted row or
  // citing a deleted log has nothing to follow.
  const linkRows = (
    await tx
      .select()
      .from(evidenceLinks)
      .where(
        and(
          eq(evidenceLinks.validationId, fromId),
          isNull(evidenceLinks.deletedAt),
        ),
      )
      .orderBy(asc(evidenceLinks.createdAt), asc(evidenceLinks.id))
  ).flatMap(({ id, ...link }, index) => {
    const keyed =
      link.targetType === "validation_answer" ||
      link.targetType === "economics_input";
    const targetId = keyed ? validationId : newIds.get(link.targetId);
    const logId =
      link.researchLogEntryId === null
        ? null
        : newIds.get(link.researchLogEntryId);
    if (targetId === undefined || logId === undefined) return [];
    return [
      {
        ...link,
        id: crypto.randomUUID(),
        workspaceId: source.workspaceId,
        validationId,
        targetId,
        researchLogEntryId: logId,
        createdById: callerId,
        // After the copied logs, which the links cite.
        ...nth(logs.length + index),
      },
    ];
  });
  const evidenceIds = (type: string, id: string, key: string | null = null) =>
    linkRows
      .filter(
        (link) =>
          link.targetType === type &&
          link.targetId === id &&
          link.targetKey === key,
      )
      .map((link) => link.id);

  if (logs.length > 0) await tx.insert(researchLogEntries).values(logs);
  if (competitorRows.length > 0)
    await tx.insert(competitors).values(competitorRows);
  if (assumptionRows.length > 0)
    await tx.insert(assumptions).values(assumptionRows);
  if (riskRows.length > 0) await tx.insert(risks).values(riskRows);
  if (costRows.length > 0) await tx.insert(costItems).values(costRows);
  if (answerRows.length > 0)
    await tx.insert(validationAnswers).values(answerRows);
  if (inputRows.length > 0) await tx.insert(economicsInputs).values(inputRows);
  if (linkRows.length > 0) await tx.insert(evidenceLinks).values(linkRows);

  await withHistory(
    tx,
    {
      ...operation,
      container: {
        type: "idea",
        id: ideaId,
        workspaceId: source.workspaceId,
      },
    },
    async () => createdRow({ type: "idea", id: ideaId }, ideaContent(idea)),
  );
  await withHistory(
    tx,
    {
      ...operation,
      container: {
        type: "validation",
        id: validationId,
        workspaceId: source.workspaceId,
      },
    },
    async () => [
      ...answerRows.map((row) =>
        createdRow(
          { type: "validation_answer", id: validationId, key: row.questionKey },
          validationAnswerContent(
            row,
            evidenceIds("validation_answer", validationId, row.questionKey),
          ),
        ),
      ),
      ...inputRows.map((row) =>
        createdRow(
          { type: "economics_input", id: validationId, key: row.fieldKey },
          economicsInputContent(
            row,
            evidenceIds("economics_input", validationId, row.fieldKey),
          ),
        ),
      ),
      ...logs.map((row) =>
        createdRow(
          { type: "research_log_entry", id: row.id },
          researchLogContent(row),
        ),
      ),
      ...competitorRows.map((row) =>
        createdRow(
          { type: "competitor", id: row.id },
          competitorContent(row, evidenceIds("competitor", row.id)),
        ),
      ),
      ...assumptionRows.map((row) =>
        createdRow(
          { type: "assumption", id: row.id },
          assumptionContent(row, evidenceIds("assumption", row.id)),
        ),
      ),
      ...riskRows.map((row) =>
        createdRow({ type: "risk", id: row.id }, riskContent(row)),
      ),
      ...costRows.map((row) =>
        createdRow(
          { type: "cost_item", id: row.id },
          costItemContent(row, evidenceIds("cost_item", row.id)),
        ),
      ),
    ],
  );
  await tx
    .update(workspaces)
    .set({ lastActiveAt: at })
    .where(eq(workspaces.id, source.workspaceId));
  return ideaId;
}

/** Archives or restores the idea of `scope` (I4): a no-op when it already is so. */
async function setArchived(
  db: Database,
  scope: Scope,
  archived: boolean,
  at: Date,
) {
  await writeInScope(db, scope, at, async (tx) => {
    const ideaId = scope.ideaId as string;
    const [row] = await tx
      .select({ archivedAt: ideas.archivedAt })
      .from(ideas)
      .where(eq(ideas.id, ideaId));
    if (row === undefined || (row.archivedAt !== null) === archived) return;
    await tx
      .update(ideas)
      .set({ archivedAt: archived ? at : null })
      .where(eq(ideas.id, ideaId));
    recordChange(tx);
  });
}

/** What the idea routes need from the app. */
export interface IdeaRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const ideaErrors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
} as const;

/** I1–I4 (SDD 5.6): ideas, their overview, copies and archiving. */
export function ideaRoutes({ access, db, now }: IdeaRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/workspaces/:workspaceId/ideas",
      async ({ scope, query }) => {
        const rows = await db
          .select()
          .from(ideas)
          .where(
            and(
              eq(ideas.workspaceId, scope.workspaceId),
              isNull(ideas.deletedAt),
            ),
          );
        const needle = query.q ?? "";
        const candidates = rows.filter(
          (row) =>
            (query.includeArchived || row.archivedAt === null) &&
            (query.proposerId === undefined ||
              row.proposerId === query.proposerId) &&
            (needle === "" ||
              contains(row.name, needle) ||
              contains(row.oneLineConcept, needle)),
        );
        const stages =
          query.stage === undefined
            ? undefined
            : await loadStages(
                db,
                candidates.map((row) => row.id),
              );
        const staged =
          stages === undefined
            ? candidates
            : candidates.filter((row) => stages.get(row.id) === query.stage);
        const matching = staged
          .filter((row) => decisionMatches(query.decision, row))
          .sort(ORDERS[query.sort]);
        const offset = query.cursor ?? 0;
        const end = offset + query.limit;
        const page = matching.slice(offset, end);
        const contexts = await loadIdeaContexts(db, page, scope.role);
        return {
          items: await ideaSummaries(db, scope.workspaceId, contexts),
          nextCursor: end < matching.length ? String(end) : null,
          hiddenDroppedCount:
            query.decision === "not_dropped"
              ? staged.filter((row) => row.latestDecision === "drop").length
              : 0,
        };
      },
      {
        scoped: { to: "workspaceId", need: "read" },
        query: ideaListQuerySchema,
        response: { 200: ideaPageSchema, ...ideaErrors, 422: errorBodySchema },
        detail: {
          summary: "I1 The ideas of a workspace",
          description:
            "Drop ideas are hidden by default (decision=not_dropped) and counted in hiddenDroppedCount. q matches the name or the one-line concept, ignoring case.",
        },
      },
    )
    .post(
      "/api/v1/workspaces/:workspaceId/ideas",
      async ({ scope, caller, body, request, status }) => {
        const at = new Date(now());
        const ideaId = await writeInScope(db, scope, at, async (tx) => {
          await holdWorkspace(tx, scope.workspaceId);
          const version = await latestTemplateVersion(tx, "validation");
          if (version === undefined) {
            throw new ApiError(
              "TEMPLATE_NOT_PUBLISHED",
              "No validation template is published yet",
            );
          }
          const idea = {
            name: body.name,
            oneLineConcept: body.oneLineConcept,
            proposedSolution: body.proposedSolution ?? null,
          };
          const [created] = await tx
            .insert(ideas)
            .values({
              workspaceId: scope.workspaceId,
              ...idea,
              proposerId: caller.id,
              updatedById: caller.id,
              lastActivityAt: at,
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: ideas.id });
          if (created === undefined) throw new Error("idea insert failed");
          const [validation] = await tx
            .insert(validations)
            .values({
              ideaId: created.id,
              templateVersionId: version.id,
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: validations.id });
          if (validation === undefined)
            throw new Error("validation insert failed");
          const defaults = await tx
            .select()
            .from(templateCostDefaults)
            .where(eq(templateCostDefaults.templateVersionId, version.id))
            .orderBy(
              asc(templateCostDefaults.sortOrder),
              asc(templateCostDefaults.id),
            );
          const rows =
            defaults.length === 0
              ? []
              : await tx
                  .insert(costItems)
                  .values(
                    defaults.map((row) => ({
                      validationId: validation.id,
                      category: row.category,
                      templateKey: row.key,
                      name: row.name,
                      sortOrder: defaults
                        .filter((other) => other.category === row.category)
                        .indexOf(row),
                      updatedById: caller.id,
                      createdAt: at,
                      updatedAt: at,
                    })),
                  )
                  .returning();
          const operation = {
            changedById: caller.id,
            source: "manual",
            batchId: null,
            client: requestContext(request).client,
            at,
          } as const;
          await withHistory(
            tx,
            {
              ...operation,
              container: {
                type: "idea",
                id: created.id,
                workspaceId: scope.workspaceId,
              },
            },
            async () =>
              createdRow({ type: "idea", id: created.id }, ideaContent(idea)),
          );
          await withHistory(
            tx,
            {
              ...operation,
              container: {
                type: "validation",
                id: validation.id,
                workspaceId: scope.workspaceId,
              },
            },
            async () =>
              rows.map((row) =>
                createdRow(
                  { type: "cost_item", id: row.id },
                  costItemContent(row, []),
                ),
              ),
          );
          return created.id;
        });
        return status(201, await loadIdeaDetail(db, ideaId, scope.role));
      },
      {
        scoped: { to: "workspaceId", need: "write" },
        body: ideaCreateSchema,
        parse: "json",
        response: {
          201: ideaDetailSchema,
          ...ideaErrors,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "I1 Create an idea (M1)",
          description:
            "Makes its validation on the latest published validation template, with the template's cost rows Empty. 409 TEMPLATE_NOT_PUBLISHED before an operator has published one.",
        },
      },
    )
    .get(
      "/api/v1/ideas/:ideaId",
      ({ scope }) => loadIdeaDetail(db, scope.ideaId as string, scope.role),
      {
        scoped: { to: "ideaId", need: "read" },
        response: { 200: ideaDetailSchema, ...ideaErrors },
        detail: { summary: "I2 An idea" },
      },
    )
    .patch(
      "/api/v1/ideas/:ideaId",
      async ({ scope, caller, body, request }) => {
        const ideaId = scope.ideaId as string;
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const [current] = await tx
            .select()
            .from(ideas)
            .where(eq(ideas.id, ideaId));
          if (current === undefined) throw new Error(`No idea ${ideaId}`);
          const before = ideaContent(current);
          const after = ideaContent({
            name: body.name ?? current.name,
            oneLineConcept: body.oneLineConcept ?? current.oneLineConcept,
            proposedSolution:
              body.proposedSolution === undefined
                ? current.proposedSolution
                : body.proposedSolution,
          });
          if (
            before.name === after.name &&
            before.oneLineConcept === after.oneLineConcept &&
            before.proposedSolution === after.proposedSolution
          ) {
            return;
          }
          await checkLockVersion(
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
          await tx
            .update(ideas)
            .set({
              ...after,
              lockVersion: current.lockVersion + 1,
              updatedAt: at,
              updatedById: caller.id,
            })
            .where(eq(ideas.id, ideaId));
          await withHistory(
            tx,
            {
              container: {
                type: "idea",
                id: ideaId,
                workspaceId: scope.workspaceId,
              },
              changedById: caller.id,
              source: "manual",
              batchId: null,
              client: requestContext(request).client,
              at,
            },
            async () => ({
              target: { type: "idea", id: ideaId },
              action: "update",
              before,
              after,
            }),
          );
        });
        return loadIdeaDetail(db, ideaId, scope.role);
      },
      {
        scoped: { to: "ideaId", need: "writeUnarchived" },
        body: ideaUpdateSchema,
        parse: "json",
        response: {
          200: ideaDetailSchema,
          ...ideaErrors,
          409: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "I2 Edit an idea's overview",
          description:
            "Name, one-line concept and proposed solution, under the optimistic lock: 409 CONFLICT with the stored overview when lockVersion is stale, unless force.",
        },
      },
    )
    .post(
      "/api/v1/ideas/:ideaId/duplicate",
      async ({ scope, caller, body, request, status }) => {
        const at = new Date(now());
        const batchId = crypto.randomUUID();
        const ideaId = await db.transaction((tx) =>
          duplicateIdea(tx, {
            sourceId: scope.ideaId as string,
            name: body.name,
            callerId: caller.id,
            operation: {
              changedById: caller.id,
              source: "duplicate",
              batchId,
              client: requestContext(request).client,
              at,
            },
          }),
        );
        return status(201, {
          ...(await loadIdeaDetail(db, ideaId, scope.role)),
          batchId,
        });
      },
      {
        scoped: { to: "ideaId", need: "write" },
        body: ideaDuplicateSchema,
        parse: "json",
        response: {
          201: ideaDuplicateResultSchema,
          ...ideaErrors,
          422: errorBodySchema,
        },
        detail: {
          summary: "I3 Duplicate an idea",
          description:
            "Copies the validation's content into a new, undecided idea proposed by the caller, archived or Drop ideas included. batchId undoes the copy through H3.",
        },
      },
    )
    .post(
      "/api/v1/ideas/:ideaId/archive",
      async ({ scope }) => {
        await setArchived(db, scope, true, new Date(now()));
        return loadIdeaDetail(db, scope.ideaId as string, scope.role);
      },
      {
        scoped: { to: "ideaId", need: "write" },
        response: { 200: ideaDetailSchema, ...ideaErrors },
        detail: {
          summary: "I4 Archive an idea",
          description:
            "Hides it from lists and the dashboard and makes it read-only. Writes no history and keeps updatedAt.",
        },
      },
    )
    .post(
      "/api/v1/ideas/:ideaId/restore",
      async ({ scope }) => {
        await setArchived(db, scope, false, new Date(now()));
        return loadIdeaDetail(db, scope.ideaId as string, scope.role);
      },
      {
        scoped: { to: "ideaId", need: "write" },
        response: { 200: ideaDetailSchema, ...ideaErrors },
        detail: { summary: "I4 Restore an archived idea" },
      },
    );
}
