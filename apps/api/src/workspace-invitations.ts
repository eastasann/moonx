import {
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
import { i18n } from "@moonx/i18n";
import {
  errorBodySchema,
  type Invitation,
  invitationCreateSchema,
  invitationIdParamsSchema,
  invitationListQuerySchema,
  invitationListSchema,
  invitationResultSchema,
  type Role,
  uuidSchema,
} from "@moonx/schemas";
import { and, desc, eq, isNull, ne, type SQL, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AccessPlugin, Caller, ScopeLocator } from "./access";
import type { Config } from "./config";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import { lockActiveCaller, lockInvitations } from "./lock";
import type { Mailer } from "./mail";
import type { Limit, RateLimiter } from "./rate-limit";
import { isValidInvitation, sentTo } from "./registration";
import { loadUserRefs } from "./user-refs";

/**
 * Sending and resending invitations, W4, W5 and AD9 together, per user (SDD 7.2
 * 「レート制限」): Resend sends 100 mails a day.
 */
export const INVITATION_SEND_LIMIT: Limit = {
  name: "invitation-send",
  max: 20,
  windowMs: 60 * 60 * 1000,
};

const noContent = z.undefined().meta({ description: "No content" });

type InvitationRow = typeof invitations.$inferSelect;

/** The status an invitation shows: a pending one past its expiry is `expired` (SDD 5.5). */
const statusOf = (row: InvitationRow, at: Date): Invitation["status"] =>
  row.status === "pending" && row.expiresAt <= at ? "expired" : row.status;

/**
 * The invitations matching `where`, newest first, as SDD 5.5 shows them. The inviter is
 * shown as seen from the invitation's workspace, so one who left is a former member.
 */
async function loadInvitations(
  db: Database | DatabaseTransaction,
  where: SQL | undefined,
  at: Date,
): Promise<Invitation[]> {
  const rows = await db
    .select({
      invitation: invitations,
      workspace: { id: workspaces.id, name: workspaces.name },
    })
    .from(invitations)
    .leftJoin(workspaces, eq(workspaces.id, invitations.workspaceId))
    .where(where)
    .orderBy(desc(invitations.createdAt), desc(invitations.id));
  const inviters = new Map<
    string | null,
    Map<string, Invitation["invitedBy"]>
  >();
  for (const workspaceId of new Set(
    rows.map((row) => row.invitation.workspaceId),
  )) {
    const ids = rows
      .filter((row) => row.invitation.workspaceId === workspaceId)
      .flatMap((row) =>
        row.invitation.invitedById === null ? [] : [row.invitation.invitedById],
      );
    inviters.set(workspaceId, await loadUserRefs(db, ids, workspaceId));
  }
  return rows.map(({ invitation, workspace }) => ({
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    workspace,
    status: statusOf(invitation, at),
    invitedBy:
      invitation.invitedById === null
        ? null
        : (inviters.get(invitation.workspaceId)?.get(invitation.invitedById) ??
          null),
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
  }));
}

async function loadInvitation(
  db: Database | DatabaseTransaction,
  id: string,
  at: Date,
): Promise<Invitation> {
  const [invitation] = await loadInvitations(db, eq(invitations.id, id), at);
  if (invitation === undefined) throw new Error(`No invitation ${id}`);
  return invitation;
}

/** What an invitation mail says (design-spec 6.16「招待のメール」). */
interface InvitationMail {
  to: string;
  token: string;
  workspace: { name: string; role: Role } | null;
  /** The inviter's display name; null for `make admin-create` and a deleted inviter. */
  inviterName: string | null;
}

/** Sends the mail of an invitation, link included (design-spec 6.16「招待のメール」). */
async function sendInvitationMail(
  mailer: Mailer,
  baseUrl: string,
  mail: InvitationMail,
  requestId: string,
): Promise<void> {
  const { workspace, inviterName } = mail;
  const values = {
    workspace: workspace?.name,
    role:
      workspace === null ? undefined : i18n.t(`common:role.${workspace.role}`),
    inviter: inviterName ?? undefined,
  };
  const opening =
    inviterName === null
      ? workspace === null
        ? i18n.t("mail:invitation.invitedNoWorkspace")
        : i18n.t("mail:invitation.invited", values)
      : workspace === null
        ? i18n.t("mail:invitation.invitedByNoWorkspace", values)
        : i18n.t("mail:invitation.invitedBy", values);
  const link = new URL(`/invite/${mail.token}`, baseUrl);
  await mailer.send(
    {
      to: mail.to,
      subject:
        workspace === null
          ? i18n.t("mail:invitation.subjectNoWorkspace")
          : i18n.t("mail:invitation.subject", values),
      text: i18n.t("mail:invitation.text", { opening, link: link.href }),
    },
    requestId,
  );
}

/**
 * The name the mail gives for `invitedById`: none for `make admin-create`, and none for
 * an inviter whose account was deleted ("Deleted user" invites nobody).
 */
async function inviterNameOf(
  tx: DatabaseTransaction,
  invitedById: string | null,
): Promise<string | null> {
  if (invitedById === null) return null;
  const [inviter] = await tx
    .select({ displayName: users.displayName, status: users.status })
    .from(users)
    .where(eq(users.id, invitedById));
  return inviter === undefined || inviter.status === "deleted"
    ? null
    : inviter.displayName;
}

/**
 * Refuses to mail `email` an invitation to `workspaceId` (null: to no workspace) when
 * its address belongs to a member, or when another valid invitation to it exists
 * (SDD 5.5 W4, W5): `except` is the invitation being resent. Under
 * {@link lockInvitations} the answer holds until the transaction ends.
 *
 * @throws {ApiError} ALREADY_MEMBER, or INVITATION_PENDING with `invitationId`
 */
async function refuseDuplicate(
  db: Database | DatabaseTransaction,
  invitation: { workspaceId: string | null; email: string; except?: string },
  at: Date,
): Promise<void> {
  const { workspaceId, email, except } = invitation;
  if (workspaceId !== null) {
    const [member] = await db
      .select({ id: memberships.id })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.workspaceId, workspaceId),
          sql`lower(${users.email}) = lower(${email})`,
        ),
      );
    if (member !== undefined) {
      throw new ApiError(
        "ALREADY_MEMBER",
        "The address belongs to a member of the workspace",
      );
    }
  }
  const [pending] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        workspaceId === null
          ? isNull(invitations.workspaceId)
          : eq(invitations.workspaceId, workspaceId),
        sentTo(email),
        isValidInvitation(at),
        except === undefined ? undefined : ne(invitations.id, except),
      ),
    )
    .orderBy(desc(invitations.createdAt))
    .limit(1);
  if (pending !== undefined) {
    throw new ApiError(
      "INVITATION_PENDING",
      "A valid invitation to the address exists",
      { invitationId: pending.id },
    );
  }
}

