import { schema } from "@moonx/db";
import type { Invitation, Role } from "@moonx/schemas";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import { invitationMail, type Mailer } from "../mail/mailer";
import type { Db, Executor } from "./db";
import { toInvitations } from "./invitation-dto";
import {
  hashInvitationToken,
  INVITATION_TTL_DAYS,
  invitationExpiry,
  invitationLink,
  newInvitationToken,
} from "./invitation-token";
import { enforceRateLimit } from "./rate-limit";

/** What {@link issueInvitation} needs to create one invitation. */
export interface IssueInvitationInput {
  publicUrl: string;
  now: Date;
  /** null only for `make admin-create` on a database that has no operator yet. */
  inviter: { id: string; displayName: string } | null;
  /** Kept as typed; compared in lower case. */
  email: string;
  /** null = an operator invitation without a workspace (design-spec 6.16 screen 3). */
  target: { workspaceId: string; role: Role } | null;
  /** null when the caller hands the link over itself (`make admin-create`). */
  mailer: Mailer | null;
  /** Count the use against the inviter's hourly limit (SDD 7.2). */
  rateLimited: boolean;
}

/**
 * Creates a pending invitation and mails the link, in one transaction: the mail is sent before
 * the commit, so a failed send leaves no invitation behind. Used by W4, AD9 and `admin-create`.
 */
export async function issueInvitation(
  db: Db,
  input: IssueInvitationInput,
): Promise<{ invitation: Invitation; link: string }> {
  const { now, target } = input;
  const email = input.email.toLowerCase();
  const token = newInvitationToken();
  const link = invitationLink(input.publicUrl, token);
  const invitation = await db.transaction(async (tx) => {
    // Serializes the invitations of one workspace (or of one address for operator invitations), so
    // a double click cannot pass the checks below twice and create two pending invitations. An
    // advisory lock rather than a row lock: this transaction waits for Resend, and a lock on the
    // workspace row would hold up every content write of the workspace meanwhile.
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${target ? target.workspaceId : `operator:${email}`}))`,
    );
    if (target) {
      const [existing] = await tx
        .select({ id: schema.memberships.id })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            eq(schema.memberships.workspaceId, target.workspaceId),
            sql`lower(${schema.users.email}) = ${email}`,
          ),
        );
      if (existing) throw new ApiError("ALREADY_MEMBER", "That person is already a member");
    }
    const [pending] = await tx
      .select({ id: schema.invitations.id })
      .from(schema.invitations)
      .where(
        and(
          target
            ? eq(schema.invitations.workspaceId, target.workspaceId)
            : isNull(schema.invitations.workspaceId),
          sql`lower(${schema.invitations.email}) = ${email}`,
          eq(schema.invitations.status, "pending"),
          gt(schema.invitations.expiresAt, now),
        ),
      );
    if (pending) {
      throw new ApiError("INVITATION_PENDING", "A valid invitation already exists", {
        invitationId: pending.id,
      });
    }
    if (input.rateLimited) {
      if (!input.inviter) throw new Error("A rate-limited invitation needs an inviter");
      await enforceRateLimit(tx, "invitation", input.inviter.id, now.getTime());
    }
    const [created] = await tx
      .insert(schema.invitations)
      .values({
        workspaceId: target?.workspaceId ?? null,
        email: input.email,
        role: target?.role ?? null,
        tokenHash: hashInvitationToken(token),
        invitedById: input.inviter?.id ?? null,
        expiresAt: invitationExpiry(now),
      })
      .returning();
    if (input.mailer) {
      if (!input.inviter) throw new Error("A mailed invitation needs an inviter");
      const [workspace] = target
        ? await tx
            .select({ name: schema.workspaces.name })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, target.workspaceId))
        : [];
      await input.mailer.send(
        invitationMail({
          to: input.email,
          inviter: input.inviter.displayName,
          workspace: target ? { name: workspace?.name ?? "", role: target.role } : null,
          link,
          expiresInDays: INVITATION_TTL_DAYS,
        }),
      );
    }
    const [dto] = await toInvitations(tx, [created as NonNullable<typeof created>], now);
    return dto as Invitation;
  });
  return { invitation, link };
}

/**
 * Gives an invitation a new token and a fresh 7 days and makes it pending again; the previous
 * link stops working (design-spec 6.16). Used by W5, W6 and a repeated `admin-create`.
 */
export async function reissueInvitation(
  tx: Executor,
  invitationId: string,
  publicUrl: string,
  now: Date,
) {
  const token = newInvitationToken();
  const [row] = await tx
    .update(schema.invitations)
    .set({
      tokenHash: hashInvitationToken(token),
      status: "pending",
      expiresAt: invitationExpiry(now),
    })
    .where(eq(schema.invitations.id, invitationId))
    .returning();
  return { row: row as NonNullable<typeof row>, link: invitationLink(publicUrl, token) };
}
