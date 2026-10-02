import { schema } from "@moonx/db";
import type { AdminUser, AdminWorkspace, Page } from "@moonx/schemas";
import { and, asc, desc, eq, inArray, type SQL, sql } from "drizzle-orm";
import type { Executor } from "./db";
import { iso, isoOrNull } from "./dto";
import { i18n } from "./i18n";
import { decodeCursor, toPage } from "./page";
import { toUserRef } from "./users";

const userColumns = {
  id: schema.users.id,
  displayName: schema.users.displayName,
  email: schema.users.email,
  createdAt: schema.users.createdAt,
  lastActiveAt: schema.users.lastActiveAt,
  status: schema.users.status,
  isAdmin: schema.users.isAdmin,
  workspaceCount: sql<number>`(select count(*)::int from ${schema.memberships} where ${schema.memberships.userId} = "users"."id")`,
};

const toAdminUser = (row: {
  id: string;
  displayName: string;
  email: string;
  createdAt: Date;
  lastActiveAt: Date | null;
  status: AdminUser["status"];
  isAdmin: boolean;
  workspaceCount: number;
}): AdminUser => ({
  id: row.id,
  displayName: row.status === "deleted" ? i18n.t("common:deletedUser") : row.displayName,
  email: row.email,
  createdAt: iso(row.createdAt),
  lastActiveAt: isoOrNull(row.lastActiveAt),
  workspaceCount: row.workspaceCount,
  status: row.status,
  isAdmin: row.isAdmin,
});

/** `%` and `_` typed by the operator match themselves, not any text. */
const contains = (q: string) => `%${q.replace(/[\\%_]/g, "\\$&")}%`;

/** One user as the operator sees it (counts and dates only). 404 is the caller's call. */
export async function loadAdminUser(db: Executor, userId: string): Promise<AdminUser | null> {
  const [row] = await db.select(userColumns).from(schema.users).where(eq(schema.users.id, userId));
  return row ? toAdminUser(row) : null;
}

/**
 * AD7 users: newest first with deleted users last (shown as "Deleted user"). `q` matches the
 * display name or the address.
 */
export async function listAdminUsers(
  db: Executor,
  query: { q?: string; status?: AdminUser["status"]; cursor?: string; limit: number },
): Promise<Page<AdminUser>> {
  const offset = decodeCursor(query.cursor);
  const where: (SQL | undefined)[] = [
    query.status ? eq(schema.users.status, query.status) : undefined,
    query.q
      ? sql`(${schema.users.displayName} ilike ${contains(query.q)} or ${schema.users.email} ilike ${contains(query.q)})`
      : undefined,
  ];
  const rows = await db
    .select(userColumns)
    .from(schema.users)
    .where(and(...where))
    .orderBy(
      sql`(${schema.users.status} = 'deleted')`,
      desc(schema.users.createdAt),
      asc(schema.users.id),
    )
    .limit(query.limit + 1)
    .offset(offset);
  const page = toPage(rows, offset, query.limit);
  return { items: page.items.map(toAdminUser), nextCursor: page.nextCursor };
}

/** AD7 workspaces: most recently used first. `q` matches the name. */
export async function listAdminWorkspaces(
  db: Executor,
  query: { q?: string; cursor?: string; limit: number },
): Promise<Page<AdminWorkspace>> {
  const offset = decodeCursor(query.cursor);
  const rows = await db
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      isPersonal: schema.workspaces.isPersonal,
      lastActiveAt: schema.workspaces.lastActiveAt,
      memberCount: sql<number>`(select count(*)::int from ${schema.memberships} where ${schema.memberships.workspaceId} = "workspaces"."id")`,
      ideaCount: sql<number>`(select count(*)::int from ${schema.ideas} where ${schema.ideas.workspaceId} = "workspaces"."id")`,
    })
    .from(schema.workspaces)
    .where(query.q ? sql`${schema.workspaces.name} ilike ${contains(query.q)}` : undefined)
    .orderBy(
      sql`${schema.workspaces.lastActiveAt} desc nulls last`,
      asc(schema.workspaces.name),
      asc(schema.workspaces.id),
    )
    .limit(query.limit + 1)
    .offset(offset);
  const page = toPage(rows, offset, query.limit);
  const owners = page.items.length
    ? await db
        .select({
          workspaceId: schema.memberships.workspaceId,
          id: schema.users.id,
          displayName: schema.users.displayName,
          avatarUrl: schema.users.avatarUrl,
          status: schema.users.status,
        })
        .from(schema.memberships)
        .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
        .where(
          and(
            inArray(
              schema.memberships.workspaceId,
              page.items.map((w) => w.id),
            ),
            eq(schema.memberships.role, "owner"),
          ),
        )
        .orderBy(asc(schema.memberships.createdAt), asc(schema.users.id))
    : [];
  return {
    items: page.items.map((w) => ({
      id: w.id,
      name: w.name,
      isPersonal: w.isPersonal,
      owners: owners.filter((o) => o.workspaceId === w.id).map((o) => toUserRef(o)),
      memberCount: w.memberCount,
      ideaCount: w.ideaCount,
      lastActiveAt: isoOrNull(w.lastActiveAt),
    })),
    nextCursor: page.nextCursor,
  };
}
