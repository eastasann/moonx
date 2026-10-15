import {
  accounts,
  createInvitationToken,
  type Database,
  type DatabaseTransaction,
  hashInvitationToken,
  INVITATION_VALID_MS,
  invitations,
  memberships,
  users,
  workspaces,
} from "@moonx/db";
import {
  errorBodySchema,
  type InvitationPreview,
  invitationAcceptResultSchema,
  invitationPreviewSchema,
  invitationSignUpResultSchema,
  invitationSignUpSchema,
  invitationTokenParamsSchema,
  sameEmail,
} from "@moonx/schemas";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import { AUTH_IP_LIMIT, type Auth } from "./auth";
import type { IpLimit } from "./entry";
import { ApiError, isUniqueViolation } from "./errors";
import { loadMe } from "./me";
import { isValidInvitation, sentTo, setUpNewUser } from "./registration";

const BY_TOKEN = "/api/v1/invitations/by-token";

/**
 * U5 counts in the window the secret paths of Better Auth share per IP (SDD 7.2
 * 「レート制限」, ADR-029 ②). The token is any segment the router would take.
 */
export const SIGN_UP_IP_LIMIT: IpLimit = {
  method: "POST",
  path: /^\/api\/v1\/invitations\/by-token\/[^/]+\/sign-up$/,
  limit: AUTH_IP_LIMIT,
};

const invalid = () =>
  new ApiError(
    "INVITATION_INVALID",
    "The invitation does not exist, was revoked or has expired",
  );

const inviters = alias(users, "inviters");

/** The invitation of a link, whatever its state, or undefined when no link has the token. */
async function findByToken(
  db: Database | DatabaseTransaction,
  token: string,
  lock: boolean,
) {
  const query = db
    .select()
    .from(invitations)
    .where(eq(invitations.tokenHash, hashInvitationToken(token)));
  const [invitation] = await (lock ? query.for("update") : query);
  return invitation;
}

/** Not revoked, and not a pending invitation past its expiry (SDD 5.4 U4). */
const isUsable = (
  invitation: typeof invitations.$inferSelect,
  at: Date,
): boolean =>
  invitation.status === "accepted" ||
  (invitation.status === "pending" && invitation.expiresAt > at);

/** What the invitation routes need from the app. */
export interface InvitationRoutesOptions {
  access: AccessPlugin;
  auth: Auth;
  db: Database;
  now: () => number;
}

/**
 * U4–U6 (SDD 5.4): what an invitation link shows, signing up through it, and
 * accepting it.
 */
