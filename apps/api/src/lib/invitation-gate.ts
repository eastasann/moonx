import { schema } from "@moonx/db";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import type { Executor } from "./db";

/**
 * A pending, unexpired invitation addressed to `email` (compared without case). This is the
 * check behind "no account without an invitation" (SDD 5.4): the sign-up route and Better Auth's
 * `user.create.before` hook both use it. `withoutWorkspace` narrows it to the invitations
 * without a workspace, which sign-up accepts on the spot.
 */
export async function findUsableInvitation(
  db: Executor,
  email: string,
  now: Date,
  options: { withoutWorkspace?: boolean } = {},
) {
  const [row] = await db
    .select()
    .from(schema.invitations)
    .where(
      and(
        sql`lower(${schema.invitations.email}) = ${email.toLowerCase()}`,
        eq(schema.invitations.status, "pending"),
        gt(schema.invitations.expiresAt, now),
        options.withoutWorkspace ? isNull(schema.invitations.workspaceId) : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}
