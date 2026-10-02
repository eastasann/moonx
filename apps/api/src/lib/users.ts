import { schema } from "@moonx/db";
import type { UserRef } from "@moonx/schemas";
import { and, eq, inArray } from "drizzle-orm";
import type { Executor } from "./db";
import { i18n } from "./i18n";

type UserRow = Pick<
  typeof schema.users.$inferSelect,
  "id" | "displayName" | "avatarUrl" | "status"
>;

/**
 * The name shown next to a record (design-spec 6.16, 6.17). Deleted users read "Deleted user";
 * a person who left the workspace keeps their name with a "former member" badge.
 */
export function toUserRef(user: UserRow, isMember = true): UserRef {
  if (user.status === "deleted") {
    return {
      id: user.id,
      displayName: i18n.t("common:deletedUser"),
      avatarUrl: null,
      badge: "deleted",
    };
  }
  return {
    id: user.id,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    badge: user.status === "suspended" ? "suspended" : isMember ? null : "former_member",
  };
}

/**
 * Resolves user ids to refs in one round trip. `workspaceId` decides the "former member" badge;
 * `null` (self-analysis content, which belongs to no workspace) never shows it.
 */
export async function loadUserRefs(
  db: Executor,
  ids: (string | null | undefined)[],
  workspaceId: string | null,
): Promise<Map<string, UserRef>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const refs = new Map<string, UserRef>();
  if (unique.length === 0) return refs;
  const users = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, unique));
  const members =
    workspaceId === null
      ? []
      : await db
          .select({ userId: schema.memberships.userId })
          .from(schema.memberships)
          .where(
            and(
              eq(schema.memberships.workspaceId, workspaceId),
              inArray(schema.memberships.userId, unique),
            ),
          );
  const memberIds = new Set(members.map((m) => m.userId));
  for (const user of users) {
    refs.set(user.id, toUserRef(user, workspaceId === null || memberIds.has(user.id)));
  }
  return refs;
}

/** The ref of an optional user id, or null. */
export function userRefOrNull(refs: Map<string, UserRef>, id: string | null | undefined) {
  return id ? (refs.get(id) ?? null) : null;
}
