import {
  accounts,
  type Database,
  type DatabaseTransaction,
  memberships,
  users,
  workspaces,
} from "@moonx/db";
import type { Me } from "@moonx/schemas";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

/**
 * The signed-in user as U1 answers (SDD 5.4 `Me`). Memberships come in the order the
 * user joined, so the personal workspace made at sign-up leads.
 *
 * @throws when the user does not exist.
 */
export async function loadMe(
  db: Database | DatabaseTransaction,
  userId: string,
): Promise<Me> {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      timezone: users.timezone,
      theme: users.theme,
      isAdmin: users.isAdmin,
      lastWorkspaceId: users.lastWorkspaceId,
      hasPassword: sql<boolean>`exists (${db
        .select({ one: sql`1` })
        .from(accounts)
        .where(
          and(
            eq(accounts.userId, users.id),
            eq(accounts.providerId, "credential"),
            isNotNull(accounts.password),
          ),
        )})`,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (user === undefined) throw new Error(`No user ${userId}`);
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      isPersonal: workspaces.isPersonal,
      currency: workspaces.currency,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.createdAt), asc(workspaces.id));
  return {
    ...user,
    memberships: rows.map(({ role, ...workspace }) => ({ workspace, role })),
  };
}
