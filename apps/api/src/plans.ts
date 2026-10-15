import {
  businessPlanContent,
  businessPlans,
  competitors,
  type Database,
  type DatabaseTransaction,
  decisionLogEntries,
  executionItemContent,
  executionItems,
  planAnswerContent,
  planAnswers,
  planVersions,
  snapshotView,
  templateExecutionPresets,
  users,
} from "@moonx/db";
import {
  buildDecisionSnapshot,
  type DraftSource,
  draftAnswer,
  evaluateValidation,
  GO_NO_GO_CONDITION_KEYS,
  hasText,
} from "@moonx/domain";
import {
  decisionSnapshotSchema,
  EXECUTION_STATUSES,
  errorBodySchema,
  goNoGoContextSchema,
  goNoGoCreateSchema,
  goNoGoResultSchema,
  type PlanVersionSnapshot,
  planCreateSchema,
  planHomeSchema,
  planListQuerySchema,
  planListSchema,
  planSummarySchema,
  planUpdateSchema,
  planVersionCreateSchema,
  planVersionListSchema,
  planVersionQuerySchema,
  planVersionSummarySchema,
} from "@moonx/schemas";
import { and, asc, desc, eq, isNull, ne } from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { dueWindow } from "./due";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { type HistoryChange, withHistory } from "./history";
import {
  decisionSummaries,
  findIdea,
  type IdeaContext,
  latestTemplateVersion,
  loadIdeaContexts,
  loadPlans,
  loadStages,
  newestDecisionFirst,
  planSummaries,
} from "./idea-views";
import { checkLockVersion } from "./lock";
import { notifyDecision } from "./notifications";
import { loadAssumptionsAndRisks } from "./plan-references";
import {
  lastContentChange,
  loadPlanAnswers,
  loadPlanHome,
  loadPlanTemplate,
  type PlanRow,
  planContentTime,
  planSummary,
  requirePlan,
  sortExecution,
  versionSummaries,
} from "./plan-views";
import { recordChange, type Scope, writeInScope } from "./scope";
import { quotedAnswer } from "./validation";

type Executor = Database | DatabaseTransaction;

/** The competitors a version keeps for the Pitch Deck (SDD 6.3 末尾). */
const SNAPSHOT_COMPETITORS = 5;

/**
 * Refuses a plan name another plan of the idea has (design-spec 6.0.8): archived plans
 * count, plans whose creation was undone do not. Run it under the idea's lock, which
 * every plan write of the idea takes first.
 *
 * @throws {ApiError} NAME_TAKEN
 */
async function checkNameFree(
  tx: DatabaseTransaction,
  ideaId: string,
  name: string,
  exceptPlanId: string | null,
): Promise<void> {
  const [taken] = await tx
    .select({ id: businessPlans.id })
    .from(businessPlans)
    .where(
      and(
        eq(businessPlans.ideaId, ideaId),
        eq(businessPlans.name, name),
        isNull(businessPlans.deletedAt),
        exceptPlanId === null ? undefined : ne(businessPlans.id, exceptPlanId),
      ),
    );
  if (taken !== undefined) {
    throw new ApiError("NAME_TAKEN", "Another plan of the idea has this name");
  }
}

/** The idea of `scope` with its validation evaluated, which the scope says exists. */
async function ideaContext(db: Executor, scope: Scope): Promise<IdeaContext> {
  const idea = await findIdea(db, scope.ideaId as string);
  if (idea === undefined) throw new ApiError("NOT_FOUND", "No such idea");
  const [context] = await loadIdeaContexts(db, [idea], scope.role);
  if (context === undefined) throw new Error(`No context for ${idea.id}`);
  return context;
}

/**
 * M5: makes a plan of the idea of `scope` on the latest published plan template, named
 * `name`, with the validation's answers copied into the sub-items the template says
 * (`copy_from`) and the template's starting execution rows (design-spec 6.12, 6.13).
 * Everything it makes is one `plan_draft` operation, which H3 can undo whole.
 *
 * @throws {ApiError} DECISION_NOT_PROCEED, TEMPLATE_NOT_PUBLISHED or NAME_TAKEN
 */
