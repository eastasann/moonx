import { schema } from "@moonx/db";
import { eq } from "drizzle-orm";
import type { Executor } from "./db";
import { findUsableInvitation } from "./invitation-gate";

/**
 * What a new account gets right after it exists (SDD 5.4): a personal workspace named after
 * them (currency PHP, they are its Owner, and it is where they land), and operator rights when
 * the invitation they came with has no workspace (`make admin-create`, AD9: ADR-010); that
 * invitation counts as accepted from then on.
 */
export async function provisionNewUser(
  db: Executor,
  user: { id: string; email: string; displayName: string },
  now: Date,
): Promise<void> {
  const [workspace] = await db
    .insert(schema.workspaces)
    .values({
      name: `${user.displayName}'s workspace`.slice(0, 60),
      currency: "PHP",
      isPersonal: true,
      createdById: user.id,
    })
    .returning({ id: schema.workspaces.id });
  const workspaceId = (workspace as NonNullable<typeof workspace>).id;
  await db.insert(schema.memberships).values({ workspaceId, userId: user.id, role: "owner" });
  await db
    .update(schema.users)
    .set({ lastWorkspaceId: workspaceId })
    .where(eq(schema.users.id, user.id));
  const operator = await findUsableInvitation(db, user.email, now, { withoutWorkspace: true });
  if (operator) {
    await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, user.id));
    // Onboarding skips the invitation step for these (design-spec 6.16 screen 3), so nothing
    // else would ever accept it.
    await db
      .update(schema.invitations)
      .set({ status: "accepted", acceptedById: user.id, acceptedAt: now })
      .where(eq(schema.invitations.id, operator.id));
  }
}
