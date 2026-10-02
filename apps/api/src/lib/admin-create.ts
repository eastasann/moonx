import { schema } from "@moonx/db";
import { createInvitationBodySchema } from "@moonx/schemas";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Db } from "./db";
import { issueInvitation, reissueInvitation } from "./invitation-issue";

/** A reason `make admin-create` cannot go on, written for the person at the terminal. */
export class AdminCreateError extends Error {}

/**
 * Issues the invitation that makes its holder an operator: `grants_admin` on an invitation without
 * a workspace (SDD ADR-010, design-spec 6.16 screen 3). Running it again for the same address while
 * the invitation is still valid gives it a new link (and upgrades one issued by AD9), because the
 * link is shown only once and the first operator has no screen to get it from.
 */
export async function createOperatorInvitation(
  db: Db,
  input: { email: string; publicUrl: string; now: Date },
): Promise<{ link: string; expiresAt: string; reissued: boolean }> {
  const parsed = createInvitationBodySchema.pick({ email: true }).safeParse({ email: input.email });
  if (!parsed.success) throw new AdminCreateError(`"${input.email}" is not a valid email address`);
  const email = parsed.data.email;
  const [account] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email.toLowerCase()}`);
  if (account) throw new AdminCreateError(`An account for ${email} already exists`);
  // The first operator has nobody to be invited by, so the inviter is the oldest operator if
  // there is one and nobody otherwise.
  const [inviter] = await db
    .select({ id: schema.users.id, displayName: schema.users.displayName })
    .from(schema.users)
    .where(and(eq(schema.users.isAdmin, true), eq(schema.users.status, "active")))
    .orderBy(asc(schema.users.createdAt), asc(schema.users.id))
    .limit(1);
  const [pending] = await db
    .select({ id: schema.invitations.id })
    .from(schema.invitations)
    .where(
      and(
        isNull(schema.invitations.workspaceId),
        sql`lower(${schema.invitations.email}) = ${email.toLowerCase()}`,
        eq(schema.invitations.status, "pending"),
        gt(schema.invitations.expiresAt, input.now),
      ),
    );
  if (pending) {
    const { row, link } = await reissueInvitation(db, pending.id, input.publicUrl, input.now, {
      grantsAdmin: true,
    });
    return { link, expiresAt: row.expiresAt.toISOString(), reissued: true };
  }
  const { invitation, link } = await issueInvitation(db, {
    publicUrl: input.publicUrl,
    now: input.now,
    inviter: inviter ?? null,
    email,
    target: null,
    grantsAdmin: true,
    mailer: null,
    rateLimited: false,
  });
  return { link, expiresAt: invitation.expiresAt, reissued: false };
}