async function draftPlan(
  tx: DatabaseTransaction,
  options: {
    scope: Scope;
    name: string;
    callerId: string;
    request: Request;
    at: Date;
  },
): Promise<string> {
  const { scope, name, callerId, at } = options;
  const context = await ideaContext(tx, scope);
  const idea = context.row;
  if (idea.latestDecision !== "proceed") {
    throw new ApiError(
      "DECISION_NOT_PROCEED",
      "A plan is drafted only after a Proceed decision",
    );
  }
  const version = await latestTemplateVersion(tx, "business_plan");
  if (version === undefined) {
    throw new ApiError(
      "TEMPLATE_NOT_PUBLISHED",
      "No plan template is published yet",
    );
  }
  await checkNameFree(tx, idea.id, name, null);
  const [decision] = await tx
    .select({ id: decisionLogEntries.id })
    .from(decisionLogEntries)
    .where(
      and(
        eq(decisionLogEntries.ideaId, idea.id),
        eq(decisionLogEntries.kind, "validation_decision"),
      ),
    )
    .orderBy(...newestDecisionFirst)
    .limit(1);
  if (decision === undefined) {
    throw new Error(`Idea ${idea.id} is Proceed without a decision`);
  }
  const [caller] = await tx
    .select({ displayName: users.displayName })
    .from(users)
    .where(eq(users.id, callerId));
  if (caller === undefined) throw new Error(`No user ${callerId}`);

  const planId = crypto.randomUUID();
  const header = {
    name,
    businessName: idea.name,
    preparedBy: caller.displayName,
  };
  await tx.insert(businessPlans).values({
    id: planId,
    ideaId: idea.id,
    ...header,
    templateVersionId: version.id,
    createdFromDecisionId: decision.id,
    createdById: callerId,
    updatedById: callerId,
    lastActivityAt: at,
    createdAt: at,
    updatedAt: at,
  });

  const { state } = context.loaded;
  const lists = await loadAssumptionsAndRisks(tx, context.loaded.validationId);
  const source: DraftSource = {
    oneLineConcept: idea.oneLineConcept,
    proposedSolution: idea.proposedSolution,
    answerText: (key) => quotedAnswer(state, key),
    assumptions: lists.assumptions,
    risks: lists.risks,
  };
  const sections = await loadPlanTemplate(tx, version.id);
  const copiedAt = at.toISOString();
  // A keyed item's first save makes it version 1 (SDD 5.1「同時編集」).
  const answerRows = sections
    .flatMap((section) => section.questions)
    .flatMap((question) => {
      const copyFrom = question.copyFrom ?? [];
      const copied =
        copyFrom.length === 0 ? null : draftAnswer(copyFrom, source);
      return copied === null
        ? []
        : [
            {
              businessPlanId: planId,
              questionKey: question.key,
              ...copied,
              copiedFrom: { source: copyFrom.join(", "), copiedAt },
              lockVersion: 1,
              updatedById: callerId,
              createdAt: at,
              updatedAt: at,
            },
          ];
    });
  if (answerRows.length > 0) await tx.insert(planAnswers).values(answerRows);

  const presets = await tx
    .select()
    .from(templateExecutionPresets)
    .where(eq(templateExecutionPresets.templateVersionId, version.id))
    .orderBy(
      asc(templateExecutionPresets.sortOrder),
      asc(templateExecutionPresets.id),
    );
  const itemRows = presets.map((preset) => ({
    id: crypto.randomUUID(),
    businessPlanId: planId,
    type: preset.type,
    title: preset.title,
    status: EXECUTION_STATUSES[preset.type][0] ?? null,
    kpiArea: preset.area,
    launchTiming: preset.launchTiming,
    fromPreset: true,
    sortOrder: presets
      .filter((other) => other.type === preset.type)
      .indexOf(preset),
    updatedById: callerId,
    createdAt: at,
    updatedAt: at,
  }));
  if (itemRows.length > 0) await tx.insert(executionItems).values(itemRows);

  const created = (target: HistoryChange["target"], after: unknown) =>
    ({ target, action: "create", before: null, after }) satisfies HistoryChange;
  await withHistory(
    tx,
    {
      container: {
        type: "business_plan",
        id: planId,
        workspaceId: scope.workspaceId,
      },
      changedById: callerId,
      source: "plan_draft",
      batchId: crypto.randomUUID(),
      client: requestContext(options.request).client,
      at,
    },
    async () => [
      created({ type: "business_plan", id: planId }, header),
      ...answerRows.map((row) =>
        created(
          { type: "plan_answer", id: planId, key: row.questionKey },
          planAnswerContent(row),
        ),
      ),
      ...itemRows.map((row) =>
        created(
          { type: "execution_item", id: row.id },
          executionItemContent(row),
        ),
      ),
    ],
  );
  return planId;
}

