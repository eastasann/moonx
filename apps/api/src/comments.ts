import {
  commentMentions,
  comments,
  type Database,
  type DatabaseTransaction,
  memberships,
  selfAnalysisShares,
  workspaces,
} from "@moonx/db";
import {
  type Comment,
  type CommentCreate,
  type CommentList,
  type CommentListQuery,
  commentCreateSchema,
  commentIdParamsSchema,
  commentListQuerySchema,
  commentListSchema,
  commentSchema,
  commentUpdateSchema,
  errorBodySchema,
  type Role,
  type TargetRef,
  uuidSchema,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull, or, type SQL } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin, ScopeLocator } from "./access";
import { ApiError } from "./errors";
import { historySectionKey } from "./history";
import { lockMembers } from "./membership";
import { notifyComment } from "./notifications";
import { recordChange, type Scope, type ScopeRef, writeInScope } from "./scope";
import {
  checkCommentKey,
  locateTarget,
  selfAnalysisOwner,
  visibleComments,
} from "./targets";
import { loadUserRefs } from "./user-refs";
import { invalid } from "./validation-writes";

type Executor = Database | DatabaseTransaction;
type CommentRow = typeof comments.$inferSelect;

const noContent = z.undefined().meta({ description: "No content" });

const notFound = () => new ApiError("NOT_FOUND", "No such item");

/** The scope of a screen inside a workspace, by its container (SDD 6.3). */
const containerScope = (
  type: "validation" | "business_plan" | "idea",
  id: string,
): ScopeRef =>
  type === "validation"
    ? { validationId: id }
    : type === "business_plan"
      ? { planId: id }
      : { ideaId: id };

/** Where a stored comment is authorized: its screen, or for a self-analysis its share. */
const scopeOfComment = (row: CommentRow): ScopeRef =>
  row.containerType === "self_analysis"
    ? { workspaceId: row.workspaceId }
    : containerScope(row.containerType, row.containerId);

/** The `Comment` of each of `rows` (SDD 5.11), keyed by id. */
async function commentViews(
  db: Executor,
  rows: readonly CommentRow[],
): Promise<Map<string, Comment>> {
  const views = new Map<string, Comment>();
  if (rows.length === 0) return views;
  const ids = rows.map((row) => row.id);
  const mentions = await db
    .select({
      commentId: commentMentions.commentId,
      userId: commentMentions.userId,
    })
    .from(commentMentions)
    .where(inArray(commentMentions.commentId, ids))
    .orderBy(asc(commentMentions.createdAt), asc(commentMentions.id));
  const workspaceIds = [...new Set(rows.map((row) => row.workspaceId))];
  const names = new Map(
    (
      await db
        .select({ id: workspaces.id, name: workspaces.name })
        .from(workspaces)
        .where(inArray(workspaces.id, workspaceIds))
    ).map((row) => [row.id, row.name]),
  );
  const workspaceName = (id: string) => {
    const name = names.get(id);
    if (name === undefined) throw new Error(`No workspace ${id}`);
    return name;
  };
  // A person shows as a former member of the workspace the comment belongs to.
  const refs = new Map<string, Awaited<ReturnType<typeof loadUserRefs>>>();
  for (const workspaceId of workspaceIds) {
    const inWorkspace = rows.filter((row) => row.workspaceId === workspaceId);
    const people = [
      ...inWorkspace.flatMap((row) =>
        row.resolvedById === null
          ? [row.authorId]
          : [row.authorId, row.resolvedById],
      ),
      ...mentions
        .filter((mention) =>
          inWorkspace.some((row) => row.id === mention.commentId),
        )
        .map((mention) => mention.userId),
    ];
    refs.set(workspaceId, await loadUserRefs(db, people, workspaceId));
  }
  for (const row of rows) {
    const users = refs.get(row.workspaceId) ?? new Map();
    const ref = (id: string) => {
      const user = users.get(id);
      if (user === undefined) throw new Error(`No user ${id}`);
      return user;
    };
    const deleted = row.deletedAt !== null;
    views.set(row.id, {
      id: row.id,
      workspace: { id: row.workspaceId, name: workspaceName(row.workspaceId) },
      target: { type: row.targetType, id: row.targetId, key: row.targetKey },
      parentId: row.parentId,
      author: ref(row.authorId),
      body: deleted ? "" : row.body,
      mentions: deleted
        ? []
        : mentions
            .filter((mention) => mention.commentId === row.id)
            .map((mention) => ref(mention.userId)),
      resolvedAt: row.resolvedAt?.toISOString() ?? null,
      resolvedBy: row.resolvedById === null ? null : ref(row.resolvedById),
      editedAt: row.editedAt?.toISOString() ?? null,
      deleted,
      createdAt: row.createdAt.toISOString(),
    });
  }
  return views;
}

