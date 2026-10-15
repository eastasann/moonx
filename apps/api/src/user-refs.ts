import {
  type Database,
  type DatabaseTransaction,
  memberships,
  users,
} from "@moonx/db";
import type { UserRef } from "@moonx/schemas";
import { and, eq, inArray, sql } from "drizzle-orm";

/**
 * The {@link UserRef} of each of `userIds` (SDD 5.2), as seen from `workspaceId`.
 *
 * The badge says the most lasting thing about the person: `deleted` (the row keeps
 * "Deleted user" as its name, SDD 5.4 U7), then `former_member` when they are no longer
 * in the workspace (design-spec 6.16), then `suspended` (6.17), which a member keeps
 * through the suspension. Without a workspace (a self-analysis, the operator screens),
 * nobody is a former member.
 *
 * @returns Only the users that exist, keyed by id.
 */
export async function loadUserRefs(
  db: Database | DatabaseTransaction,
  userIds: readonly string[],
  workspaceId: string | null,
): Promise<Map<string, UserRef>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      avatarUrl: users.avatarUrl,
      status: users.status,
      member:
        workspaceId === null
          ? sql<boolean>`true`
          : sql<boolean>`exists (${db
              .select({ one: sql`1` })
              .from(memberships)
              .where(
                and(
                  eq(memberships.workspaceId, workspaceId),
                  eq(memberships.userId, users.id),
                ),
              )})`,
    })
    .from(users)
    .where(inArray(users.id, ids));
  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        displayName: row.displayName,
        avatarUrl: row.avatarUrl,
        badge:
          row.status === "deleted"
            ? "deleted"
            : !row.member
              ? "former_member"
              : row.status === "suspended"
                ? "suspended"
                : null,
      },
    ]),
  );
}
