import {
  businessPlans,
  changeHistory,
  costItemContent,
  costItems,
  type Database,
  type DatabaseTransaction,
  loadTemplateSections,
  planAnswers,
  selfAnalyses,
  selfAnalysisAnswers,
  templateCostDefaults,
  templateVersionContent,
  templateVersions,
  validationAnswers,
  validations,
} from "@moonx/db";
import { hasText, isSelfAnalysisAnswered } from "@moonx/domain";
import {
  errorBodySchema,
  type TemplateKind,
  type TemplateMigrationCreate,
  type TemplateMigrationPreview,
  type TemplateMigrationPreviewQuery,
  templateMigrationCreateSchema,
  templateMigrationPreviewQuerySchema,
  templateMigrationPreviewSchema,
  templateMigrationResultSchema,
} from "@moonx/schemas";
import { and, asc, desc, eq, inArray, max } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
import { templateRef } from "./idea-views";
import { lockActiveCaller } from "./lock";
import { planContentTime } from "./plan-views";
import { type Scope, type ScopeRef, writeInScope } from "./scope";
import { lockSelfAnalysis, startIfAnswered } from "./self-analysis";
import { selfAnalysisOwner } from "./targets";
import { invalid } from "./validation-writes";

// T1 and T2 (SDD 5.12): moving a self-analysis, validation or plan to the newest
// template version (M8, design-spec 6.0.7). Answers are keyed by question ID, so they
// stay where they are: the pinned version alone decides which ones show. A migration
// writes the pinned version and, for a validation, the starting cost rows the new
// version adds, as one `template_migration` operation that H3 undoes.

type Executor = Database | DatabaseTransaction;

/**
 * The scope of what a migration acts on: a validation or plan; none for a self-analysis,
 * which only its owner migrates (SDD 7.1).
 *
 * @throws {ApiError} NOT_FOUND when there is no such self-analysis, FORBIDDEN for anyone
 * but its owner
 */
async function locate(
  db: Executor,
  kind: TemplateKind,
  id: string,
  caller: Caller,
): Promise<ScopeRef | null> {
  if (kind === "validation") return { validationId: id };
  if (kind === "business_plan") return { planId: id };
  const owner = await selfAnalysisOwner(db, id);
  if (owner === null) throw new ApiError("NOT_FOUND", "No such self-analysis");
  if (owner !== caller.id) {
    throw new ApiError("FORBIDDEN", "Only its owner migrates a self-analysis");
  }
  return null;
}

const previewLocator: ScopeLocator = ({ query, caller, db }) => {
  const { targetType, targetId } = query as TemplateMigrationPreviewQuery;
  return locate(db, targetType, targetId, caller);
};

const migrationLocator: ScopeLocator = ({ body, caller, db }) => {
  const { targetType, targetId } = body as TemplateMigrationCreate;
  return locate(db, targetType, targetId, caller);
};

/** A self-analysis, validation or plan, and the template version it is pinned to. */
interface Pinned {
  kind: TemplateKind;
  id: string;
  versionId: string;
}

/**
 * What a migration acts on and the version it is pinned to: the validation or plan of
 * `scope`, or the caller's own self-analysis `targetId`. Ids are the stored ones,
 * lowercase whatever case the request wrote.
 *
 * @throws {ApiError} NOT_FOUND when it is gone since the scope was resolved (the
 * owner's account deleted meanwhile, with their personal workspace)
 */
async function loadPinned(
  db: Executor,
  kind: TemplateKind,
  scope: Scope | null,
  target: { id: string; callerId: string },
): Promise<Pinned> {
  const [row] =
    kind === "self_analysis"
      ? await db
          .select({
            id: selfAnalyses.id,
            versionId: selfAnalyses.templateVersionId,
          })
          .from(selfAnalyses)
          .where(
            and(
              eq(selfAnalyses.id, target.id),
              eq(selfAnalyses.userId, target.callerId),
            ),
          )
      : scope === null
        ? []
        : kind === "validation"
          ? await db
              .select({
                id: validations.id,
                versionId: validations.templateVersionId,
              })
              .from(validations)
              .where(eq(validations.ideaId, scope.ideaId as string))
          : await db
              .select({
                id: businessPlans.id,
                versionId: businessPlans.templateVersionId,
              })
              .from(businessPlans)
              .where(eq(businessPlans.id, scope.planId as string));
  if (row === undefined)
    throw new ApiError("NOT_FOUND", `No ${kind} ${target.id}`);
  return { kind, ...row };
}

/**
 * The newest published version of the template `pinned` uses, when it is newer.
 *
 * @throws {ApiError} ALREADY_LATEST when there is none
 */