const oldestFirst = (a: CommentRow, b: CommentRow) =>
  a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id);

/** The threads of `rows`, oldest first, and how many are not resolved (C1). */
async function threadsOf(
  db: Executor,
  rows: readonly CommentRow[],
): Promise<CommentList> {
  const views = await commentViews(db, rows);
  const view = (row: CommentRow) => {
    const found = views.get(row.id);
    if (found === undefined) throw new Error(`No view of comment ${row.id}`);
    return found;
  };
  const threads = rows
    .filter((row) => row.parentId === null)
    .toSorted(oldestFirst)
    .map((root) => ({
      root,
      replies: rows
        .filter((row) => row.parentId === root.id)
        .toSorted(oldestFirst),
    }));
  return {
    threads: threads.map(({ root, replies }) => ({
      root: view(root),
      replies: replies.map(view),
    })),
    unresolvedCount: threads.filter(({ root }) => root.resolvedAt === null)
      .length,
  };
}

/** The comments on one item; a keyless target matches comments without a key. */
const onTarget = (target: Pick<TargetRef, "type" | "id" | "key">): SQL =>
  and(
    eq(comments.targetType, target.type as CommentRow["targetType"]),
    eq(comments.targetId, target.id),
    target.key == null
      ? isNull(comments.targetKey)
      : eq(comments.targetKey, target.key),
  ) as SQL;

/** The comments on one screen: its items in `sectionKeys` (all without them). */
const onScreen = (
  type: CommentRow["containerType"],
  id: string,
  sectionKeys: readonly string[] | undefined,
): SQL =>
  and(
    eq(comments.containerType, type),
    eq(comments.containerId, id),
    sectionKeys === undefined
      ? undefined
      : inArray(comments.sectionKey, [...sectionKeys]),
  ) as SQL;

/**
 * Whether the self-analysis `selfAnalysisId` is shared with `workspaceId` now. With
 * `lock`, the share is held until the transaction ends.
 */
async function isShared(
  db: Executor,
  selfAnalysisId: string,
  workspaceId: string,
  lock = false,
): Promise<boolean> {
  const query = db
    .select({ id: selfAnalysisShares.id })
    .from(selfAnalysisShares)
    .where(
      and(
        eq(selfAnalysisShares.selfAnalysisId, selfAnalysisId),
        eq(selfAnalysisShares.workspaceId, workspaceId),
      ),
    );
  // Held so S5 cannot end the share before the comment is in.
  const rows = lock ? await query.for("share") : await query;
  return rows.length > 0;
}

/**
 * Lets a member of the workspace a self-analysis is shared with at its comments
 * (SDD 7.1): Owners and Members, in a workspace it is shared with now.
 *
 * @throws {ApiError} FORBIDDEN for a Viewer, NOT_SHARED
 */
async function admitSharedComments(
  db: Executor,
  role: Role,
  selfAnalysisId: string,
  workspaceId: string,
): Promise<void> {
  if (role === "viewer") {
    throw new ApiError("FORBIDDEN", "Viewers cannot read self-analyses");
  }
  if (!(await isShared(db, selfAnalysisId, workspaceId))) {
    throw new ApiError(
      "NOT_SHARED",
      "The self-analysis is not shared with this workspace",
    );
  }
}

/**
 * Whom a comment on `target` may mention (W8): every member of the workspace, or on a
 * self-analysis the Owners and Members of the workspace it is shared with.
 */
async function mentionable(
  db: Executor,
  target: Pick<TargetRef, "type">,
  workspaceId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ userId: memberships.userId })
    .from(memberships)
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        target.type === "self_analysis_answer"
          ? inArray(memberships.role, ["owner", "member"])
          : undefined,
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

/**
 * The people `mentionUserIds` names, each once.
 *
 * @throws {ApiError} INVALID_MENTION for anyone W8 would not offer
 */
async function checkMentions(
  db: Executor,
  target: Pick<TargetRef, "type">,
  workspaceId: string,
  mentionUserIds: readonly string[],
): Promise<string[]> {
  const named = [...new Set(mentionUserIds.map((id) => id.toLowerCase()))];
  const allowed = await mentionable(db, target, workspaceId);
  if (named.some((id) => !allowed.has(id))) {
    throw new ApiError(
      "INVALID_MENTION",
      "Only someone the comment's readers include may be mentioned",
    );
  }
  return named;
}

