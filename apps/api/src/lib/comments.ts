import { schema } from "@moonx/db";
import type { Comment, CommentThread, UserRef } from "@moonx/schemas";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { ApiError, validationFailed } from "../errors";
import { commentLink, isPlanLevel, type TargetAccess } from "./comment-target";
import type { Db, Executor, Tx } from "./db";
import { iso, isoOrNull } from "./dto";
import { assertOpen } from "./history-target";
import { notifyComment } from "./notify";
import { loadUserRefs, userRefOrNull } from "./users";
import { loadMentionCandidates } from "./workspace-members";

export type CommentRow = typeof schema.comments.$inferSelect;

/**
 * The comments as C1 answers them. A deleted comment keeps its place in the thread but nothing
 * of its content: the row still holds the text, the answer never carries it.
 */
export async function toComments(db: Executor, rows: CommentRow[]): Promise<Comment[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const workspaceIds = [...new Set(rows.map((r) => r.workspaceId))];
  const [workspaces, mentionRows] = await Promise.all([
    db
      .select({ id: schema.workspaces.id, name: schema.workspaces.name })
      .from(schema.workspaces)
      .where(inArray(schema.workspaces.id, workspaceIds)),
    db
      .select({
        commentId: schema.commentMentions.commentId,
        userId: schema.commentMentions.userId,
      })
      .from(schema.commentMentions)
      .where(inArray(schema.commentMentions.commentId, ids))
      .orderBy(asc(schema.commentMentions.createdAt), asc(schema.commentMentions.id)),
  ]);
  // "Former member" badges depend on the workspace, so people are resolved once per workspace.
  const refsByWorkspace = new Map<string, Map<string, UserRef>>();
  for (const workspaceId of workspaceIds) {
    const inWorkspace = rows.filter((r) => r.workspaceId === workspaceId);
    const people = inWorkspace.flatMap((r) => [
      r.authorId,
      r.resolvedById,
      ...mentionRows.filter((m) => m.commentId === r.id).map((m) => m.userId),
    ]);
    refsByWorkspace.set(workspaceId, await loadUserRefs(db, people, workspaceId));
  }
  const nameOf = new Map(workspaces.map((w) => [w.id, w.name]));
  return rows.map((row) => {
    const refs = refsByWorkspace.get(row.workspaceId) as Map<string, UserRef>;
    const deleted = row.deletedAt != null;
    return {
      id: row.id,
      workspace: { id: row.workspaceId, name: nameOf.get(row.workspaceId) ?? "" },
      target: {
        type: row.targetType,
        id: row.targetId,
        key: row.targetKey,
      },
      parentId: row.parentId,
      author: refs.get(row.authorId) as UserRef,
      body: deleted ? "" : row.body,
      mentions: deleted
        ? []
        : mentionRows
            .filter((m) => m.commentId === row.id)
            .flatMap((m) => refs.get(m.userId) ?? []),
      resolvedAt: isoOrNull(row.resolvedAt),
      resolvedBy: userRefOrNull(refs, row.resolvedById),
      editedAt: isoOrNull(row.editedAt),
      deleted,
      createdAt: iso(row.createdAt),
    };
  });
}

/** Groups comment rows (oldest first) into threads: a root and its replies. */
export async function toThreads(db: Executor, rows: CommentRow[]): Promise<CommentThread[]> {
  const comments = await toComments(db, rows);
  const roots = comments.filter((c) => c.parentId === null);
  return roots.map((root) => ({
    root,
    replies: comments.filter((c) => c.parentId === root.id),
  }));
}

/** The person ids a comment may mention (design-spec 6.0.4), without duplicates. */
export async function checkMentions(
  db: Executor,
  access: TargetAccess,
  mentionUserIds: string[],
): Promise<string[]> {
  const ids = [...new Set(mentionUserIds)];
  if (ids.length === 0) return ids;
  const { workspace, located } = access;
  const candidates = await loadMentionCandidates(
    db,
    {
      workspaceId: (workspace as NonNullable<typeof workspace>).id,
      role: (workspace as NonNullable<typeof workspace>).role,
    },
    located.selfAnalysis ? { type: located.ref.type, id: located.ref.id } : null,
  );
  const allowed = new Set(candidates.map((c) => c.id));
  if (ids.some((id) => !allowed.has(id))) {
    throw new ApiError("INVALID_MENTION", "Only members who can read this can be mentioned");
  }
  return ids;
}

