import { z } from "zod";
import { dateTimeSchema } from "./common";
import { roleSchema } from "./enums";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** SDD 5.4: 8 to 128 characters. */
export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

/** An IANA time zone name the runtime knows (SDD 5.4 U2). */
export const timezoneSchema = z.string().refine((name) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: name });
    return true;
  } catch {
    return false;
  }
}, "Must be an IANA time zone name");

export const displayNameSchema = z.string().trim().min(1).max(60);

export const themePreferenceSchema = z.enum(["system", "light", "dark"]);

export const meSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  timezone: z.string(),
  theme: themePreferenceSchema,
  isAdmin: z.boolean(),
  hasPassword: z.boolean(),
  lastWorkspaceId: z.uuid().nullable(),
  memberships: z.array(
    z.object({
      workspace: z.object({
        id: z.uuid(),
        name: z.string(),
        isPersonal: z.boolean(),
        currency: z.string(),
      }),
      role: roleSchema,
    }),
  ),
});

export type Me = z.infer<typeof meSchema>;

/** U2 */
export const updateMeBodySchema = z
  .object({
    displayName: displayNameSchema,
    timezone: timezoneSchema,
    theme: themePreferenceSchema,
    lastWorkspaceId: z.uuid(),
  })
  .partial();

/** U3 PUT */
export const avatarResponseSchema = z.object({ avatarUrl: z.string() });

export const invitationPreviewSchema = z.object({
  status: z.enum(["pending", "accepted"]),
  email: z.string(),
  workspace: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  role: roleSchema.nullable(),
  invitedBy: z.object({ displayName: z.string() }).nullable(),
  expiresAt: dateTimeSchema,
  accountExists: z.boolean(),
});

export type InvitationPreview = z.infer<typeof invitationPreviewSchema>;

/** U5 */
export const invitationSignUpBodySchema = z.object({
  displayName: displayNameSchema,
  password: passwordSchema,
  timezone: timezoneSchema,
});

/** U6 */
export const acceptInvitationResponseSchema = z.object({
  workspaceId: z.uuid().nullable(),
  alreadyMember: z.boolean(),
});

/** U7 */
export const deleteAccountBodySchema = z.object({
  confirmEmail: z.string().min(1).max(320),
  password: z.string().max(PASSWORD_MAX_LENGTH).optional(),
});

/** U8 */
export const setPasswordBodySchema = z.object({ newPassword: passwordSchema });