/** What the invitation routes of the workspace need from the app. */
export interface WorkspaceInvitationRoutesOptions {
  access: AccessPlugin;
  config: Pick<Config, "betterAuthUrl">;
  db: Database;
  mailer: Mailer;
  limiter: RateLimiter;
  now: () => number;
}

/**
 * Finds the invitation of W5 and W7. An operator may act on every invitation (SDD 7.1),
 * so for one the route checks no workspace role; everyone else needs to be an Owner of
 * the invitation's workspace, and an invitation without one is an operator's only.
 */
const invitationLocator: ScopeLocator = async ({ params, caller, db }) => {
  const id = params.invitationId ?? "";
  const [invitation] = uuidSchema.safeParse(id).success
    ? await db
        .select({ workspaceId: invitations.workspaceId })
        .from(invitations)
        .where(eq(invitations.id, id))
    : [];
  if (invitation === undefined) {
    throw new ApiError("NOT_FOUND", "No such invitation");
  }
  if (caller.isAdmin) return null;
  if (invitation.workspaceId === null) {
    throw new ApiError(
      "FORBIDDEN",
      "Only operators manage invitations without a workspace",
    );
  }
  return { workspaceId: invitation.workspaceId };
};

/** W4, W5 and W7 (SDD 5.5): the invitations of a workspace. */
export function workspaceInvitationRoutes({
  access,
  config,
  db,
  mailer,
  limiter,
  now,
}: WorkspaceInvitationRoutesOptions) {
  /**
   * Counts a send in `tx` once its checks have passed, so a refusal counts none, and
   * neither does a mail Resend did not take, which rolls the count back with the rest
   * (SDD 7.2).
   *
   * @throws {ApiError} RATE_LIMITED
   */
  const countSend = async (caller: Caller, tx: DatabaseTransaction) => {
    const counted = await limiter.consume(
      "user",
      INVITATION_SEND_LIMIT,
      caller.id,
      tx,
    );
    if (!counted.allowed) {
      throw new ApiError("RATE_LIMITED", "Too many invitations sent", {
        retryAfterSeconds: counted.retryAfterSeconds,
      });
    }
  };

  /**
   * The invitation of W5 or W7, refusing one that is accepted or revoked; locked when
   * read in a transaction.
   */
  const openInvitation = async (
    db: Database | DatabaseTransaction,
    id: string,
    lock: boolean,
  ) => {
    const query = db.select().from(invitations).where(eq(invitations.id, id));
    const [invitation] = await (lock ? query.for("update") : query);
    if (invitation === undefined) {
      throw new ApiError("NOT_FOUND", "No such invitation");
    }
    if (invitation.status === "accepted") {
      throw new ApiError(
        "INVITATION_ALREADY_ACCEPTED",
        "The invitation was already accepted",
      );
    }
    if (invitation.status === "revoked") {
      throw new ApiError("INVITATION_INVALID", "The invitation was revoked");
    }
    return invitation;
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/workspaces/:workspaceId/invitations",
      async ({ scope, query }) => {
        const at = new Date(now());
        const inWorkspace = eq(invitations.workspaceId, scope.workspaceId);
        return {
          items: await loadInvitations(
            db,
            query.status === "pending"
              ? and(inWorkspace, isValidInvitation(at))
              : inWorkspace,
            at,
          ),
        };
      },
      {
        scoped: { to: "workspaceId", need: "owner" },
        query: invitationListQuerySchema,
        response: {
          200: invitationListSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          422: errorBodySchema,
        },
        detail: {
          summary: "W4 The invitations of a workspace",
          description:
            "Owner only, newest first. status=pending (the default) lists those that can still be accepted; all adds accepted, revoked and expired ones.",
        },
      },
    )
    .post(
      "/api/v1/workspaces/:workspaceId/invitations",
      async ({ scope, body, caller, request, status }) => {
        const at = new Date(now());
        const { requestId } = requestContext(request);
        const id = await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          await lockInvitations(tx, scope.workspaceId);
          await refuseDuplicate(
            tx,
            { workspaceId: scope.workspaceId, email: body.email },
            at,
          );
          await countSend(caller, tx);
          const token = createInvitationToken();
          const [invitation] = await tx
            .insert(invitations)
            .values({
              workspaceId: scope.workspaceId,
              email: body.email,
              role: body.role,
              tokenHash: hashInvitationToken(token),
              invitedById: caller.id,
              expiresAt: new Date(at.getTime() + INVITATION_VALID_MS),
              createdAt: at,
              updatedAt: at,
            })
            .returning({ id: invitations.id });
          if (invitation === undefined) {
            throw new Error("invitation insert returned no row");
          }
          const [workspace] = await tx
            .select({ name: workspaces.name })
            .from(workspaces)
            .where(eq(workspaces.id, scope.workspaceId));
          if (workspace === undefined) {
            throw new Error(`No workspace ${scope.workspaceId}`);
          }
          // Inside the transaction: if Resend does not take the mail, the invitation is
          // not created either (SDD 5.5).
          await sendInvitationMail(
            mailer,
            config.betterAuthUrl,
            {
              to: body.email,
              token,
              workspace: { name: workspace.name, role: body.role },
              inviterName: await inviterNameOf(tx, caller.id),
            },
            requestId,
          );
          return invitation.id;
        });
        return status(201, { invitation: await loadInvitation(db, id, at) });
      },
      {
        scoped: { to: "workspaceId", need: "owner" },
        body: invitationCreateSchema,
        parse: "json",
        response: {
          201: invitationResultSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          422: errorBodySchema,
          429: errorBodySchema,
          503: errorBodySchema,
        },
        detail: {
          summary: "W4 Invite someone to a workspace",
          description:
            "Owner only. Mails the link to the address and never returns it. 503 UPSTREAM_UNAVAILABLE when the mail cannot be sent, and then no invitation is made.",
        },
      },
    )
    .post(
      "/api/v1/invitations/:invitationId/resend",
      async ({ params, caller, request }) => {
        const at = new Date(now());
        const { requestId } = requestContext(request);
        // Read first for the workspace whose invitations to lock, then again under it.
        const found = await openInvitation(db, params.invitationId, false);
        await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          await lockInvitations(tx, found.workspaceId);
          const invitation = await openInvitation(tx, found.id, true);
          await refuseDuplicate(
            tx,
            {
              workspaceId: invitation.workspaceId,
              email: invitation.email,
              except: invitation.id,
            },
            at,
          );
          await countSend(caller, tx);
          const token = createInvitationToken();
          // A new token ends the old link, and the expiry counts from now (SDD 5.5).
          // Both stay as they were if the mail cannot be sent.
          await tx
            .update(invitations)
            .set({
              tokenHash: hashInvitationToken(token),
              expiresAt: new Date(at.getTime() + INVITATION_VALID_MS),
              updatedAt: at,
            })
            .where(eq(invitations.id, invitation.id));
          const [workspace] =
            invitation.workspaceId === null
              ? []
              : await tx
                  .select({ name: workspaces.name })
                  .from(workspaces)
                  .where(eq(workspaces.id, invitation.workspaceId));
          await sendInvitationMail(
            mailer,
            config.betterAuthUrl,
            {
              to: invitation.email,
              token,
              workspace:
                workspace === undefined || invitation.role === null
                  ? null
                  : { name: workspace.name, role: invitation.role },
              // The person who invited, whoever resends.
              inviterName: await inviterNameOf(tx, invitation.invitedById),
            },
            requestId,
          );
        });
        return {
          invitation: await loadInvitation(db, params.invitationId, at),
        };
      },
      {
        located: { to: invitationLocator, need: "owner" },
        params: invitationIdParamsSchema,
        response: {
          200: invitationResultSchema,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          410: errorBodySchema,
          429: errorBodySchema,
          503: errorBodySchema,
        },
        detail: {
          summary: "W5 Resend an invitation",
          description:
            "An Owner of the invitation's workspace, or an operator for any invitation. Makes a new link, ending the old one, and a new expiry. Expired invitations may be resent. Refuses with ALREADY_MEMBER and INVITATION_PENDING as W4 does.",
        },
      },
    )
    .delete(
      "/api/v1/invitations/:invitationId",
      async ({ params, set }) => {
        const at = new Date(now());
        await db.transaction(async (tx) => {
          const invitation = await openInvitation(
            tx,
            params.invitationId,
            true,
          );
          await tx
            .update(invitations)
            .set({ status: "revoked", updatedAt: at })
            .where(eq(invitations.id, invitation.id));
        });
        set.status = 204;
      },
      {
        located: { to: invitationLocator, need: "owner" },
        params: invitationIdParamsSchema,
        response: {
          204: noContent,
          401: errorBodySchema,
          403: errorBodySchema,
          404: errorBodySchema,
          409: errorBodySchema,
          410: errorBodySchema,
        },
        detail: {
          summary: "W7 Revoke an invitation",
          description:
            "An Owner of the invitation's workspace, or an operator for any invitation.",
        },
      },
    );
}