/**
 * Locks the idea and plan a comment sits under against archiving and checks they are still
 * open, so a comment cannot land in something archived between the check and the write.
 */
export async function assertStillOpen(tx: Tx, access: TargetAccess): Promise<void> {
  const { scope } = access;
  if (!scope) return;
  await assertOpen(tx, { ideaId: scope.ideaId ?? null, planId: scope.planId ?? null });
}

/** People a new comment concerns besides those it mentions (design-spec 6.15 "コメント"). */
async function interestedPeople(
  tx: Tx,
  access: TargetAccess,
  parentId: string | null,
): Promise<string[]> {
  const { located, scope } = access;
  const people: string[] = [];
  if (located.selfAnalysis) {
    people.push(located.selfAnalysis.ownerId);
  } else if (scope?.planId && isPlanLevel(located.ref.type)) {
    const [plan] = await tx
      .select({ createdById: schema.businessPlans.createdById })
      .from(schema.businessPlans)
      .where(eq(schema.businessPlans.id, scope.planId));
    if (plan) people.push(plan.createdById);
  } else if (scope?.ideaId) {
    const [idea] = await tx
      .select({ proposerId: schema.ideas.proposerId })
      .from(schema.ideas)
      .where(eq(schema.ideas.id, scope.ideaId));
    if (idea) people.push(idea.proposerId);
  }
  if (parentId) {
    const thread = await tx
      .select({ authorId: schema.comments.authorId })
      .from(schema.comments)
      .where(or(eq(schema.comments.id, parentId), eq(schema.comments.parentId, parentId)));
    people.push(...thread.map((c) => c.authorId));
  }
  return people;
}

/** What the writing functions need to know about the request. */
interface WriteContext {
  access: TargetAccess;
  /** The caller's id. */
  userId: string;
  now: Date;
}

const sameTarget = (row: CommentRow, ref: TargetAccess["located"]["ref"]) =>
  row.targetType === ref.type && row.targetId === ref.id && (row.targetKey ?? null) === ref.key;

/**
 * C1 POST: stores the comment, its mentions and its notifications in one transaction. A reply
 * must answer a thread root of the same target and workspace (one level only).
 */
export async function createComment(
  db: Db,
  p: WriteContext & { body: string; parentId: string | null; mentionUserIds: string[] },
): Promise<string> {
  const { access, userId, now } = p;
  const workspace = access.workspace as NonNullable<TargetAccess["workspace"]>;
  const { ref } = access.located;
  const mentionIds = await checkMentions(db, access, p.mentionUserIds);
  return db.transaction(async (tx) => {
    await assertStillOpen(tx, access);
    if (p.parentId) {
      const [parent] = await tx
        .select()
        .from(schema.comments)
        .where(eq(schema.comments.id, p.parentId));
      if (!parent || parent.workspaceId !== workspace.id || !sameTarget(parent, ref)) {
        throw validationFailed([
          { path: "parentId", code: "invalid_value", message: "Not a comment on this target" },
        ]);
      }
      if (parent.parentId) {
        throw new ApiError("REPLY_DEPTH", "Replies go one level deep");
      }
    }
    const [created] = await tx
      .insert(schema.comments)
      .values({
        workspaceId: workspace.id,
        targetType: ref.type,
        targetId: ref.id,
        targetKey: ref.key,
        parentId: p.parentId,
        authorId: userId,
        body: p.body,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.comments.id });
    const commentId = (created as { id: string }).id;
    if (mentionIds.length > 0) {
      await tx
        .insert(schema.commentMentions)
        .values(mentionIds.map((id) => ({ commentId, userId: id, createdAt: now })));
    }
    await notifyAbout(tx, access, {
      commentId,
      authorId: userId,
      mentionIds,
      interestedIds: await interestedPeople(tx, access, p.parentId),
    });
    return commentId;
  });
}

