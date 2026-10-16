import { z } from "zod";
import { dateTimeSchema, roleSchema, uuidSchema } from "./common";
import {
  displayNameSchema,
  EMAIL_MAX,
  passwordSchema,
  requiredText,
  timeZoneSchema,
} from "./input-rules";

// The account and invitation types of SDD 5.4.

export const themeSchema = z.enum(["system", "light", "dark"]);
export type Theme = z.infer<typeof themeSchema>;

/** U1 `GET /api/v1/me`, also what U5 answers with. */
export const meSchema = z.object({
  id: uuidSchema,
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  /** IANA name. */
  timezone: z.string(),
  theme: themeSchema,
  isAdmin: z.boolean(),
  /** False for a user who signed up with Google only: screen 4 offers "Set password". */
  hasPassword: z.boolean(),
  lastWorkspaceId: uuidSchema.nullable(),
  /** In the order the user joined, so the personal workspace comes first. */
  memberships: z.array(
    z.object({
      workspace: z.object({
        id: uuidSchema,
        name: z.string(),
        isPersonal: z.boolean(),
        currency: z.string(),
      }),
      role: roleSchema,
    }),
  ),
});
export type Me = z.infer<typeof meSchema>;

/** The `{token}` of the `/api/v1/invitations/by-token/{token}` paths (U4–U6). */
export const invitationTokenParamsSchema = z.object({ token: z.string() });

/** U4 `GET /api/v1/invitations/by-token/{token}`. */
export const invitationPreviewSchema = z.object({
  status: z.enum(["pending", "accepted"]),
  email: z.string(),
  /** Null for an invitation that names no workspace. */
  workspace: z.object({ id: uuidSchema, name: z.string() }).nullable(),
  role: roleSchema.nullable(),
  /** Null for an invitation from `make admin-create`. */
  invitedBy: z.object({ displayName: z.string() }).nullable(),
  expiresAt: dateTimeSchema,
  /** An account with the address exists, so the screen sends the visitor to log in. */
  accountExists: z.boolean(),
});
export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** The body of U5 `POST /api/v1/invitations/by-token/{token}/sign-up`. */
export const invitationSignUpSchema = z.object({
  displayName: displayNameSchema,
  password: passwordSchema,
  timezone: timeZoneSchema,
});
export type InvitationSignUp = z.infer<typeof invitationSignUpSchema>;

/** What U5 answers with, besides the session cookie. */
export const invitationSignUpResultSchema = z.object({ me: meSchema });
export type InvitationSignUpResult = z.infer<
  typeof invitationSignUpResultSchema
>;

/** U6 `POST /api/v1/invitations/by-token/{token}/accept`. */
export const invitationAcceptResultSchema = z.object({
  /** Null for an invitation that names no workspace. */
  workspaceId: uuidSchema.nullable(),
  /** The user was a member already, and keeps the role they had. */
  alreadyMember: z.boolean(),
});
export type InvitationAcceptResult = z.infer<
  typeof invitationAcceptResultSchema
>;

/** The body of U2 `PATCH /api/v1/me`: only the fields sent change. */
export const meUpdateSchema = z.object({
  displayName: displayNameSchema.optional(),
  timezone: timeZoneSchema.optional(),
  theme: themeSchema.optional(),
  /** One of the caller's workspaces (422 otherwise). */
  lastWorkspaceId: uuidSchema.optional(),
});
export type MeUpdate = z.infer<typeof meUpdateSchema>;

/**
 * The body of U3 `PUT /api/v1/me/avatar`, as `multipart/form-data`. Its type and size are
 * checked by the API against the file's content (design-spec 6.0.8), not here: a type
 * the client declares proves nothing.
 */
export const avatarUploadSchema = z.object({ file: z.file() });

/** What U3 `PUT /api/v1/me/avatar` answers with. */
export const avatarResultSchema = z.object({ avatarUrl: z.string() });
export type AvatarResult = z.infer<typeof avatarResultSchema>;

/** The `{name}` of U9 `GET /api/avatars/{name}`. */
export const avatarNameParamsSchema = z.object({ name: z.string() });

/** The body of U7 `POST /api/v1/me/delete` (design-spec 6.16「アカウントの削除」). */
export const accountDeletionSchema = z.object({
  /** Must be the caller's address, ignoring case (422 CONFIRMATION_MISMATCH otherwise). */
  confirmEmail: requiredText(EMAIL_MAX),
  /** Required of an account with a password; the current password, so no rule applies. */
  password: z.string().optional(),
});
export type AccountDeletion = z.infer<typeof accountDeletionSchema>;

/** The body of U8 `POST /api/v1/me/password`. */
export const passwordSetSchema = z.object({ newPassword: passwordSchema });
export type PasswordSet = z.infer<typeof passwordSetSchema>;
