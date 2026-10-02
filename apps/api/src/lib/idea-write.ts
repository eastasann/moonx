import { isDeepStrictEqual } from "node:util";
import { schema } from "@moonx/db";
import { and, desc, eq, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import { ideaSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Db, Executor, Tx } from "./db";
import { checkLock, type LockInput } from "./lock";

const blankToNull = (text: string | null | undefined) => (text?.trim() ? text : null);

/** Marks the workspace as active (the admin list sorts by it, design-spec 28). */
export async function touchWorkspace(tx: Executor, workspaceId: string, now: Date) {
  await tx
    .update(schema.workspaces)
    .set({ lastActiveAt: now, updatedAt: sql`${schema.workspaces.updatedAt}` })
    .where(eq(schema.workspaces.id, workspaceId));
}

/** The validation template version new validations are created on: the newest published one. */
async function latestValidationTemplateVersion(db: Executor): Promise<string> {
  const [row] = await db
    .select({ id: schema.templateVersions.id })
    .from(schema.templateVersions)
    .innerJoin(schema.templates, eq(schema.templates.id, schema.templateVersions.templateId))
    .where(
      and(eq(schema.templates.kind, "validation"), eq(schema.templateVersions.status, "published")),
    )
    .orderBy(desc(schema.templateVersions.versionNumber))
    .limit(1);
  if (!row) throw new ApiError("INTERNAL", "No published validation template");
  return row.id;
}

/**
 * I1 POST. Creates the idea, its validation on the newest published template version and the
 * Empty cost rows of that version, and records only the creation of the idea (SDD 5.6).
 */
export async function createIdea(
  db: Db,
  p: {
    workspaceId: string;
    actor: HistoryActor;
    now: Date;
    body: { name: string; oneLineConcept: string; proposedSolution?: string };
  },
): Promise<string> {
  return db.transaction(async (tx) => {
    const templateVersionId = await latestValidationTemplateVersion(tx);
    const [created] = await tx
      .insert(schema.ideas)
      .values({
        workspaceId: p.workspaceId,
        name: p.body.name,
        oneLineConcept: p.body.oneLineConcept,
        proposedSolution: blankToNull(p.body.proposedSolution),
        proposerId: p.actor.userId,
        lastActivityAt: p.now,
        updatedById: p.actor.userId,
      })
      .returning();
    const idea = created as typeof schema.ideas.$inferSelect;
    const [validation] = await tx
      .insert(schema.validations)
      .values({ ideaId: idea.id, templateVersionId })
      .returning({ id: schema.validations.id });
    const defaults = await tx
      .select()
      .from(schema.templateCostDefaults)
      .where(eq(schema.templateCostDefaults.templateVersionId, templateVersionId));
    if (defaults.length > 0) {
      await tx.insert(schema.costItems).values(
        defaults.map((d) => ({
          validationId: (validation as { id: string }).id,
          category: d.category,
          templateKey: d.key,
          name: d.name,
          sortOrder: d.sortOrder,
          updatedById: p.actor.userId,
        })),
      );
    }
    await withHistory(
      tx,
      {
        container: { type: "idea", id: idea.id },
        workspaceId: p.workspaceId,
        target: { type: "idea", id: idea.id },
        actor: p.actor,
      },
      async () => ({ result: undefined, before: null, after: ideaSnapshot(idea) }),
    );
    await touchWorkspace(tx, p.workspaceId, p.now);
    return idea.id;
  });
}

/** The fields of an I2 request that may change an idea. */
export interface IdeaPatch extends LockInput {
  name?: string;
  oneLineConcept?: string;
  proposedSolution?: string | null;
}

/** I2 PATCH. A request that changes nothing writes no row and keeps the version. */
export async function updateIdea(
  db: Db,
  p: { ideaId: string; workspaceId: string; actor: HistoryActor; now: Date; body: IdeaPatch },
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.ideas)
      .where(and(eq(schema.ideas.id, p.ideaId), eq(schema.ideas.workspaceId, p.workspaceId)))
      .for("update");
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    if (row.archivedAt) throw new ApiError("ARCHIVED", "Archived items cannot be changed");
    const before = ideaSnapshot(row);
    const lockVersion = await checkLock(tx, {
      workspaceId: p.workspaceId,
      row,
      sent: p.body,
      currentValue: () => before,
    });
    const after = {
      name: p.body.name ?? row.name,
      oneLineConcept: p.body.oneLineConcept ?? row.oneLineConcept,
      proposedSolution:
        p.body.proposedSolution === undefined
          ? row.proposedSolution
          : blankToNull(p.body.proposedSolution),
    };
    if (isDeepStrictEqual(before, after)) return;
    await withHistory(
      tx,
      {
        container: { type: "idea", id: row.id },
        workspaceId: p.workspaceId,
        target: { type: "idea", id: row.id },
        actor: p.actor,
      },
      async () => {
        await tx
          .update(schema.ideas)
          .set({ ...after, lockVersion, updatedById: p.actor.userId, lastActivityAt: p.now })
          .where(eq(schema.ideas.id, row.id));
        return { result: undefined, before, after };
      },
    );
    await touchWorkspace(tx, p.workspaceId, p.now);
  });
}

/**
 * I4. Archiving is not a tracked item (design-spec 6.0.5), so it writes no history and leaves
 * `updatedAt` alone: that stamp belongs to the last edit of the idea's summary, with its editor.
 * Archiving an archived idea (or restoring one that is not) changes nothing.
 */
export async function setIdeaArchived(
  db: Db,
  p: { ideaId: string; workspaceId: string; archived: boolean; now: Date },
): Promise<void> {
  await db.transaction(async (tx: Tx) => {
    const [row] = await tx
      .select()
      .from(schema.ideas)
      .where(and(eq(schema.ideas.id, p.ideaId), eq(schema.ideas.workspaceId, p.workspaceId)))
      .for("update");
    if (!row) throw new ApiError("NOT_FOUND", "Resource not found");
    if ((row.archivedAt != null) === p.archived) return;
    await tx
      .update(schema.ideas)
      .set({
        archivedAt: p.archived ? p.now : null,
        lastActivityAt: p.now,
        updatedAt: row.updatedAt,
      })
      .where(eq(schema.ideas.id, row.id));
    await touchWorkspace(tx, p.workspaceId, p.now);
  });
}
