import { z } from "zod";
import {
  dateTimeSchema,
  linkTargetSchema,
  pageQuerySchema,
  targetRefSchema,
  userRefSchema,
} from "./common";
import type { targetTypeSchema } from "./enums";

/** The targets a comment can be written on: `comment_target_type` of the DB (SDD 5.1 TargetRef). */
export const COMMENT_TARGET_TYPES = [
  "self_analysis_answer",
  "validation_answer",
  "research_log_entry",
  "competitor",
  "assumption",
  "risk",
  "cost_item",
  "economics_input",
  "plan_answer",
  "execution_item",
  "pitch_slide",
  "idea",
] as const satisfies readonly z.infer<typeof targetTypeSchema>[];

export const commentTargetTypeSchema = z.enum(COMMENT_TARGET_TYPES);

export const commentTargetRefSchema = z.object({
  type: commentTargetTypeSchema,
  id: z.uuid(),
  key: z.string().min(1).max(200).nullish(),
});

const dateOrDateTime = z.union([z.iso.datetime(), z.iso.date()]);

/** L1 query. A date without a time is a day in the caller's time zone. */
export const listDecisionLogQuerySchema = pageQuerySchema.extend({
  kind: z.enum(["validation_decision", "go_no_go", "version_saved"]).optional(),
  ideaId: z.uuid().optional(),
  planId: z.uuid().optional(),
  recordedBy: z.uuid().optional(),
  from: dateOrDateTime.optional(),
  to: dateOrDateTime.optional(),
});

/** C1 GET query. `workspaceId` picks the share of a self-analysis target for a reader. */
export const listCommentsQuerySchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: z.uuid(),
  targetKey: z.string().min(1).max(200).optional(),
  workspaceId: z.uuid().optional(),
});

const bodySchema = z.string().trim().min(1).max(5000);
const mentionIdsSchema = z.array(z.uuid()).max(50).default([]);

/** C1 POST body. */
export const createCommentBodySchema = z.object({
  workspaceId: z.uuid(),
  target: commentTargetRefSchema,
  parentId: z.uuid().optional(),
  body: bodySchema,
  mentionUserIds: mentionIdsSchema,
});

/** C2 PATCH body. */
export const updateCommentBodySchema = z.object({
  body: bodySchema,
  mentionUserIds: mentionIdsSchema,
});

/** N1 query. */
export const listNotificationsQuerySchema = pageQuerySchema.extend({
  filter: z.enum(["all", "unread"]).default("all"),
});

export const commentSchema = z.object({
  id: z.uuid(),
  workspace: z.object({ id: z.uuid(), name: z.string() }),
  target: targetRefSchema,
  parentId: z.uuid().nullable(),
  author: userRefSchema,
  body: z.string(),
  mentions: z.array(userRefSchema),
  resolvedAt: dateTimeSchema.nullable(),
  resolvedBy: userRefSchema.nullable(),
  editedAt: dateTimeSchema.nullable(),
  deleted: z.boolean(),
  createdAt: dateTimeSchema,
});

export const commentThreadSchema = z.object({
  root: commentSchema,
  replies: z.array(commentSchema),
});

export const notificationSchema = z.object({
  id: z.uuid(),
  kind: z.enum(["mention", "comment", "decision"]),
  workspace: z.object({ id: z.uuid(), name: z.string() }),
  actor: userRefSchema.nullable(),
  title: z.string(),
  excerpt: z.string().nullable(),
  link: linkTargetSchema,
  accessible: z.boolean(),
  readAt: dateTimeSchema.nullable(),
  createdAt: dateTimeSchema,
});

export type CommentTargetRef = z.infer<typeof commentTargetRefSchema>;
export type Comment = z.infer<typeof commentSchema>;
export type CommentThread = z.infer<typeof commentThreadSchema>;
export type Notification = z.infer<typeof notificationSchema>;
