import { z } from "zod";
import { commentTargetTypeSchema } from "./collaboration";
import {
  dateTimeSchema,
  roleSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import {
  currencySchema,
  emailSchema,
  requiredText,
  TEXT_LIMITS,
  workspaceNameSchema,
} from "./input-rules";

// The workspace, member and invitation types of SDD 5.5.

/** W0, W1. */
export const workspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  currency: z.string(),
  isPersonal: z.boolean(),
  myRole: roleSchema,
  memberCount: z.int().nonnegative(),
});
export type Workspace = z.infer<typeof workspaceSchema>;

/** The body of W0 `POST /api/v1/workspaces`. */
export const workspaceCreateSchema = z.object({
  name: workspaceNameSchema,
  /** ISO 4217. PHP when left out. */
  currency: currencySchema.optional(),
});
export type WorkspaceCreate = z.infer<typeof workspaceCreateSchema>;

/** The body of W1 `PATCH /api/v1/workspaces/{workspaceId}`: only the fields sent change. */
export const workspaceUpdateSchema = z.object({
  name: workspaceNameSchema.optional(),
  /** Amounts are not converted (design-spec 6.16 9). */
  currency: currencySchema.optional(),
});
export type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;

/** W2, W3 PATCH. */
export const memberSchema = z.object({
  user: userRefSchema,
  /** Only an Owner gets the addresses; null for everyone else. */
  email: z.string().nullable(),
  role: roleSchema,
  joinedAt: dateTimeSchema,
  /**
   * The owner of this personal workspace, whom no Owner may demote or remove (W3,
   * design-spec 6.16 9).
   */
  isPersonalOwner: z.boolean(),
});
export type Member = z.infer<typeof memberSchema>;

/** W2 `GET /api/v1/workspaces/{workspaceId}/members`. */
export const memberListSchema = z.object({ items: z.array(memberSchema) });

/** The path of W3 PATCH, which takes a UUID only. */
export const memberParamsSchema = z.object({
  workspaceId: z.string(),
  userId: uuidSchema,
});

/** The path of W3 DELETE: a UUID, or `me` to leave. */
export const memberRemovalParamsSchema = z.object({
  workspaceId: z.string(),
  userId: z.union([z.literal("me"), uuidSchema]),
});

/** The body of W3 PATCH. */
export const memberRoleUpdateSchema = z.object({ role: roleSchema });

export const invitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "revoked",
  "expired",
]);
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;

/** An invitation as W4, W5, AD7 and AD9 show it. Never carries the link or token (SDD 5.5). */
export const invitationSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  /** Null for an invitation that names no workspace. */
  role: roleSchema.nullable(),
  workspace: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  /** `expired` is a pending invitation past `expiresAt`. */
  status: invitationStatusSchema,
  /** Null for an invitation from `make admin-create`. */
  invitedBy: userRefSchema.nullable(),
  createdAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  acceptedAt: dateTimeSchema.nullable(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** The query of W4 GET: `pending` (the default) lists the invitations one can still accept. */
export const invitationListQuerySchema = z.object({
  status: z.enum(["pending", "all"]).default("pending"),
});

/** W4 GET `/api/v1/workspaces/{workspaceId}/invitations`. */
export const invitationListSchema = z.object({
  items: z.array(invitationSchema),
});

/** The body of W4 POST. */
export const invitationCreateSchema = z.object({
  email: emailSchema,
  role: roleSchema,
});
export type InvitationCreate = z.infer<typeof invitationCreateSchema>;

/** What W4 POST and W5 answer with. */
export const invitationResultSchema = z.object({
  invitation: invitationSchema,
});

/** The `{invitationId}` of W5 and W7. */
export const invitationIdParamsSchema = z.object({ invitationId: z.string() });

/**
 * The query of W8 `GET /api/v1/workspaces/{workspaceId}/mention-candidates`: the item a
 * comment is being written on, as a TargetRef of a type C1 takes comments on.
 * `targetKey` names the question of a self-analysis answer, which needs it.
 */
export const mentionCandidatesQuerySchema = z.object({
  targetType: commentTargetTypeSchema,
  targetId: uuidSchema,
  targetKey: requiredText(TEXT_LIMITS.short).optional(),
});

/** W8. */
export const mentionCandidatesSchema = z.object({
  items: z.array(userRefSchema),
});