/** The self-analysis a C1 query reads the comments of, or undefined. */
const selfAnalysisOf = (query: CommentListQuery) =>
  query.targetType === "self_analysis_answer"
    ? query.targetId
    : query.containerType === "self_analysis"
      ? query.containerId
      : undefined;

/**
 * Finds what C1 GET reads. Its owner reads a self-analysis's comments in every
 * workspace it is shared with, so there is no scope; anyone else reads them through the
 * workspace being viewed.
 */
const listLocator: ScopeLocator = async ({ query, caller, db }) => {
  const q = query as CommentListQuery;
  const selfAnalysisId = selfAnalysisOf(q);
  if (selfAnalysisId !== undefined) {
    const owner = await selfAnalysisOwner(db, selfAnalysisId);
    if (owner === null) throw notFound();
    return owner === caller.id ? null : { workspaceId: q.workspaceId };
  }
  if (q.targetType !== undefined && q.targetId !== undefined) {
    const place = await locateTarget(db, {
      type: q.targetType,
      id: q.targetId,
      key: q.targetKey,
    });
    if (place?.scope == null || place.deleted) throw notFound();
    return place.scope;
  }
  if (q.containerType === undefined || q.containerId === undefined) {
    throw new Error("The query schema requires an item or a screen");
  }
  if (q.containerType === "self_analysis") {
    throw new Error("Self-analyses are located above");
  }
  return containerScope(q.containerType, q.containerId);
};

/**
 * Finds the workspace a new comment goes to: its item's, or for a self-analysis the
 * workspace it is shared with that the body names.
 */
const createLocator: ScopeLocator = async ({ body, db }) => {
  const { target, workspaceId } = body as CommentCreate;
  if (target.type === "self_analysis_answer") {
    return (await selfAnalysisOwner(db, target.id)) === null
      ? null
      : { workspaceId };
  }
  const place = await locateTarget(db, target);
  return place?.scope == null || place.deleted ? null : place.scope;
};

/** The comment `id`, or undefined when there is none or `id` is no UUID. */
async function findComment(
  db: Executor,
  id: string,
): Promise<CommentRow | undefined> {
  if (!uuidSchema.safeParse(id).success) return undefined;
  const [row] = await db.select().from(comments).where(eq(comments.id, id));
  return row;
}

/**
 * Finds the scope of the comment in the path (C2, C3), or nothing when it cannot be
 * seen: its item is gone or hidden, or, unless `deletedToo`, it is deleted.
 */
const commentLocator =
  (deletedToo: boolean): ScopeLocator =>
  async ({ params, db }) => {
    const row = await findComment(db, params.commentId ?? "");
    if (row === undefined || (row.deletedAt !== null && !deletedToo)) {
      return null;
    }
    if ((await visibleComments(db, [row])).length === 0) return null;
    return scopeOfComment(row);
  };

/** What the comment routes need from the app. */
export interface CommentRoutesOptions {
  access: AccessPlugin;
  db: Database;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  404: errorBodySchema,
  422: errorBodySchema,
} as const;