async function newestVersion(db: Executor, pinned: Pinned) {
  const { newerVersion } = await templateRef(db, pinned.versionId);
  if (newerVersion === null) {
    throw new ApiError(
      "ALREADY_LATEST",
      "Already on the newest published template version",
    );
  }
  return newerVersion;
}

/** The question IDs of `pinned` whose stored answer has something in it. */
async function answeredKeys(
  db: Executor,
  pinned: Pinned,
): Promise<Set<string>> {
  const keys = (rows: { questionKey: string; answered: boolean }[]) =>
    new Set(rows.filter((row) => row.answered).map((row) => row.questionKey));
  if (pinned.kind === "self_analysis") {
    const rows = await db
      .select()
      .from(selfAnalysisAnswers)
      .where(eq(selfAnalysisAnswers.selfAnalysisId, pinned.id));
    return keys(
      rows.map((row) => ({
        questionKey: row.questionKey,
        answered: isSelfAnalysisAnswered(row),
      })),
    );
  }
  if (pinned.kind === "validation") {
    const rows = await db
      .select()
      .from(validationAnswers)
      .where(eq(validationAnswers.validationId, pinned.id));
    // Unknown needs no text (design-spec 6.0.3), and is something the person said.
    return keys(
      rows.map((row) => ({
        questionKey: row.questionKey,
        answered: hasText(row.text) || row.fau === "unknown",
      })),
    );
  }
  const rows = await db
    .select()
    .from(planAnswers)
    .where(eq(planAnswers.businessPlanId, pinned.id));
  return keys(
    rows.map((row) => ({
      questionKey: row.questionKey,
      answered:
        hasText(row.text) || ((row.rows as unknown[] | null)?.length ?? 0) > 0,
    })),
  );
}

/**
 * The starting cost rows of `versionId` that migrating the validation `validationId`
 * adds (SDD 5.12 T2, design-spec 6.0.7), in template order. A key with no row is added.
 * A key whose rows are all deleted is added again only when the latest deletion undid a
 * migration (H3): a row the person deleted stays deleted, and a row a migration added
 * comes back with the next one.
 */
async function costRowsToAdd(
  db: Executor,
  validationId: string,
  versionId: string,
) {
  const defaults = await db
    .select({
      category: templateCostDefaults.category,
      key: templateCostDefaults.key,
      name: templateCostDefaults.name,
    })
    .from(templateCostDefaults)
    .where(eq(templateCostDefaults.templateVersionId, versionId))
    .orderBy(asc(templateCostDefaults.sortOrder), asc(templateCostDefaults.id));
  if (defaults.length === 0) return [];
  const rows = await db
    .select({
      id: costItems.id,
      templateKey: costItems.templateKey,
      deletedAt: costItems.deletedAt,
    })
    .from(costItems)
    .where(
      and(
        eq(costItems.validationId, validationId),
        inArray(
          costItems.templateKey,
          defaults.map((row) => row.key),
        ),
      ),
    );
  const deleted = rows.filter((row) => row.deletedAt !== null);
  const origin = alias(changeHistory, "origin");
  const deletions =
    deleted.length === 0
      ? []
      : await db
          .select({
            targetId: changeHistory.targetId,
            source: changeHistory.source,
            undid: origin.source,
          })
          .from(changeHistory)
          .leftJoin(origin, eq(origin.id, changeHistory.revertedFromId))
          .where(
            and(
              eq(changeHistory.targetType, "cost_item"),
              eq(changeHistory.action, "delete"),
              inArray(
                changeHistory.targetId,
                deleted.map((row) => row.id),
              ),
            ),
          )
          .orderBy(desc(changeHistory.changedAt), desc(changeHistory.id));
  const undoneByMigration = (rowId: string) => {
    const latest = deletions.find((deletion) => deletion.targetId === rowId);
    return latest?.source === "revert" && latest.undid === "template_migration";
  };
  return defaults.filter((row) => {
    const ofKey = rows.filter((other) => other.templateKey === row.key);
    if (ofKey.length === 0) return true;
    if (ofKey.some((other) => other.deletedAt === null)) return false;
    const [lastDeleted] = ofKey.toSorted(
      (a, b) => (b.deletedAt?.getTime() ?? 0) - (a.deletedAt?.getTime() ?? 0),
    );
    return lastDeleted !== undefined && undoneByMigration(lastDeleted.id);
  });
}