/** Archives or restores the plan of `scope` (P3): a no-op when it already is so. */
async function setArchived(
  db: Database,
  scope: Scope,
  archived: boolean,
  at: Date,
) {
  const planId = scope.planId as string;
  await writeInScope(db, scope, at, async (tx) => {
    const [row] = await tx
      .select({ archivedAt: businessPlans.archivedAt })
      .from(businessPlans)
      .where(eq(businessPlans.id, planId));
    if (row === undefined || (row.archivedAt !== null) === archived) return;
    await tx
      .update(businessPlans)
      .set({ archivedAt: archived ? at : null })
      .where(eq(businessPlans.id, planId));
    recordChange(tx);
  });
  return planSummary(db, scope.workspaceId, await requirePlan(db, planId));
}

/** The §24 conditions of the plan as its answers have them now. */
async function goNoGoConditions(db: Executor, planId: string) {
  const answers = await loadPlanAnswers(db, planId);
  const text = (key: string) => {
    const value = answers.get(key)?.text ?? null;
    return hasText(value) ? value : null;
  };
  return {
    launchIf: text(GO_NO_GO_CONDITION_KEYS.launchIf),
    delayIf: text(GO_NO_GO_CONDITION_KEYS.delayIf),
    stopIf: text(GO_NO_GO_CONDITION_KEYS.stopIf),
  };
}

/** The latest saved version of `planId`, or undefined. */
async function latestVersion(db: Executor, planId: string) {
  const [row] = await db
    .select()
    .from(planVersions)
    .where(eq(planVersions.businessPlanId, planId))
    .orderBy(desc(planVersions.versionNumber))
    .limit(1);
  return row;
}

/**
 * What a version keeps of the plan as it is now (SDD 6.3 末尾): the header, the answers,
 * the validation's key metrics and scenarios, the execution items and the top
 * competitors.
 */
async function buildSnapshot(
  tx: DatabaseTransaction,
  plan: PlanRow,
  context: IdeaContext,
): Promise<{
  snapshot: PlanVersionSnapshot;
  evaluation: ReturnType<typeof evaluateValidation>;
}> {
  const evaluation = evaluateValidation(
    context.loaded.state,
    snapshotView(context.loaded),
  );
  const answers = [...(await loadPlanAnswers(tx, plan.id)).values()].sort(
    (a, b) =>
      a.questionKey.localeCompare(b.questionKey, "en", { numeric: true }),
  );
  const items = await tx
    .select()
    .from(executionItems)
    .where(
      and(
        eq(executionItems.businessPlanId, plan.id),
        isNull(executionItems.deletedAt),
      ),
    );
  const top = await tx
    .select()
    .from(competitors)
    .where(
      and(
        eq(competitors.validationId, context.loaded.validationId),
        isNull(competitors.deletedAt),
      ),
    )
    .orderBy(
      asc(competitors.sortOrder),
      asc(competitors.createdAt),
      asc(competitors.id),
    )
    .limit(SNAPSHOT_COMPETITORS);
  return {
    evaluation,
    snapshot: {
      header: businessPlanContent(plan),
      answers: answers.map((row) => ({
        questionKey: row.questionKey,
        ...planAnswerContent(row),
      })),
      keyMetrics: evaluation.keyMetrics,
      scenarios: evaluation.economics.scenarios,
      execution: sortExecution(items).map((row) => ({
        ...executionItemContent(row),
        id: row.id,
        fromPreset: row.fromPreset,
        completedAt: row.completedAt?.toISOString() ?? null,
        kpiActualUpdatedAt: row.kpiActualUpdatedAt?.toISOString() ?? null,
        sortOrder: row.sortOrder,
      })),
      competitors: top.map((row) => ({
        name: row.name,
        type: row.type,
        typicalPrice: row.typicalPrice,
        strength: row.strength,
        weakness: row.weakness,
      })),
    },
  };
}

