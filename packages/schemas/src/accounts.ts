import { z } from "zod";
import { dateTimeSchema, roleSchema, uuidSchema } from "./common";
import {
  displayNameSchema,
  passwordSchema,
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