async function notifyAbout(
  tx: Tx,
  access: TargetAccess,
  p: { commentId: string; authorId: string; mentionIds: string[]; interestedIds: string[] },
): Promise<void> {
  const workspace = access.workspace as NonNullable<TargetAccess["workspace"]>;
  await notifyComment(tx, {
    commentId: p.commentId,
    authorId: p.authorId,
    workspaceId: workspace.id,
    selfAnalysis: access.located.selfAnalysis != null,
    mentionIds: p.mentionIds,
    interestedIds: p.interestedIds,
    linkFor: (recipientId) =>
      commentLink(access.located, {
        workspaceId: workspace.id,
        ideaId: access.scope?.ideaId ?? null,
        planId: access.scope?.planId ?? null,
        recipientId,
      }),
  });
}

/**
 * C2 PATCH: replaces the text and the mentions. Only people mentioned for the first time are
 * notified, so fixing a typo does not ring the same person again.
 */
export async function editComment(
  db: Db,
  p: WriteContext & { comment: CommentRow; body: string; mentionUserIds: string[] },
): Promise<void> {
  const { access, comment, now } = p;
  const mentionIds = await checkMentions(db, access, p.mentionUserIds);
  await db.transaction(async (tx) => {
    await assertStillOpen(tx, access);
    const [current] = await tx
      .select()
      .from(schema.comments)
      .where(eq(schema.comments.id, comment.id))
      .for("update");
    if (!current || current.deletedAt) throw new ApiError("NOT_FOUND", "Comment not found");
    const existing = (
      await tx
        .select({ userId: schema.commentMentions.userId })
        .from(schema.commentMentions)
        .where(eq(schema.commentMentions.commentId, comment.id))
    ).map((m) => m.userId);
    const added = mentionIds.filter((id) => !existing.includes(id));
    const removed = existing.filter((id) => !mentionIds.includes(id));
    if (current.body === p.body && added.length === 0 && removed.length === 0) return;
    await tx
      .update(schema.comments)
      .set({ body: p.body, editedAt: now, updatedAt: now })
      .where(eq(schema.comments.id, comment.id));
    if (removed.length > 0) {
      await tx
        .delete(schema.commentMentions)
        .where(
          and(
            eq(schema.commentMentions.commentId, comment.id),
            inArray(schema.commentMentions.userId, removed),
          ),
        );
    }
    if (added.length > 0) {
      await tx
        .insert(schema.commentMentions)
        .values(added.map((userId) => ({ commentId: comment.id, userId, createdAt: now })));
      await notifyAbout(tx, access, {
        commentId: comment.id,
        authorId: p.userId,
        mentionIds: added,
        interestedIds: [],
      });
    }
  });
}

/** C2 DELETE: the comment stays in its thread as "deleted". */
export async function deleteComment(db: Db, p: WriteContext & { comment: CommentRow }) {
  await db.transaction(async (tx) => {
    await assertStillOpen(tx, p.access);
    await tx
      .update(schema.comments)
      .set({ deletedAt: p.now, updatedAt: p.now })
      .where(and(eq(schema.comments.id, p.comment.id), isNull(schema.comments.deletedAt)));
  });
}

/** C3: resolves a thread (`resolved`) or reopens it. Resolving twice keeps the first resolver. */
export async function setThreadResolved(
  db: Db,
  p: WriteContext & { comment: CommentRow; resolved: boolean },
) {
  await db.transaction(async (tx) => {
    await assertStillOpen(tx, p.access);
    if (p.resolved) {
      await tx
        .update(schema.comments)
        .set({ resolvedAt: p.now, resolvedById: p.userId, updatedAt: p.now })
        .where(and(eq(schema.comments.id, p.comment.id), isNull(schema.comments.resolvedAt)));
    } else {
      await tx
        .update(schema.comments)
        .set({ resolvedAt: null, resolvedById: null, updatedAt: p.now })
        .where(eq(schema.comments.id, p.comment.id));
    }
  });
}
