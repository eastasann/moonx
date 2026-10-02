import { schema } from "@moonx/db";
import {
  createCommentBodySchema,
  listCommentsQuerySchema,
  updateCommentBodySchema,
} from "@moonx/schemas";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError, validationFailed } from "../errors";
import {
  authorizeTarget,
  type LocatedTarget,
  locateTarget,
  requireCommentable,
  targetScopeRef,
} from "../lib/comment-target";
import {
  type CommentRow,
  createComment,
  deleteComment,
  editComment,
  setThreadResolved,
  toComments,
  toThreads,
} from "../lib/comments";
import type { Scope } from "../lib/scope";

const commentParams = z.object({ commentId: z.uuid() });

type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

const queryTarget = (query: ListCommentsQuery) => ({
  type: query.targetType,
  id: query.targetId,
  key: query.targetKey ?? null,
});

/** C1-C3 (SDD 5.11, 7.1). */
export function commentRoutes(ctx: AppContext) {
  const { db } = ctx;

  async function loadRow(commentId: string): Promise<CommentRow> {
    const [row] = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId));
    if (!row) throw new ApiError("NOT_FOUND", "Comment not found");
    return row;
  }

  const locateRow = (row: CommentRow) =>
    locateTarget(db, { type: row.targetType, id: row.targetId, key: row.targetKey });

  /** The scope of a stored comment's target for a change by the caller (404 when hidden). */
  const rowScope = async ({ params, user }: AccessInput) => {
    const row = await loadRow(params.commentId);
    return targetScopeRef(await locateRow(row), user, {
      workspaceId: row.workspaceId,
      write: true,
    });
  };

  /** The target of a stored comment, authorized for a change by the caller (404 when hidden). */
  async function accessOf(row: CommentRow, scope: Scope | null) {
    return authorizeTarget(db, await locateRow(row), scope, {
      workspaceId: row.workspaceId,
      existing: true,
    });
  }

  async function one(commentId: string) {
    const [comment] = await toComments(db, [await loadRow(commentId)]);
    return comment;
  }

  async function resolveThread(
    commentId: string,
    user: { id: string },
    scope: Scope | null,
    resolved: boolean,
  ) {
    const row = await loadRow(commentId);
    const access = await accessOf(row, scope);
    if (row.parentId) {
      throw validationFailed([
        { path: "commentId", code: "invalid_value", message: "Only the first comment of a thread" },
      ]);
    }
    requireCommentable(access, true);
    await setThreadResolved(db, {
      access,
      userId: user.id,
      now: ctx.now(),
      comment: row,
      resolved,
    });
    return one(row.id);
  }

  const commentRow = { to: rowScope, need: "member" } as const;

  return new Elysia({ name: "moonx-comments" })
    .use(accessPlugin(ctx))
    .get(
      "/comments",
      async ({ query, scope }) => {
        const located = await locateTarget(db, queryTarget(query as ListCommentsQuery));
        const access = await authorizeTarget(db, located, scope, {
          workspaceId: query.workspaceId,
        });
        // Comments of a deleted row or of a question the pinned template no longer has stay
        // stored but are not shown (design-spec 6.0.4, 6.0.7).
        if (located.state !== "ok" || access.workspaceIds.length === 0) return { threads: [] };
        const rows = await db
          .select()
          .from(schema.comments)
          .where(
            and(
              eq(schema.comments.targetType, located.ref.type),
              eq(schema.comments.targetId, located.ref.id),
              located.ref.key === null
                ? isNull(schema.comments.targetKey)
                : eq(schema.comments.targetKey, located.ref.key),
              inArray(schema.comments.workspaceId, access.workspaceIds),
            ),
          )
          .orderBy(asc(schema.comments.createdAt), asc(schema.comments.id));
        return { threads: await toThreads(db, rows) };
      },
      {
        query: listCommentsQuerySchema,
        located: {
          to: async ({ query, user }: AccessInput) =>
            targetScopeRef(await locateTarget(db, queryTarget(query as ListCommentsQuery)), user, {
              workspaceId: query.workspaceId,
              write: false,
            }),
          need: "member",
        },
      },
    )
    .post(
      "/comments",
      async ({ body, user, scope, set }) => {
        const located: LocatedTarget = await locateTarget(db, body.target);
        const access = await authorizeTarget(db, located, scope, { workspaceId: body.workspaceId });
        requireCommentable(access, false);
        const id = await createComment(db, {
          access,
          userId: user.id,
          now: ctx.now(),
          body: body.body,
          parentId: body.parentId ?? null,
          mentionUserIds: body.mentionUserIds,
        });
        set.status = 201;
        return one(id);
      },
      {
        body: createCommentBodySchema,
        located: {
          to: async ({ body, user }: AccessInput) =>
            targetScopeRef(await locateTarget(db, body.target), user, {
              workspaceId: body.workspaceId,
              write: true,
            }),
          need: "member",
        },
      },
    )
    .patch(
      "/comments/:commentId",
      async ({ params, body, user, scope }) => {
        const row = await loadRow(params.commentId);
        const access = await accessOf(row, scope);
        if (row.authorId !== user.id) {
          throw new ApiError("FORBIDDEN", "Only the author can change a comment");
        }
        requireCommentable(access, true);
        if (row.deletedAt) throw new ApiError("NOT_FOUND", "Comment not found");
        await editComment(db, {
          access,
          userId: user.id,
          now: ctx.now(),
          comment: row,
          body: body.body,
          mentionUserIds: body.mentionUserIds,
        });
        return one(row.id);
      },
      { params: commentParams, body: updateCommentBodySchema, located: commentRow },
    )
    .delete(
      "/comments/:commentId",
      async ({ params, user, scope, set }) => {
        const row = await loadRow(params.commentId);
        const access = await accessOf(row, scope);
        if (row.authorId !== user.id) {
          throw new ApiError("FORBIDDEN", "Only the author can delete a comment");
        }
        requireCommentable(access, true);
        await deleteComment(db, { access, userId: user.id, now: ctx.now(), comment: row });
        set.status = 204;
      },
      { params: commentParams, located: commentRow },
    )
    .post(
      "/comments/:commentId/resolve",
      async ({ params, user, scope }) => resolveThread(params.commentId, user, scope, true),
      { params: commentParams, located: commentRow },
    )
    .delete(
      "/comments/:commentId/resolve",
      async ({ params, user, scope }) => resolveThread(params.commentId, user, scope, false),
      { params: commentParams, located: commentRow },
    );
}