/** T1: what migrating `pinned` to `to` keeps, hides and adds. */
async function preview(
  db: Executor,
  pinned: Pinned,
  to: { versionId: string; versionNumber: number },
): Promise<TemplateMigrationPreview> {
  const sections = await loadTemplateSections(db, [
    pinned.versionId,
    to.versionId,
  ]);
  const questionsOf = (versionId: string) =>
    (sections.get(versionId) ?? []).flatMap((section) => section.questions);
  const current = questionsOf(pinned.versionId);
  const next = new Set(questionsOf(to.versionId).map((q) => q.key));
  const kept = new Set(current.map((q) => q.key));
  const answered = await answeredKeys(db, pinned);
  const [from] = await db
    .select({ versionNumber: templateVersions.versionNumber })
    .from(templateVersions)
    .where(eq(templateVersions.id, pinned.versionId));
  if (from === undefined) throw new Error(`No version ${pinned.versionId}`);
  return {
    from,
    to,
    carried: current.filter((q) => next.has(q.key) && answered.has(q.key))
      .length,
    hiddenQuestions: current
      .filter((q) => !next.has(q.key))
      .map((q) => ({
        questionKey: q.key,
        title: q.title,
        hasAnswer: answered.has(q.key),
      })),
    addedQuestions: [...next].filter((key) => !kept.has(key)).length,
    addedCostRows:
      pinned.kind === "validation"
        ? (await costRowsToAdd(db, pinned.id, to.versionId)).map(
            (row) => row.name,
          )
        : [],
  };
}

const PINNED_TABLES = {
  self_analysis: selfAnalyses,
  validation: validations,
  business_plan: businessPlans,
} as const;

/**
 * Pins `pinned` to `toVersionId` and adds the validation's new starting cost rows, under
 * the locks of the caller's write.
 *
 * @returns The changes of the operation, for its history, and the version's stored id.
 *
 * @throws {ApiError} ALREADY_LATEST when no newer version is published (another person
 * migrated first); VALIDATION_FAILED when `toVersionId` is not a published version of
 * the same template newer than the pinned one
 */
async function migrate(
  tx: DatabaseTransaction,
  pinned: Pinned,
  toVersionId: string,
  callerId: string,
  at: Date,
): Promise<{ changes: HistoryChange[]; versionId: string }> {
  await newestVersion(tx, pinned);
  const [from] = await tx
    .select({
      templateId: templateVersions.templateId,
      versionNumber: templateVersions.versionNumber,
    })
    .from(templateVersions)
    .where(eq(templateVersions.id, pinned.versionId));
  const [to] = await tx
    .select({
      versionId: templateVersions.id,
      templateId: templateVersions.templateId,
      versionNumber: templateVersions.versionNumber,
      status: templateVersions.status,
    })
    .from(templateVersions)
    .where(eq(templateVersions.id, toVersionId));
  if (from === undefined) throw new Error(`No version ${pinned.versionId}`);
  if (
    to === undefined ||
    to.templateId !== from.templateId ||
    to.status !== "published" ||
    to.versionNumber <= from.versionNumber
  ) {
    throw invalid(
      "toVersionId",
      "invalid_value",
      "Not a published version of the template newer than the pinned one",
    );
  }
  const table = PINNED_TABLES[pinned.kind] as typeof validations;
  await tx
    .update(table)
    .set({ templateVersionId: to.versionId })
    .where(eq(table.id, pinned.id));
  const changes: HistoryChange[] = [
    {
      target: { type: "template_version", id: pinned.id, key: pinned.kind },
      action: "update",
      before: templateVersionContent({
        versionId: pinned.versionId,
        versionNumber: from.versionNumber,
      }),
      after: templateVersionContent(to),
    },
  ];
  const done = { changes, versionId: to.versionId };
  if (pinned.kind !== "validation") return done;

  const added = await costRowsToAdd(tx, pinned.id, to.versionId);
  if (added.length === 0) return done;
  // After every row of the category, deleted ones too, so no order repeats.
  const lastOrders = await tx
    .select({ category: costItems.category, last: max(costItems.sortOrder) })
    .from(costItems)
    .where(eq(costItems.validationId, pinned.id))
    .groupBy(costItems.category);
  const next = new Map(
    lastOrders.map((row) => [row.category, (row.last ?? -1) + 1]),
  );
  const rows = await tx
    .insert(costItems)
    .values(
      added.map((row) => {
        const sortOrder = next.get(row.category) ?? 0;
        next.set(row.category, sortOrder + 1);
        return {
          validationId: pinned.id,
          category: row.category,
          templateKey: row.key,
          name: row.name,
          sortOrder,
          updatedById: callerId,
          createdAt: at,
          updatedAt: at,
        };
      }),
    )
    .returning();
  for (const row of rows) {
    changes.push({
      target: { type: "cost_item", id: row.id },
      action: "create",
      before: null,
      after: costItemContent(row, []),
    });
  }
  return done;
}

