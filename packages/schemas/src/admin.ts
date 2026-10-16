import { z } from "zod";
import {
  dateTimeSchema,
  pageQuerySchema,
  pageSchema,
  roleSchema,
  userRefSchema,
  uuidSchema,
} from "./common";
import { emailSchema, plainText, TEXT_LIMITS } from "./input-rules";
import { invitationSchema } from "./workspaces";

// The users, workspaces and invitations of 28 (SDD 5.13 AD7–AD9). Operators see how
// much each is used, never what is inside (design-spec 6.17).

export const adminUserStatusSchema = z.enum(["active", "suspended", "deleted"]);
export type AdminUserStatus = z.infer<typeof adminUserStatusSchema>;

/** A user as 28 lists them. A deleted one is "Deleted user" and takes no action. */
export const adminUserSchema = z.object({
  id: uuidSchema,
  displayName: z.string(),
  email: z.string(),
  createdAt: dateTimeSchema,
  /** Moves at most every 5 minutes (SDD 5.13). */
  lastActiveAt: dateTimeSchema.nullable(),
  workspaceCount: z.int().nonnegative(),
  status: adminUserStatusSchema,
  isAdmin: z.boolean(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

/** Words of a name or an address to look for, ignoring case. */
const searchSchema = plainText(TEXT_LIMITS.short).optional();

/** The query of AD7 users. */
export const adminUserListQuerySchema = pageQuerySchema.extend({
  q: searchSchema,
  status: adminUserStatusSchema.optional(),
});

/** AD7 `GET /api/v1/admin/users`: deleted users last, the rest by name. */
export const adminUserPageSchema = pageSchema(adminUserSchema);

/** A workspace as 28 lists them. */
export const adminWorkspaceSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  isPersonal: z.boolean(),
  owners: z.array(userRefSchema),
  memberCount: z.int().nonnegative(),
  ideaCount: z.int().nonnegative(),
  lastActiveAt: dateTimeSchema.nullable(),
});
export type AdminWorkspace = z.infer<typeof adminWorkspaceSchema>;

/** The query of AD7 workspaces. */
export const adminWorkspaceListQuerySchema = pageQuerySchema.extend({
  q: searchSchema,
});

/** AD7 `GET /api/v1/admin/workspaces`, by name. */
export const adminWorkspacePageSchema = pageSchema(adminWorkspaceSchema);

/** The query of AD7 invitations: `pending` (the default) as W4 GET has it, or `all`. */
export const adminInvitationListQuerySchema = pageQuerySchema.extend({
  status: z.enum(["pending", "all"]).default("pending"),
});

/** AD7 `GET /api/v1/admin/invitations`, newest first, of every workspace and none. */
export const adminInvitationPageSchema = pageSchema(invitationSchema);

/** The `{userId}` of AD8. */
export const adminUserParamsSchema = z.object({ userId: z.string() });

/**
 * The body of AD9. An invitation to a workspace names the role; one to no workspace
 * names none, and whoever accepts it does not become an operator.
 */
export const adminInvitationCreateSchema = z
  .object({
    email: emailSchema,
    workspaceId: uuidSchema.optional(),
    role: roleSchema.optional(),
  })
  .superRefine((body, ctx) => {
    if (body.workspaceId !== undefined && body.role === undefined)
      ctx.addIssue({
        code: "invalid_type",
        expected: "string",
        path: ["role"],
        message: "Required with a workspace",
      });
    if (body.workspaceId === undefined && body.role !== undefined)
      ctx.addIssue({
        code: "custom",
        path: ["role"],
        message: "Only an invitation to a workspace has a role",
      });
  });
export type AdminInvitationCreate = z.infer<typeof adminInvitationCreateSchema>;

/** AD9: the invitation and its link, which the operator may hand over themselves. */
export const adminInvitationResultSchema = z.object({
  invitation: invitationSchema,
  link: z.string(),
});