/** C1–C3 (SDD 5.11): the comment panel PNL-1. */
export function commentRoutes({ access, db, now }: CommentRoutesOptions) {
  /** The stored comment of a C2 or C3, which its locator found. */
  const stored = async (id: string) => {
    const row = await findComment(db, id);
    if (row === undefined) throw notFound();
    return row;
  };

  /**
   * Runs `change` on the comment `current`, locked in a write of `scope` that sees it
   * still there; the comment as stored after. On a self-analysis, the caller's role and
   * the share are read again under the members lock and the share's row, so a demotion
   * or an ended share (W3, S5) goes first or waits for the change (SDD 7.1).
   *
   * @param refuseViewer Whether a Viewer is refused on a self-analysis, which they
   * cannot read: true for C3. C2 is its writer's whatever their role (SDD 7.1).
   */
  const changeComment = async (
    scope: Scope,
    current: CommentRow,
    callerId: string,
    refuseViewer: boolean,
    at: Date,
    change: (tx: DatabaseTransaction, row: CommentRow) => Promise<boolean>,
  ): Promise<CommentRow> => {
    const onSelfAnalysis = current.containerType === "self_analysis";
    const viewersOut = () =>
      new ApiError("FORBIDDEN", "Viewers cannot read self-analyses");
    if (onSelfAnalysis && refuseViewer && scope.role === "viewer") {
      throw viewersOut();
    }
    return writeInScope(
      db,
      scope,
      at,
      async (tx) => {
        const [row] = await tx
          .select()
          .from(comments)
          .where(eq(comments.id, current.id))
          .for("update");
        if (row === undefined) throw notFound();
        if (onSelfAnalysis) {
          const [member] = await tx
            .select({ role: memberships.role })
            .from(memberships)
            .where(
              and(
                eq(memberships.workspaceId, row.workspaceId),
                eq(memberships.userId, callerId),
              ),
            );
          if (member === undefined) {
            throw new ApiError("NO_ACCESS", "Not a member of this workspace");
          }
          if (refuseViewer && member.role === "viewer") throw viewersOut();
          if (!(await isShared(tx, row.containerId, row.workspaceId, true))) {
            throw notFound();
          }
        }
        // Its item may have been deleted or hidden since the request was let in.
        if ((await visibleComments(tx, [row])).length === 0) throw notFound();
        if (await change(tx, row)) recordChange(tx);
        const [after] = await tx
          .select()
          .from(comments)
          .where(eq(comments.id, current.id));
        if (after === undefined) throw notFound();
        return after;
      },
      onSelfAnalysis
        ? (tx) => lockMembers(tx, current.workspaceId, "shared")
        : undefined,
    );
  };

  const viewOf = async (row: CommentRow) => {
    const view = (await commentViews(db, [row])).get(row.id);
    if (view === undefined) throw new Error(`No view of comment ${row.id}`);
    return view;
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/comments",
      async ({ scope, query }) => {
        const selfAnalysisId = selfAnalysisOf(query);
        if (selfAnalysisId !== undefined) {
          if (scope !== null) {
            await admitSharedComments(
              db,
              scope.role,
              selfAnalysisId,
              query.workspaceId,
            );
          }
        } else if (scope === null || scope.workspaceId !== query.workspaceId) {
          throw notFound();
        }
        let where: SQL;
        if (query.targetType !== undefined && query.targetId !== undefined) {
          const target = {
            type: query.targetType,
            id: query.targetId,
            key: query.targetKey ?? null,
          };
          await checkCommentKey(db, target, "targetKey");
          where = onTarget(target);
        } else {
          const type = query.containerType as CommentRow["containerType"];
          const id = query.containerId as string;
          where = onScreen(type, id, query.sectionKeys);
          // A screen inside an idea also lists the comments on the idea (design-spec 6.0.1).
          if (
            (type === "validation" || type === "business_plan") &&
            scope?.ideaId != null
          ) {
            where = or(where, onScreen("idea", scope.ideaId, undefined)) as SQL;
          }
        }
        const rows = await db
          .select()
          .from(comments)
          .where(
            and(
              where,
              // The owner reads every share; visibleComments keeps the current ones.
              selfAnalysisId !== undefined && scope !== null
                ? eq(comments.workspaceId, query.workspaceId)
                : undefined,
            ),
          );
        return threadsOf(db, await visibleComments(db, rows));
      },
      {
        located: { to: listLocator, need: "read" },
        query: commentListQuerySchema,
        response: { 200: commentListSchema, ...errors },
        detail: {
          summary: "C1 The comments on an item or a screen (PNL-1)",
          description:
            "One item (targetType, targetId, targetKey), or one screen (containerType, containerId, sectionKeys) with, inside an idea, the comments on the idea. Threads oldest first, deleted comments as deleted without their body. Comments on deleted rows and on questions a migration hid are not returned. A self-analysis's owner reads the comments of every workspace it is shared with now; its Owners and Members read those of workspaceId (Viewers 403 FORBIDDEN, 403 NOT_SHARED).",
        },
      },
    )
    .post(
      "/api/v1/comments",
      async ({ caller, scope, body, set }) => {
        const { target, workspaceId } = body;
        const onSelfAnalysis = target.type === "self_analysis_answer";
        if (onSelfAnalysis) {
          await admitSharedComments(db, scope.role, target.id, workspaceId);
        } else if (scope.workspaceId !== workspaceId) {
          throw notFound();
        }
        const ref = {
          type: target.type,
          id: target.id,
          key: target.key ?? null,
        };
        await checkCommentKey(db, ref, "target.key");
        const at = new Date(now());
        const created = await writeInScope(
          db,
          scope,
          at,
          async (tx) => {
            const place = await locateTarget(tx, ref);
            if (place === null || place.deleted) throw notFound();
            if (onSelfAnalysis) {
              // Under the members lock: a demotion or an ended share went first or waits.
              const [member] = await tx
                .select({ role: memberships.role })
                .from(memberships)
                .where(
                  and(
                    eq(memberships.workspaceId, workspaceId),
                    eq(memberships.userId, caller.id),
                  ),
                );
              if (member === undefined) {
                throw new ApiError(
                  "NO_ACCESS",
                  "Not a member of this workspace",
                );
              }
              if (member.role === "viewer") {
                throw new ApiError(
                  "FORBIDDEN",
                  "Viewers cannot read self-analyses",
                );
              }
              if (!(await isShared(tx, target.id, workspaceId, true))) {
                throw new ApiError(
                  "NOT_SHARED",
                  "The self-analysis is not shared with this workspace",
                );
              }
            }
            if (body.parentId !== undefined) {
              const [parent] = await tx
                .select()
                .from(comments)
                .where(and(eq(comments.id, body.parentId), onTarget(ref)));
              if (parent === undefined || parent.workspaceId !== workspaceId) {
                throw invalid(
                  "parentId",
                  "invalid_value",
                  "Not a comment on this item",
                );
              }
              if (parent.parentId !== null) {
                throw new ApiError(
                  "REPLY_DEPTH",
                  "Replies go to the first comment of a thread",
                );
              }
            }
            const mentioned = await checkMentions(
              tx,
              ref,
              workspaceId,
              body.mentionUserIds,
            );
            const [row] = await tx
              .insert(comments)
              .values({
                workspaceId,
                containerType: place.container.type,
                containerId: place.container.id,
                sectionKey: historySectionKey(ref),
                targetType: ref.type,
                targetId: ref.id,
                targetKey: ref.key,
                parentId: body.parentId ?? null,
                authorId: caller.id,
                body: body.body,
                createdAt: at,
                updatedAt: at,
              })
              .returning();
            if (row === undefined) throw new Error("comment insert failed");
            if (mentioned.length > 0) {
              await tx.insert(commentMentions).values(
                mentioned.map((userId) => ({
                  commentId: row.id,
                  userId,
                  createdAt: at,
                })),
              );
            }
            recordChange(tx);
            await notifyComment(tx, row, { mentioned, followers: true }, at);
            return row;
          },
          onSelfAnalysis
            ? (tx) => lockMembers(tx, workspaceId, "shared")
            : undefined,
        );
        set.status = 201;
        return viewOf(created);
      },
      {
        scoped: { to: createLocator, need: "comment" },
        body: commentCreateSchema,
        parse: "json",
        response: {
          201: commentSchema,
          ...errors,
          409: errorBodySchema,
        },
        detail: {
          summary: "C1 Comment on an item (PNL-1)",
          description:
            "A new thread, or a reply to the first comment of one (422 REPLY_DEPTH). Everyone in the workspace may comment, Viewers too; on a self-analysis only Owners and Members of a workspace it is shared with (403 FORBIDDEN, 403 NOT_SHARED). Mentions are people W8 offers (422 INVALID_MENTION). Notifies the mentioned, the idea's proposer, the plan's maker, the self-analysis's owner and the thread's writers once each. 409 ARCHIVED on archived content.",
        },
      },
    )
    .patch(
      "/api/v1/comments/:commentId",
      async ({ caller, scope, params, body }) => {
        const current = await stored(params.commentId);
        if (current.authorId !== caller.id) {
          throw new ApiError("FORBIDDEN", "Only its writer edits a comment");
        }
        const at = new Date(now());
        const row = await changeComment(
          scope,
          current,
          caller.id,
          false,
          at,
          async (tx, row) => {
            if (row.deletedAt !== null) throw notFound();
            const target = {
              type: row.targetType,
              id: row.targetId,
              key: row.targetKey,
            };
            const mentioned = await checkMentions(
              tx,
              target,
              row.workspaceId,
              body.mentionUserIds,
            );
            const before = (
              await tx
                .select({ userId: commentMentions.userId })
                .from(commentMentions)
                .where(eq(commentMentions.commentId, row.id))
            ).map((mention) => mention.userId);
            const added = mentioned.filter((id) => !before.includes(id));
            const removed = before.filter((id) => !mentioned.includes(id));
            if (body.body === row.body && added.length + removed.length === 0) {
              return false;
            }
            await tx
              .update(comments)
              .set({ body: body.body, editedAt: at, updatedAt: at })
              .where(eq(comments.id, row.id));
            if (removed.length > 0) {
              await tx
                .delete(commentMentions)
                .where(
                  and(
                    eq(commentMentions.commentId, row.id),
                    inArray(commentMentions.userId, removed),
                  ),
                );
            }
            if (added.length > 0) {
              await tx.insert(commentMentions).values(
                added.map((userId) => ({
                  commentId: row.id,
                  userId,
                  createdAt: at,
                })),
              );
            }
            await notifyComment(
              tx,
              row,
              { mentioned: added, followers: false },
              at,
            );
            return true;
          },
        );
        return viewOf(row);
      },
      {
        scoped: { to: commentLocator(false), need: "comment" },
        params: commentIdParamsSchema,
        body: commentUpdateSchema,
        parse: "json",
        response: { 200: commentSchema, ...errors, 409: errorBodySchema },
        detail: {
          summary: "C2 Edit a comment (PNL-1)",
          description:
            "Its writer only (403 FORBIDDEN). Replaces the body and the mentions; only the newly mentioned are notified. 409 ARCHIVED on archived content.",
        },
      },
    )
    .delete(
      "/api/v1/comments/:commentId",
      async ({ caller, scope, params, set }) => {
        const current = await stored(params.commentId);
        if (current.authorId !== caller.id) {
          throw new ApiError("FORBIDDEN", "Only its writer deletes a comment");
        }
        const at = new Date(now());
        await changeComment(
          scope,
          current,
          caller.id,
          false,
          at,
          async (tx, row) => {
            if (row.deletedAt !== null) return false;
            // The comment stays as "deleted" in its thread; what it said goes.
            await tx
              .update(comments)
              .set({ body: "", deletedAt: at, updatedAt: at })
              .where(eq(comments.id, row.id));
            await tx
              .delete(commentMentions)
              .where(eq(commentMentions.commentId, row.id));
            return true;
          },
        );
        set.status = 204;
      },
      {
        scoped: { to: commentLocator(true), need: "comment" },
        params: commentIdParamsSchema,
        response: { 204: noContent, ...errors, 409: errorBodySchema },
        detail: {
          summary: "C2 Delete a comment (PNL-1)",
          description:
            "Its writer only (403 FORBIDDEN). The comment stays in its thread as deleted, without its body; deleting it again changes nothing. 409 ARCHIVED on archived content.",
        },
      },
    )
    .post(
      "/api/v1/comments/:commentId/resolve",
      async ({ caller, scope, params }) =>
        resolve(scope, params.commentId, caller.id, true),
      {
        scoped: { to: commentLocator(true), need: "comment" },
        params: commentIdParamsSchema,
        response: { 200: commentSchema, ...errors, 409: errorBodySchema },
        detail: {
          summary: "C3 Resolve a thread (PNL-1)",
          description:
            "On the first comment of the thread (422 VALIDATION_FAILED on a reply). Anyone who may comment on the item; Viewers not on a self-analysis. 409 ARCHIVED on archived content.",
        },
      },
    )
    .delete(
      "/api/v1/comments/:commentId/resolve",
      async ({ caller, scope, params }) =>
        resolve(scope, params.commentId, caller.id, false),
      {
        scoped: { to: commentLocator(true), need: "comment" },
        params: commentIdParamsSchema,
        response: { 200: commentSchema, ...errors, 409: errorBodySchema },
        detail: {
          summary: "C3 Reopen a thread (PNL-1)",
          description:
            "On the first comment of the thread (422 VALIDATION_FAILED on a reply). Anyone who may comment on the item; Viewers not on a self-analysis. 409 ARCHIVED on archived content.",
        },
      },
    );

  /** C3: resolves the thread for the caller, or reopens it. */
  async function resolve(
    scope: Scope,
    id: string,
    callerId: string,
    resolving: boolean,
  ) {
    const current = await stored(id);
    if (current.parentId !== null) {
      throw invalid(
        "commentId",
        "invalid_value",
        "Only the first comment of a thread resolves it",
      );
    }
    const at = new Date(now());
    const row = await changeComment(
      scope,
      current,
      callerId,
      true,
      at,
      async (tx, row) => {
        if ((row.resolvedAt !== null) === resolving) return false;
        await tx
          .update(comments)
          .set({
            resolvedAt: resolving ? at : null,
            resolvedById: resolving ? callerId : null,
            updatedAt: at,
          })
          .where(eq(comments.id, row.id));
        return true;
      },
    );
    return viewOf(row);
  }
}