export function invitationRoutes({
  access,
  auth,
  db,
  now,
}: InvitationRoutesOptions) {
  return new Elysia()
    .use(access)
    .get(
      `${BY_TOKEN}/:token`,
      async ({ params }): Promise<InvitationPreview> => {
        const [row] = await db
          .select({
            invitation: invitations,
            workspace: { id: workspaces.id, name: workspaces.name },
            inviterName: inviters.displayName,
            accountExists: sql<boolean>`exists (${db
              .select({ one: sql`1` })
              .from(users)
              .where(
                sql`lower(${users.email}) = lower(${invitations.email})`,
              )})`,
          })
          .from(invitations)
          .leftJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
          .leftJoin(inviters, eq(inviters.id, invitations.invitedById))
          .where(eq(invitations.tokenHash, hashInvitationToken(params.token)));
        if (row === undefined || !isUsable(row.invitation, new Date(now()))) {
          throw invalid();
        }
        const { invitation } = row;
        return {
          status: invitation.status === "accepted" ? "accepted" : "pending",
          email: invitation.email,
          workspace: row.workspace,
          role: invitation.role,
          invitedBy:
            row.inviterName === null ? null : { displayName: row.inviterName },
          expiresAt: invitation.expiresAt.toISOString(),
          accountExists: row.accountExists,
        };
      },
      {
        open: true,
        params: invitationTokenParamsSchema,
        response: { 200: invitationPreviewSchema, 410: errorBodySchema },
        detail: {
          summary: "U4 Show an invitation",
          description:
            "Public. A revoked, expired or unknown link answers 410 INVITATION_INVALID; an accepted one answers with status accepted.",
        },
      },
    )
    .post(
      `${BY_TOKEN}/:token/sign-up`,
      async ({ params, body, request, set, status }) => {
        const at = new Date(now());
        const context = await auth.$context;
        const passwordHash = await context.password.hash(body.password);
        const user = await db
          .transaction(async (tx) => {
            // Locked, so two sign-ups through one link cannot both pass the checks.
            const invitation = await findByToken(tx, params.token, true);
            if (
              invitation === undefined ||
              invitation.status !== "pending" ||
              invitation.expiresAt <= at
            ) {
              throw invalid();
            }
            const [taken] = await tx
              .select({ id: users.id })
              .from(users)
              .where(sql`lower(${users.email}) = lower(${invitation.email})`);
            if (taken !== undefined) throw emailTaken();
            const [user] = await tx
              .insert(users)
              .values({
                // Lowercased like Better Auth's own sign-ups: it lowercases an address
                // and then looks it up exactly, so any capital would lock the user out.
                email: invitation.email.toLowerCase(),
                // The link came to this address, which proves it. Better Auth links a
                // Google sign-in only to an account whose address is verified.
                emailVerified: true,
                displayName: body.displayName,
                timezone: body.timezone,
                createdAt: at,
                updatedAt: at,
              })
              .returning({ id: users.id, email: users.email });
            if (user === undefined)
              throw new Error("user insert returned no row");
            await tx.insert(accounts).values({
              userId: user.id,
              // What Better Auth's own email sign-up stores for a password account.
              accountId: user.id,
              providerId: "credential",
              password: passwordHash,
              createdAt: at,
              updatedAt: at,
            });
            await setUpNewUser(
              tx,
              { id: user.id, email: user.email, displayName: body.displayName },
              at,
            );
            return user;
          })
          .catch((error: unknown) => {
            // Another sign-up for the address, through another invitation, won the race.
            if (isUniqueViolation(error, "users_email_lower_uq")) {
              throw emailTaken();
            }
            throw error;
          });
        const { headers } = await auth.api.signInEmail({
          body: { email: user.email, password: body.password },
          headers: request.headers,
          returnHeaders: true,
        });
        set.headers["set-cookie"] = headers.getSetCookie();
        return status(201, { me: await loadMe(db, user.id) });
      },
      {
        open: true,
        params: invitationTokenParamsSchema,
        body: invitationSignUpSchema,
        // Names the media type for the OpenAPI document, which lists none for a route
        // whose only parser is a function. The entry plugin's parser reads the body.
        parse: "json",
        response: {
          201: invitationSignUpResultSchema,
          409: errorBodySchema,
          410: errorBodySchema,
          422: errorBodySchema,
          429: errorBodySchema,
        },
        detail: {
          summary: "U5 Sign up through an invitation",
          description:
            "Public, limited per IP with the sign-in paths. Creates the account for the invitation's address and answers signed in. An invitation to a workspace stays pending until U6.",
        },
      },
    )
    .post(
      `${BY_TOKEN}/:token/accept`,
      async ({ params, caller }) => {
        const at = new Date(now());
        return db.transaction(async (tx) => {
          const invitation = await findByToken(tx, params.token, true);
          if (invitation === undefined || !isUsable(invitation, at)) {
            throw invalid();
          }
          if (!sameEmail(invitation.email, caller.email)) {
            throw new ApiError(
              "INVITATION_EMAIL_MISMATCH",
              "The invitation was sent to another address",
              { invitedEmail: invitation.email },
            );
          }
          if (invitation.status === "accepted") {
            throw new ApiError(
              "INVITATION_ALREADY_ACCEPTED",
              "The invitation was already accepted",
            );
          }
          let alreadyMember = false;
          if (invitation.workspaceId !== null && invitation.role !== null) {
            // A member keeps the role they have (design-spec 6.16 3).
            const joined = await tx
              .insert(memberships)
              .values({
                workspaceId: invitation.workspaceId,
                userId: caller.id,
                role: invitation.role,
                createdAt: at,
                updatedAt: at,
              })
              .onConflictDoNothing()
              .returning({ id: memberships.id });
            alreadyMember = joined.length === 0;
            if (!alreadyMember) {
              await tx
                .update(workspaces)
                .set({ lastActiveAt: at })
                .where(eq(workspaces.id, invitation.workspaceId));
            }
          } else if (invitation.grantsAdmin) {
            await tx
              .update(users)
              .set({ isAdmin: true })
              .where(eq(users.id, caller.id));
          }
          await tx
            .update(invitations)
            .set({
              status: "accepted",
              acceptedById: caller.id,
              acceptedAt: at,
              updatedAt: at,
            })
            .where(eq(invitations.id, invitation.id));
          return { workspaceId: invitation.workspaceId, alreadyMember };
        });
      },
      {
        signedIn: true,
        params: invitationTokenParamsSchema,
        response: {
          200: invitationAcceptResultSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          409: errorBodySchema,
          410: errorBodySchema,
        },
        detail: {
          summary: "U6 Accept an invitation",
          description:
            "Only for the account with the invitation's address. Joins the workspace with the invitation's role, or keeps the role of an existing member.",
        },
      },
    );
}

const emailTaken = () =>
  new ApiError("EMAIL_TAKEN", "An account with this address already exists");

/** An invitation `make admin-create` issued, and the token of its link. */
export interface AdminInvitation {
  token: string;
  invitation: typeof invitations.$inferSelect;
}

/**
 * The invitation that makes the first operator (`make admin-create`, SDD 2章, ADR-010):
 * one that names no workspace and grants operator rights. A valid one to the same
 * address that names no workspace (one an operator issued from screen 28) is reissued
 * instead: it gains the grant, a new link and a new expiry, loses its inviter, and its
 * old link stops working.
 */
export async function issueAdminInvitation(
  db: Database,
  email: string,
  at: Date,
): Promise<AdminInvitation> {
  const token = createInvitationToken();
  const issued = {
    grantsAdmin: true,
    // An invitation from make admin-create names no inviter (SDD 5.4 U4), reissued or not.
    invitedById: null,
    tokenHash: hashInvitationToken(token),
    expiresAt: new Date(at.getTime() + INVITATION_VALID_MS),
    updatedAt: at,
  };
  const invitation = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: invitations.id })
      .from(invitations)
      .where(
        and(
          sentTo(email),
          isNull(invitations.workspaceId),
          isValidInvitation(at),
        ),
      )
      .orderBy(desc(invitations.createdAt))
      .limit(1)
      .for("update");
    const [row] =
      existing === undefined
        ? await tx
            .insert(invitations)
            .values({ email, ...issued, createdAt: at })
            .returning()
        : await tx
            .update(invitations)
            .set(issued)
            .where(eq(invitations.id, existing.id))
            .returning();
    if (row === undefined) throw new Error("invitation write returned no row");
    return row;
  });
  return { token, invitation };
}
