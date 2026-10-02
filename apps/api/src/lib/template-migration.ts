import { schema } from "@moonx/db";
import type {
  TemplateKind,
  TemplateMigrationBody,
  TemplateMigrationPreview,
  TemplateRef,
} from "@moonx/schemas";
import { eq, max } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { costItemSnapshot } from "../history/snapshots";
import { withHistory } from "../history/with-history";
import type { Db, Executor } from "./db";
import { historyActor } from "./dto";
import { touchContainer } from "./history-revert";
import { containerAccess, type HistoryAccess } from "./history-target";
import type { Scope } from "./scope";
import type { AuthUser } from "./session";
import { loadTemplateRef, loadTemplateSections } from "./template";
import { hasText } from "./validation-data";

/** Question types that hold an answer; the metric and execution views of a plan do not. */
const ANSWERABLE = new Set(["long_text", "short_text", "choice", "amount_with_reason", "table"]);

const tableOf = (kind: TemplateKind) =>
  kind === "self_analysis"
    ? schema.selfAnalyses
    : kind === "validation"
      ? schema.validations
      : schema.businessPlans;

/** The container a migration works on, and the template version it is pinned to now. */
async function loadTarget(
  db: Executor,
  user: Pick<AuthUser, "id">,
  kind: TemplateKind,
  id: string,
  scope: Scope | null,
): Promise<{ access: HistoryAccess; versionId: string }> {
  const access = containerAccess(user, kind, id, scope);
  const table = tableOf(kind);
  const [row] = await db
    .select({ versionId: table.templateVersionId })
    .from(table)
    .where(eq(table.id, id));
  if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
  return { access, versionId: row.versionId };
}

/** The keys of the answers that hold something, whichever kind of target stores them. */
async function answeredKeys(db: Executor, kind: TemplateKind, id: string): Promise<Set<string>> {
  if (kind === "self_analysis") {
    const rows = await db
      .select()
      .from(schema.selfAnalysisAnswers)
      .where(eq(schema.selfAnalysisAnswers.selfAnalysisId, id));
    return new Set(
      rows.filter((r) => hasText(r.text) || r.amount != null).map((r) => r.questionKey),
    );
  }
  if (kind === "validation") {
    const rows = await db
      .select()
      .from(schema.validationAnswers)
      .where(eq(schema.validationAnswers.validationId, id));
    return new Set(rows.filter((r) => hasText(r.text) || r.fau != null).map((r) => r.questionKey));
  }
  const rows = await db
    .select()
    .from(schema.planAnswers)
    .where(eq(schema.planAnswers.businessPlanId, id));
  return new Set(
    rows
      .filter((r) => hasText(r.text) || ((r.rows as unknown[] | null)?.length ?? 0) > 0)
      .map((r) => r.questionKey),
  );
}

async function questionsOf(db: Executor, versionId: string) {
  const sections = await loadTemplateSections(db, versionId);
  return new Map(
    sections.flatMap(({ rows }) =>
      rows.filter((q) => ANSWERABLE.has(q.answerType)).map((q) => [q.key, q.title] as const),
    ),
  );
}

/** Template cost rows of the target version that the validation does not have yet, in order. */
async function missingCostDefaults(db: Executor, validationId: string, toVersionId: string) {
  const [defaults, existing] = await Promise.all([
    db
      .select()
      .from(schema.templateCostDefaults)
      .where(eq(schema.templateCostDefaults.templateVersionId, toVersionId))
      .orderBy(schema.templateCostDefaults.sortOrder),
    // Deleted rows count: a row someone removed does not come back with a migration.
    db
      .select({ key: schema.costItems.templateKey })
      .from(schema.costItems)
      .where(eq(schema.costItems.validationId, validationId)),
  ]);
  const have = new Set(existing.map((r) => r.key));
  return defaults.filter((d) => !have.has(d.key));
}

/** T1. What moving to the newest published version would carry over, hide and add (SDD 5.12). */
export async function previewTemplateMigration(
  db: Db,
  user: Pick<AuthUser, "id">,
  kind: TemplateKind,
  id: string,
  scope: Scope | null,
): Promise<TemplateMigrationPreview> {
  const { versionId } = await loadTarget(db, user, kind, id, scope);
  const ref = await loadTemplateRef(db, versionId);
  if (!ref.newerVersion) throw new ApiError("ALREADY_LATEST", "The template is up to date");
  const [oldQuestions, newQuestions, answered] = await Promise.all([
    questionsOf(db, versionId),
    questionsOf(db, ref.newerVersion.versionId),
    answeredKeys(db, kind, id),
  ]);
  const addedCostRows =
    kind === "validation"
      ? (await missingCostDefaults(db, id, ref.newerVersion.versionId)).map((d) => d.name)
      : [];
  return {
    from: { versionNumber: ref.versionNumber },
    to: ref.newerVersion,
    carried: [...answered].filter((key) => newQuestions.has(key)).length,
    hiddenQuestions: [...oldQuestions]
      .filter(([key]) => !newQuestions.has(key))
      .map(([questionKey, title]) => ({
        questionKey,
        title,
        hasAnswer: answered.has(questionKey),
      })),
    addedQuestions: [...newQuestions.keys()].filter((key) => !oldQuestions.has(key)).length,
    addedCostRows,
  };
}

