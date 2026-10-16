import { z } from "zod";
import {
  dateTimeSchema,
  historySourceSchema,
  linkTargetSchema,
  pageQuerySchema,
  pageSchema,
  queryListSchema,
  targetRefSchema,
  targetTypeSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import { namedRefSchema } from "./decisions";
import { commentBodySchema, requiredText, TEXT_LIMITS } from "./input-rules";

// Comments, change history and notifications of SDD 5.11 (C1–C3, H1–H3, N1–N3).

/** The screens history and comments are listed under (SDD 6.3「画面と節の対応」). */
export const historyContainerTypeSchema = z.enum([
  "self_analysis",
  "validation",
  "business_plan",
  "idea",
]);
export type HistoryContainerType = z.infer<typeof historyContainerTypeSchema>;

/** What a comment can be on: every item but a plan's header and a template version. */
export const commentTargetTypeSchema = targetTypeSchema.exclude([
  "business_plan",
  "template_version",
]);
export type CommentTargetType = z.infer<typeof commentTargetTypeSchema>;

/** A question ID, a number's field or `{variant}.{slide}` in a query or a body. */
const targetKeySchema = requiredText(TEXT_LIMITS.short);

/**
 * Checks that a query names either one item (`targetType`, `targetId`, `targetKey`) or
 * one screen (`containerType`, `containerId`, `sectionKeys`), and not both.
 */
const oneItemOrScreen = (
  query: {
    targetType?: unknown;
    targetId?: unknown;
    targetKey?: unknown;
    containerType?: unknown;
    containerId?: unknown;
    sectionKeys?: unknown;
  },
  ctx: z.RefinementCtx,
) => {
  const item =
    query.targetType !== undefined ||
    query.targetId !== undefined ||
    query.targetKey !== undefined;
  const screen =
    query.containerType !== undefined ||
    query.containerId !== undefined ||
    query.sectionKeys !== undefined;
  const missing = (path: string) =>
    ctx.addIssue({
      code: "invalid_type",
      expected: "string",
      input: undefined,
      path: [path],
      message: "Required",
    });
  if (item && screen) {
    ctx.addIssue({
      code: "custom",
      input: undefined,
      path: [query.targetType === undefined ? "targetId" : "targetType"],
      message: "Name one item or one screen, not both",
    });
    return;
  }
  if (screen) {
    if (query.containerType === undefined) missing("containerType");
    if (query.containerId === undefined) missing("containerId");
    return;
  }
  if (query.targetType === undefined) missing("targetType");
  if (query.targetId === undefined) missing("targetId");
};

// ---- Comments (C1–C3) ----

export const commentSchema = z.object({
  id: uuidSchema,
  /** For a self-analysis, the workspace it is shared with that the comment belongs to. */
  workspace: namedRefSchema,
  target: targetRefSchema,
  parentId: uuidSchema.nullable(),
  author: userRefSchema,
  /** Empty when deleted. */
  body: z.string(),
  /** Empty when deleted. */
  mentions: z.array(userRefSchema),
  resolvedAt: dateTimeSchema.nullable(),
  resolvedBy: userRefSchema.nullable(),
  editedAt: dateTimeSchema.nullable(),
  /** Shown as "deleted" in its thread (design-spec 6.0.4). */
  deleted: z.boolean(),
  createdAt: dateTimeSchema,
});
export type Comment = z.infer<typeof commentSchema>;

export const commentThreadSchema = z.object({
  root: commentSchema,
  /** Oldest first. */
  replies: z.array(commentSchema),
});
export type CommentThread = z.infer<typeof commentThreadSchema>;

/** C1 GET. */
export const commentListSchema = z.object({
  /** By when the thread started, oldest first. */
  threads: z.array(commentThreadSchema),
  /** The threads not resolved: the count on the header's 💬 (design-spec 6.0.1). */
  unresolvedCount: z.int().nonnegative(),
});
export type CommentList = z.infer<typeof commentListSchema>;

/**
 * The query of C1 GET: one item, or one screen (its comments and, on a screen inside an
 * idea, the comments on the idea). `workspaceId` is the workspace being viewed: for a
 * shared self-analysis it chooses whose comments are read.
 */
export const commentListQuerySchema = z
  .object({
    workspaceId: uuidSchema,
    targetType: commentTargetTypeSchema.optional(),
    targetId: uuidSchema.optional(),
    targetKey: targetKeySchema.optional(),
    containerType: historyContainerTypeSchema.optional(),
    containerId: uuidSchema.optional(),
    sectionKeys: queryListSchema.pipe(z.array(targetKeySchema)).optional(),
  })
  .superRefine(oneItemOrScreen);
export type CommentListQuery = z.infer<typeof commentListQuerySchema>;

/** The body of C1 POST. */
export const commentCreateSchema = z.object({
  workspaceId: uuidSchema,
  target: z.object({
    type: commentTargetTypeSchema,
    id: uuidSchema,
    key: targetKeySchema.nullable().optional(),
  }),
  /** The first comment of the thread this replies to. */
  parentId: uuidSchema.optional(),
  body: commentBodySchema,
  /** The people `@name` in the body names, from W8. */
  mentionUserIds: z.array(uuidSchema),
});
export type CommentCreate = z.infer<typeof commentCreateSchema>;

/** The body of C2 PATCH: the whole new body and everyone it mentions. */
export const commentUpdateSchema = z.object({
  body: commentBodySchema,
  mentionUserIds: z.array(uuidSchema),
});
export type CommentUpdate = z.infer<typeof commentUpdateSchema>;

/** The `{commentId}` of C2 and C3. */
export const commentIdParamsSchema = z.object({ commentId: z.string() });

// ---- Change history (H1–H3) ----

export const historyActionSchema = z.enum([
  "create",
  "update",
  "delete",
  "restore",
]);
export type HistoryAction = z.infer<typeof historyActionSchema>;

export const historyEntrySchema = z.object({
  id: uuidSchema,
  batchId: uuidSchema.nullable(),
  target: targetRefSchema,
  /** "01 WHO", "Costs · Rent", the idea's or plan's name (SDD 5.11). */
  label: z.string(),
  action: historyActionSchema,
  source: historySourceSchema,
  /** The item's content as packages/db history-values.ts keeps it; null when absent. */
  before: z.unknown(),
  after: z.unknown(),
  changedBy: userRefSchema,
  changedAt: dateTimeSchema,
  /** Whether the caller can revert this row (H2), or its operation (H3). */
  revertible: z.boolean(),
});
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

/** H1 GET. */
export const historyPageSchema = pageSchema(historyEntrySchema);

/** The query of H1: one item's history, or one screen's (`sectionKeys` narrow it). */
export const historyQuerySchema = pageQuerySchema
  .extend({
    targetType: targetTypeSchema.optional(),
    targetId: uuidSchema.optional(),
    targetKey: targetKeySchema.optional(),
    containerType: historyContainerTypeSchema.optional(),
    containerId: uuidSchema.optional(),
    sectionKeys: queryListSchema.pipe(z.array(targetKeySchema)).optional(),
  })
  .superRefine(oneItemOrScreen);
export type HistoryQuery = z.infer<typeof historyQuerySchema>;

/** The `{entryId}` of H2. */
export const historyEntryParamsSchema = z.object({ entryId: z.string() });
/** The `{batchId}` of H3. */
export const historyBatchParamsSchema = z.object({ batchId: z.string() });

/** The item H2 reverted, as it is stored now. */
export const revertedItemSchema = z.object({
  /** Its content as the history keeps it; null for a row deleted. */
  value: z.unknown(),
  deleted: z.boolean(),
  lockVersion: z.int().nonnegative(),
  updatedAt: dateTimeSchema.nullable(),
  updatedBy: userRefSchema.nullable(),
});
export type RevertedItem = z.infer<typeof revertedItemSchema>;

/** H2. `entry` is null when the item already was as the row left it: nothing changed. */
export const historyRevertResultSchema = z.object({
  entry: historyEntrySchema.nullable(),
  target: revertedItemSchema,
});
export type HistoryRevertResult = z.infer<typeof historyRevertResultSchema>;

/**
 * H3. Reverting an operation: the items it changed back (`reverted`), and the batch of
 * the revert, which H3 can revert in turn. Undoing a creation: the rows of the operation
 * undone, and its batch.
 */
export const historyBatchRevertResultSchema = z.object({
  reverted: z.int().nonnegative(),
  batchId: uuidSchema,
});
export type HistoryBatchRevertResult = z.infer<
  typeof historyBatchRevertResultSchema
>;

// ---- Notifications (N1–N3) ----

export const notificationKindSchema = z.enum([
  "mention",
  "comment",
  "decision",
]);
export type NotificationKind = z.infer<typeof notificationKindSchema>;

export const notificationSchema = z.object({
  id: uuidSchema,
  kind: notificationKindSchema,
  workspace: namedRefSchema,
  actor: userRefSchema.nullable(),
  /** Who did what, and where, in English (design-spec 6.15). */
  title: z.string(),
  /** The start of the comment or of the reason; null for a saved version. */
  excerpt: z.string().nullable(),
  link: linkTargetSchema,
  /** False once the recipient left the workspace or can no longer read the item. */
  accessible: z.boolean(),
  readAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});
export type Notification = z.infer<typeof notificationSchema>;

/** The query of N1. */
export const notificationQuerySchema = pageQuerySchema.extend({
  filter: z.enum(["all", "unread"]).default("all"),
});

/** N1. */
export const notificationPageSchema = pageSchema(notificationSchema);

/** N2. */
export const unreadCountSchema = z.object({ total: z.int().nonnegative() });

/** The `{id}` of N3. */
export const notificationIdParamsSchema = z.object({ id: z.string() });