/** What the template migration routes need from the app. */
export interface TemplateMigrationRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  409: errorBodySchema,
  422: errorBodySchema,
} as const;

/** T1 and T2 (SDD 5.12): M8 on 10, 13 and 20. */
export function templateMigrationRoutes({
  access,
  db,
  now,
}: TemplateMigrationRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      "/api/v1/template-migrations/preview",
      async ({ scope, query, caller }) => {
        const pinned = await loadPinned(db, query.targetType, scope, {
          id: query.targetId,
          callerId: caller.id,
        });
        return preview(db, pinned, await newestVersion(db, pinned));
      },
      {
        located: { to: previewLocator, need: "write" },
        query: templateMigrationPreviewQuerySchema,
        response: { 200: templateMigrationPreviewSchema, ...errors },
        detail: {
          summary: "T1 Preview a template migration (M8)",
          description:
            "Owners and Members; a self-analysis is its owner's only. What moving to the newest published version keeps (carried), hides with their answers (hiddenQuestions), and adds. 409 ALREADY_LATEST when no newer version is published.",
        },
      },
    )
    .post(
      "/api/v1/template-migrations",
      async ({ scope, caller, body, request }) => {
        const migrateWithHistory = async (
          tx: DatabaseTransaction,
          operation: HistoryOperation,
          pinned: Pinned,
        ) => {
          const done = await migrate(
            tx,
            pinned,
            body.toVersionId,
            caller.id,
            operation.at,
          );
          await withHistory(tx, operation, async () => done.changes);
          return done;
        };
        const batchId = crypto.randomUUID();
        const base = {
          changedById: caller.id,
          source: "template_migration",
          batchId,
          client: requestContext(request).client,
        } as const;
        const at = new Date(now());
        let toVersionId: string;
        if (body.targetType === "self_analysis") {
          toVersionId = await db.transaction(async (tx) => {
            // As S3 writes: the caller, then the self-analysis (SDD 5.8), so no save
            // runs on a version this changes.
            await lockActiveCaller(tx, caller.id);
            const analysis = await lockSelfAnalysis(tx, caller.id);
            if (analysis.id !== body.targetId.toLowerCase()) {
              throw new ApiError("NOT_FOUND", "No such self-analysis");
            }
            const pinned: Pinned = {
              kind: "self_analysis",
              id: analysis.id,
              versionId: analysis.templateVersionId,
            };
            const container: HistoryContainer = {
              type: "self_analysis",
              id: analysis.id,
              ownerUserId: caller.id,
            };
            const { versionId } = await migrateWithHistory(
              tx,
              { ...base, container, at },
              pinned,
            );
            const sections =
              (await loadTemplateSections(tx, [versionId])).get(versionId) ??
              [];
            // An answer hidden before may show now, and count as answered.
            await startIfAnswered(
              tx,
              { ...analysis, templateVersionId: versionId },
              sections,
              at,
            );
            return versionId;
          });
        } else {
          if (scope === null)
            throw new Error("A validation or plan has a scope");
          toVersionId = await writeInScope(db, scope, at, async (tx) => {
            const pinned = await loadPinned(tx, body.targetType, scope, {
              id: body.targetId,
              callerId: caller.id,
            });
            const container: HistoryContainer = {
              type: pinned.kind as "validation" | "business_plan",
              id: pinned.id,
              workspaceId: scope.workspaceId,
            };
            // A plan's changes read as made after its latest version (SDD 6.3).
            const when =
              pinned.kind === "business_plan"
                ? await planContentTime(tx, pinned.id, at)
                : at;
            const { versionId } = await migrateWithHistory(
              tx,
              { ...base, container, at: when },
              pinned,
            );
            return versionId;
          });
        }
        return { batchId, template: await templateRef(db, toVersionId) };
      },
      {
        located: { to: migrationLocator, need: "writeUnarchived" },
        body: templateMigrationCreateSchema,
        parse: "json",
        response: { 200: templateMigrationResultSchema, ...errors },
        detail: {
          summary: "T2 Migrate to a newer template version (M8)",
          description:
            "Owners and Members; a self-analysis is its owner's only. Pins toVersionId, a published version of the same template newer than the pinned one (else 422 VALIDATION_FAILED), and adds the starting cost rows the new version adds to a validation, as one template_migration operation that H3 undoes. Answers to questions the new version lacks stay, hidden. 409 ALREADY_LATEST when no newer version is published.",
        },
      },
    );
}
