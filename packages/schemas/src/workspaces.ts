import { z } from "zod";
import { dateTimeSchema, userRefSchema } from "./common";
import { roleSchema, targetTypeSchema } from "./enums";

/** ISO 4217 code: three capital letters (design-spec 6.16 offers the list; the API checks the form). */
export const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Must be an ISO 4217 code");

export const workspaceNameSchema = z.string().trim().min(1).max(60);

/** W0 */
export const createWorkspaceBodySchema = z.object({
  name: workspaceNameSchema,
  currency: currencySchema.optional(),
});

/** W1 PATCH */
export const updateWorkspaceBodySchema = z
  .object({ name: workspaceNameSchema, currency: currencySchema })
  .partial();

export const workspaceSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  currency: z.string(),
  isPersonal: z.boolean(),
  myRole: roleSchema,
  memberCount: z.number().int(),
});

export type Workspace = z.infer<typeof workspaceSchema>;

/** W3 PATCH */
export const updateMemberBodySchema = z.object({ role: roleSchema });

export const memberSchema = z.object({
  user: userRefSchema,
  /** Only an Owner sees the addresses of the members. */
  email: z.string().nullable(),
  role: roleSchema,
  joinedAt: dateTimeSchema,
  /** The person a personal workspace was made for; other Owners cannot demote or remove them. */
  isPersonalOwner: z.boolean(),
});

export type Member = z.infer<typeof memberSchema>;

export const invitationStatusSchema = z.enum(["pending", "accepted", "revoked", "expired"]);

export const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: roleSchema.nullable(),
  workspace: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  status: invitationStatusSchema,
  invitedBy: userRefSchema.nullable(),
  createdAt: dateTimeSchema,
  expiresAt: dateTimeSchema,
  acceptedAt: dateTimeSchema.nullable(),
});

export type Invitation = z.infer<typeof invitationSchema>;

/** W4 POST. The address is kept as typed; it is compared in lower case. */
export const createInvitationBodySchema = z.object({
  email: z.string().trim().max(254).pipe(z.email()),
  role: roleSchema,
});

/** W4 GET: `pending` lists only invitations that can still be accepted. */
export const listInvitationsQuerySchema = z.object({
  status: z.enum(["pending", "all"]).optional(),
});

/** W4 POST and W5: the inviter never sees the link; it goes to the invited address only. */
export const invitationResultSchema = z.object({ invitation: invitationSchema });

/** AD9 answers with the link as well: operators are trusted and hand it over themselves (SDD 5.5). */
export const invitationWithLinkSchema = z.object({
  invitation: invitationSchema,
  link: z.string(),
});

/** W8: a target narrows the candidates to the people who can read it. */
export const mentionCandidatesQuerySchema = z
  .object({ targetType: targetTypeSchema.optional(), targetId: z.uuid().optional() })
  .refine((q) => (q.targetType === undefined) === (q.targetId === undefined), {
    message: "targetType and targetId go together",
    path: ["targetId"],
  });