/** What the plan routes need from the app. */
export interface PlanRoutesOptions {
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

/**
 * P1–P3 and P6–P8 (SDD 5.9): the plans of an idea, the plan home and header,
 * archiving, versions and Go / No-Go.
 */
export function planRoutes({ access, db, now }: PlanRoutesOptions) {
  const home = async (
    scope: Scope,
    callerId: string,
    versionId: string | undefined = undefined,
  ) =>
    loadPlanHome(db, {
      scope,
      planId: scope.planId as string,
      versionId,
      due: await dueWindow(db, callerId, new Date(now())),
    });

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/ideas/:ideaId/plans",
      async ({ scope, query }) => {
        const ideaId = scope.ideaId as string;
        const plans = (await loadPlans(db, [ideaId])).get(ideaId) ?? [];
        return {
          items: await planSummaries(
            db,
            scope.workspaceId,
            plans.filter((plan) => query.includeArchived || !plan.archived),
          ),
        };
      },
      {
        scoped: { to: "ideaId", need: "read" },
        query: planListQuerySchema,
        response: { 200: planListSchema, ...readErrors, 422: errorBodySchema },
        detail: {
          summary: "P1 The plans of an idea",
          description:
            "In the order they were made. Archived plans only with includeArchived=true.",
        },
      },
    )
    .post(
      "/api/v1/ideas/:ideaId/plans",
      async ({ scope, caller, body, request, status }) => {
        const at = new Date(now());
        const planId = await writeInScope(db, scope, at, (tx) =>
          draftPlan(tx, {
            scope,
            name: body.name,
            callerId: caller.id,
            request,
            at,
          }),
        );
        return status(
          201,
          await home({ ...scope, planId, planArchived: false }, caller.id),
        );
      },
      {
        scoped: { to: "ideaId", need: "writeUnarchived" },
        body: planCreateSchema,
        parse: "json",
        response: { 201: planHomeSchema, ...writeErrors },
        detail: {
          summary: "P1 Draft a plan (M5)",
          description:
            "On the latest published plan template: the validation's answers copied where the template says, and its starting execution rows, as one plan_draft operation H3 can undo. 409 DECISION_NOT_PROCEED unless the latest decision is Proceed, TEMPLATE_NOT_PUBLISHED, NAME_TAKEN (archived plans count).",
        },
      },
    )
    .get(
      "/api/v1/plans/:planId",
      ({ scope, caller, query }) => home(scope, caller.id, query.versionId),
      {
        scoped: { to: "planId", need: "read" },
        query: planVersionQuerySchema,
        response: { 200: planHomeSchema, ...readErrors, 422: errorBodySchema },
        detail: {
          summary: "P2 The plan home (20)",
          description:
            "With versionId, the items' progress, key metrics, Business Name and Prepared By come from that saved version; draftOnly and the execution counts stay the plan's now.",
        },
      },
    )
    .patch(
      "/api/v1/plans/:planId",
      async ({ scope, caller, body, request }) => {
        const planId = scope.planId as string;
        const at = new Date(now());
        await writeInScope(db, scope, at, async (tx) => {
          const when = await planContentTime(tx, planId, at);
          const current = await requirePlan(tx, planId);
          const before = businessPlanContent(current);
          const after = businessPlanContent({
            name: body.name ?? current.name,
            businessName:
              body.businessName === undefined
                ? current.businessName
                : (body.businessName ?? ""),
            preparedBy:
              body.preparedBy === undefined
                ? current.preparedBy
                : (body.preparedBy ?? ""),
          });
          if (
            before.name === after.name &&
            before.businessName === after.businessName &&
            before.preparedBy === after.preparedBy
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
          if (after.name !== before.name) {
            await checkNameFree(tx, current.ideaId, after.name, planId);
          }
          await tx
            .update(businessPlans)
            .set({
              ...after,
              lockVersion: current.lockVersion + 1,
              updatedAt: when,
              updatedById: caller.id,
            })
            .where(eq(businessPlans.id, planId));
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
              target: { type: "business_plan", id: planId },
              action: "update",
              before,
              after,
            }),
          );
        });
        return home(scope, caller.id);
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        body: planUpdateSchema,
        parse: "json",
        response: { 200: planHomeSchema, ...writeErrors },
        detail: {
          summary: "P2 Edit a plan's header",
          description:
            "The plan's name, Business Name and Prepared By, under the optimistic lock (409 CONFLICT unless force). 409 NAME_TAKEN when another plan of the idea has the name.",
        },
      },
    )
    .post(
      "/api/v1/plans/:planId/archive",
      ({ scope }) => setArchived(db, scope, true, new Date(now())),
      {
        scoped: { to: "planId", need: "writeIdeaUnarchived" },
        response: {
          200: planSummarySchema,
          ...readErrors,
          409: errorBodySchema,
        },
        detail: {
          summary: "P3 Archive a plan",
          description:
            "Read only afterwards, and out of the stage, Due soon and the plans 13 lists. Writes no history and keeps updatedAt.",
        },
      },
    )
    .post(
      "/api/v1/plans/:planId/restore",
      ({ scope }) => setArchived(db, scope, false, new Date(now())),
      {
        scoped: { to: "planId", need: "writeIdeaUnarchived" },
        response: {
          200: planSummarySchema,
          ...readErrors,
          409: errorBodySchema,
        },
        detail: { summary: "P3 Restore an archived plan" },
      },
    )
    .get(
      "/api/v1/plans/:planId/versions",
      async ({ scope }) => ({
        items: await versionSummaries(
          db,
          scope.workspaceId,
          scope.planId as string,
        ),
      }),
      {
        scoped: { to: "planId", need: "read" },
        response: { 200: planVersionListSchema, ...readErrors },
        detail: { summary: "P6 The saved versions of a plan, newest first" },
      },
    )
    .post(
      "/api/v1/plans/:planId/versions",
      async ({ scope, caller, body, status }) => {
        const planId = scope.planId as string;
        const at = new Date(now());
        const versionId = await writeInScope(db, scope, at, async (tx) => {
          const plan = await requirePlan(tx, planId);
          const context = await ideaContext(tx, scope);
          const { snapshot, evaluation } = await buildSnapshot(
            tx,
            plan,
            context,
          );
          const last = await latestVersion(tx, planId);
          // After every change the snapshot holds and the previous version, whatever
          // the clocks of the instances that made them (planContentTime).
          const savedAt = new Date(
            Math.max(
              at.getTime(),
              (await lastContentChange(tx, plan)).getTime() + 1,
              (last?.savedAt.getTime() ?? 0) + 1,
            ),
          );
          const [version] = await tx
            .insert(planVersions)
            .values({
              businessPlanId: planId,
              versionNumber: (last?.versionNumber ?? 0) + 1,
              name: body.name,
              snapshot,
              savedById: caller.id,
              savedAt,
              createdAt: savedAt,
              updatedAt: savedAt,
            })
            .returning();
          if (version === undefined) throw new Error("version insert failed");
          const [entry] = await tx
            .insert(decisionLogEntries)
            .values({
              workspaceId: scope.workspaceId,
              ideaId: plan.ideaId,
              businessPlanId: planId,
              planVersionId: version.id,
              kind: "version_saved",
              snapshot: buildDecisionSnapshot(evaluation, {
                planVersion: { id: version.id, name: version.name },
              }),
              recordedById: caller.id,
              recordedAt: savedAt,
              createdAt: savedAt,
            })
            .returning();
          if (entry === undefined) throw new Error("decision insert failed");
          await notifyDecision(tx, entry, savedAt);
          recordChange(tx);
          return version.id;
        });
        const saved = (
          await versionSummaries(db, scope.workspaceId, planId)
        ).find((version) => version.id === versionId);
        if (saved === undefined) throw new Error(`No version ${versionId}`);
        return status(201, saved);
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        body: planVersionCreateSchema,
        parse: "json",
        response: { 201: planVersionSummarySchema, ...writeErrors },
        detail: {
          summary: "P6 Save a version (M3)",
          description:
            "Keeps a read-only snapshot of the plan (SDD 6.3), records version_saved in the decision log and notifies the workspace.",
        },
      },
    )
    .get(
      "/api/v1/plans/:planId/go-no-go-context",
      async ({ scope }) => {
        const planId = scope.planId as string;
        const context = await ideaContext(db, scope);
        const plan = await requirePlan(db, planId);
        const summary = await planSummary(db, scope.workspaceId, plan);
        const [current] = await versionSummaries(db, scope.workspaceId, planId);
        const entries = await db
          .select()
          .from(decisionLogEntries)
          .where(
            and(
              eq(decisionLogEntries.businessPlanId, planId),
              eq(decisionLogEntries.kind, "go_no_go"),
            ),
          )
          .orderBy(...newestDecisionFirst);
        return {
          conditions: await goNoGoConditions(db, planId),
          keyMetrics: context.evaluation.keyMetrics,
          currentVersion: current ?? null,
          hasChangesSinceVersion: summary.hasChangesSinceVersion,
          history: await decisionSummaries(db, scope.workspaceId, entries),
        };
      },
      {
        // An archived plan's history still reads; recording is P8's to refuse.
        scoped: { to: "planId", need: "write" },
        response: { 200: goNoGoContextSchema, ...readErrors },
        detail: {
          summary: "P7 What a Go / No-Go is recorded on (M4)",
          description:
            "The §24 conditions, the validation's key metrics, the latest saved version and whether the plan changed since, and the plan's Go / No-Go history.",
        },
      },
    )
    .post(
      "/api/v1/plans/:planId/go-no-go",
      async ({ scope, caller, body, status }) => {
        const planId = scope.planId as string;
        const ideaId = scope.ideaId as string;
        const entry = await writeInScope(
          db,
          scope,
          new Date(now()),
          async (tx) => {
            const [last] = await tx
              .select({ recordedAt: decisionLogEntries.recordedAt })
              .from(decisionLogEntries)
              .where(
                and(
                  eq(decisionLogEntries.businessPlanId, planId),
                  eq(decisionLogEntries.kind, "go_no_go"),
                ),
              )
              .orderBy(...newestDecisionFirst)
              .limit(1);
            // Under the plan's lock and after its latest Go / No-Go, which another
            // instance whose clock runs ahead may have recorded, so the new one is the
            // latest by `recordedAt` too (the latest is the one in effect, design-spec
            // 6.12 M4).
            const recordedAt = new Date(
              Math.max(now(), (last?.recordedAt.getTime() ?? 0) + 1),
            );
            const context = await ideaContext(tx, scope);
            const version = await latestVersion(tx, planId);
            const planVersion =
              version === undefined
                ? null
                : { id: version.id, name: version.name };
            const [created] = await tx
              .insert(decisionLogEntries)
              .values({
                workspaceId: scope.workspaceId,
                ideaId,
                businessPlanId: planId,
                planVersionId: planVersion?.id ?? null,
                kind: "go_no_go",
                value: body.value,
                reason: body.reason,
                snapshot: buildDecisionSnapshot(
                  evaluateValidation(
                    context.loaded.state,
                    snapshotView(context.loaded),
                  ),
                  {
                    conditions: await goNoGoConditions(tx, planId),
                    planVersion,
                  },
                ),
                recordedById: caller.id,
                recordedAt,
                createdAt: recordedAt,
              })
              .returning();
            if (created === undefined)
              throw new Error("decision insert failed");
            await notifyDecision(tx, created, recordedAt);
            recordChange(tx);
            return created;
          },
        );
        const [summary] = await decisionSummaries(db, scope.workspaceId, [
          entry,
        ]);
        if (summary === undefined) throw new Error("No decision summary");
        const stage = (await loadStages(db, [ideaId])).get(ideaId);
        if (stage === undefined) throw new Error(`No stage of ${ideaId}`);
        return status(201, {
          entry: {
            ...summary,
            reason: entry.reason,
            snapshot: decisionSnapshotSchema.parse(entry.snapshot),
          },
          stage,
        });
      },
      {
        scoped: { to: "planId", need: "writeUnarchived" },
        body: goNoGoCreateSchema,
        parse: "json",
        response: { 201: goNoGoResultSchema, ...writeErrors },
        detail: {
          summary: "P8 Record a Go / No-Go (M4)",
          description:
            "On the latest saved version (none when no version is saved), with the §24 conditions and the validation's key metrics. Notifies the workspace. A Launch makes the idea's stage launch_prep.",
        },
      },
    );
}