/**
 * T2. Pins the target to a newer published version and adds the cost rows the new version has
 * and the validation lacks. Answers are keyed by question, so the ones the new version still asks
 * carry over by themselves; the others stay stored and drop out of every screen and count because
 * those only read the pinned version's questions. One `batchId` groups the pointer change and the
 * added rows, so H3 can take the whole migration back.
 */
export async function migrateTemplate(
  db: Db,
  ctx: { user: Pick<AuthUser, "id">; scope: Scope | null; request: Request; now: Date },
  body: TemplateMigrationBody,
): Promise<{ batchId: string; template: TemplateRef }> {
  const { targetType: kind, targetId: id } = body;
  const { access } = await loadTarget(db, ctx.user, kind, id, ctx.scope);
  const batchId = crypto.randomUUID();
  const actor = historyActor(ctx.request, ctx.user, "template_migration", batchId);
  const table = tableOf(kind);

  return db.transaction(async (tx) => {
    const [locked] = await tx
      .select({ versionId: table.templateVersionId })
      .from(table)
      .where(eq(table.id, id))
      .for("update");
    if (!locked) throw new ApiError("NOT_FOUND", "Resource not found");
    const current = await loadTemplateRef(tx, locked.versionId);
    if (!current.newerVersion) throw new ApiError("ALREADY_LATEST", "The template is up to date");
    const [to] = await tx
      .select({
        id: schema.templateVersions.id,
        versionNumber: schema.templateVersions.versionNumber,
        status: schema.templateVersions.status,
        templateId: schema.templateVersions.templateId,
      })
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, body.toVersionId));
    const [pinned] = await tx
      .select({ templateId: schema.templateVersions.templateId })
      .from(schema.templateVersions)
      .where(eq(schema.templateVersions.id, locked.versionId));
    if (
      to?.status !== "published" ||
      to.templateId !== pinned?.templateId ||
      to.versionNumber <= current.versionNumber
    ) {
      throw validationFailed([
        {
          path: "toVersionId",
          code: "invalid_value",
          message: "Not a newer published version of this template",
        },
      ]);
    }

    if (kind === "validation") {
      const missing = await missingCostDefaults(tx, id, to.id);
      const next = new Map<string, number>();
      const tops = await tx
        .select({ category: schema.costItems.category, top: max(schema.costItems.sortOrder) })
        .from(schema.costItems)
        .where(eq(schema.costItems.validationId, id))
        .groupBy(schema.costItems.category);
      for (const t of tops) next.set(t.category, (t.top ?? -1) + 1);
      for (const d of missing) {
        const sortOrder = next.get(d.category) ?? 0;
        next.set(d.category, sortOrder + 1);
        const rowId = crypto.randomUUID();
        await withHistory(
          tx,
          {
            container: { type: "validation", id },
            workspaceId: access.workspaceId,
            sectionKey: "costs",
            target: { type: "cost_item", id: rowId },
            actor,
          },
          async () => {
            const [row] = await tx
              .insert(schema.costItems)
              .values({
                id: rowId,
                validationId: id,
                category: d.category,
                templateKey: d.key,
                name: d.name,
                sortOrder,
                lockVersion: 0,
                updatedById: ctx.user.id,
                createdAt: ctx.now,
                updatedAt: ctx.now,
              })
              .returning();
            return {
              result: undefined,
              before: null,
              after: costItemSnapshot(row as NonNullable<typeof row>, []),
            };
          },
        );
      }
    }

    await withHistory(
      tx,
      {
        container: { type: kind, id },
        workspaceId: access.workspaceId,
        ownerUserId: access.ownerUserId,
        target: { type: "template_version", id, key: kind },
        actor,
      },
      async () => {
        await tx.update(table).set({ templateVersionId: to.id }).where(eq(table.id, id));
        return {
          result: undefined,
          before: { versionId: locked.versionId, versionNumber: current.versionNumber },
          after: { versionId: to.id, versionNumber: to.versionNumber },
        };
      },
    );
    await touchContainer(tx, access, ctx.now);
    return { batchId, template: await loadTemplateRef(tx, to.id) };
  });
}
