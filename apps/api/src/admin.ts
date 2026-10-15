import {
  createInvitationToken,
  type Database,
  type DatabaseTransaction,
  hashInvitationToken,
  INVITATION_VALID_MS,
  ideas,
  invitations,
  memberships,
  sessions,
  users,
  workspaces,
} from "@moonx/db";
import {
  type AdminUser,
  type AdminWorkspace,
  adminInvitationCreateSchema,
  adminInvitationListQuerySchema,
  adminInvitationPageSchema,
  adminInvitationResultSchema,
  adminUserListQuerySchema,
  adminUserPageSchema,
  adminUserParamsSchema,
  adminUserSchema,
  adminWorkspaceListQuerySchema,
  adminWorkspacePageSchema,
  errorBodySchema,
  uuidSchema,
} from "@moonx/schemas";
import {
  and,
  asc,
  count,
  eq,
  inArray,
  isNull,
  type SQL,
  sql,
} from "drizzle-orm";
import { Elysia } from "elysia";
import type { AccessPlugin } from "./access";
import type { Config } from "./config";
import { requestContext } from "./entry";
import { ApiError } from "./errors";
import {
  advisoryLock,
  lockActiveCaller,
  lockInvitations,
  userLockKey,
} from "./lock";
import type { Mailer } from "./mail";
import type { RateLimiter } from "./rate-limit";
import { isValidInvitation } from "./registration";
import { loadUserRefs } from "./user-refs";
import {
  countInvitationSend,
  invitationLink,
  inviterNameOf,
  loadInvitation,
  loadInvitations,
  refuseDuplicate,
  sendInvitationMail,
} from "./workspace-invitations";

// AD7–AD9 (SDD 5.13): 28, the users, workspaces and invitations of the whole service.
// Operators see how much each is used, never what is inside (design-spec 6.17).

type Executor = Database | DatabaseTransaction;

/** Whether `column` holds `words`, ignoring case: 28's search box. */
const holds = (column: SQL | typeof users.email, words: string) =>
  sql`strpos(lower(${column}), lower(${words})) > 0`;

/** A page of a list sorted in SQL: one row more than asked tells whether more follow. */
const pageOf = <T>(rows: T[], offset: number, limit: number) => ({
  items: rows.slice(0, limit),
  nextCursor: rows.length > limit ? String(offset + limit) : null,
});

/** The users matching `where` as 28 lists them: deleted ones last, the rest by name. */
async function loadUsers(
  db: Executor,
  where: SQL | undefined,
  page: { offset: number; limit: number },
): Promise<AdminUser[]> {
  // Each count has a name of its own: Drizzle refers to it by that name alone.
  const workspaceCount = db
    .select({ userId: memberships.userId, n: count().as("workspaces_n") })
    .from(memberships)
    .groupBy(memberships.userId)
    .as("workspace_count");
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
      status: users.status,
      isAdmin: users.isAdmin,
      workspaceCount: workspaceCount.n,
    })
    .from(users)
    .leftJoin(workspaceCount, eq(workspaceCount.userId, users.id))
    .where(where)
    .orderBy(
      sql`${users.status} = 'deleted'`,
      sql`lower(${users.displayName})`,
      sql`lower(${users.email})`,
      asc(users.id),
    )
    .limit(page.limit)
    .offset(page.offset);
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    workspaceCount: row.workspaceCount ?? 0,
  }));
}

/** The user `userId` as 28 lists them. */
async function loadUser(db: Executor, userId: string): Promise<AdminUser> {
  const [user] = await loadUsers(db, eq(users.id, userId), {
    offset: 0,
    limit: 1,
  });
  if (user === undefined) throw new Error(`No user ${userId}`);
  return user;
}

/** The workspaces matching `where` as 28 lists them, by name. */
async function loadWorkspaces(
  db: Executor,
  where: SQL | undefined,
  page: { offset: number; limit: number },
): Promise<AdminWorkspace[]> {
  const memberCount = db
    .select({
      workspaceId: memberships.workspaceId,
      n: count().as("members_n"),
    })
    .from(memberships)
    .groupBy(memberships.workspaceId)
    .as("member_count");
  // Ideas whose creation was undone are gone (SDD 5.1); archived ones are not.
  const ideaCount = db
    .select({ workspaceId: ideas.workspaceId, n: count().as("ideas_n") })
    .from(ideas)
    .where(isNull(ideas.deletedAt))
    .groupBy(ideas.workspaceId)
    .as("idea_count");
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      isPersonal: workspaces.isPersonal,
      lastActiveAt: workspaces.lastActiveAt,
      memberCount: memberCount.n,
      ideaCount: ideaCount.n,
    })
    .from(workspaces)
    .leftJoin(memberCount, eq(memberCount.workspaceId, workspaces.id))
    .leftJoin(ideaCount, eq(ideaCount.workspaceId, workspaces.id))
    .where(where)
    .orderBy(sql`lower(${workspaces.name})`, asc(workspaces.id))
    .limit(page.limit)
    .offset(page.offset);
  const owners =
    rows.length === 0
      ? []
      : await db
          .select({
            workspaceId: memberships.workspaceId,
            userId: memberships.userId,
          })
          .from(memberships)
          .where(
            and(
              inArray(
                memberships.workspaceId,
                rows.map((row) => row.id),
              ),
              eq(memberships.role, "owner"),
            ),
          );
  // Seen from no workspace (SDD 5.2 UserRef): a suspended Owner shows as one.
  const refs = await loadUserRefs(
    db,
    owners.map((owner) => owner.userId),
    null,
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isPersonal: row.isPersonal,
    owners: owners
      .filter((owner) => owner.workspaceId === row.id)
      .flatMap((owner) => {
        const ref = refs.get(owner.userId);
        return ref === undefined ? [] : [ref];
      })
      .toSorted(
        (a, b) =>
          a.displayName.localeCompare(b.displayName, "en", {
            sensitivity: "base",
          }) || a.id.localeCompare(b.id),
      ),
    memberCount: row.memberCount ?? 0,
    ideaCount: row.ideaCount ?? 0,
    lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
  }));
}

/** What the operator routes of 28 need from the app. */
export interface AdminRoutesOptions {
  access: AccessPlugin;
  config: Pick<Config, "betterAuthUrl">;
  db: Database;
  mailer: Mailer;
  limiter: RateLimiter;
  now: () => number;
}

const errors = {
  401: errorBodySchema,
  403: errorBodySchema,
  422: errorBodySchema,
} as const;

/** AD7–AD9 (SDD 5.13): 28. Operators only. */
export function adminRoutes({
  access,
  config,
  db,
  mailer,
  limiter,
  now,
}: AdminRoutesOptions) {
  /**
   * The user of AD8, read again under `tx`'s locks. A deleted account takes no action
   * (design-spec 6.17), so it answers as if it were not there.
   *
   * @throws {ApiError} NOT_FOUND
   */
  const lockUser = async (tx: DatabaseTransaction, userId: string) => {
    // The user's own writes finish first, or find the change (SDD 7.1「停止・削除したユ
    // ーザー」): the lock U7 and lockActiveCaller take, then the row Better Auth's
    // session hooks read (5.4「ログインの制限」).
    await advisoryLock(tx, userLockKey(userId));
    const [user] = await tx
      .select({ id: users.id, status: users.status })
      .from(users)
      .where(eq(users.id, userId))
      .for("no key update");
    if (user === undefined || user.status === "deleted") {
      throw new ApiError("NOT_FOUND", `No user ${userId}`);
    }
    return user;
  };

  const userIdOf = (id: string) => {
    if (!uuidSchema.safeParse(id).success) {
      throw new ApiError("NOT_FOUND", `No user ${id}`);
    }
    return id.toLowerCase();
  };

  return new Elysia()
    .use(access)
    .get(
      "/api/v1/admin/users",
      async ({ query }) => {
        const offset = query.cursor ?? 0;
        const where = and(
          query.q === undefined || query.q === ""
            ? undefined
            : sql`(${holds(sql`${users.displayName}`, query.q)} or ${holds(users.email, query.q)})`,
          query.status === undefined
            ? undefined
            : eq(users.status, query.status),
        );
        const rows = await loadUsers(db, where, {
          offset,
          limit: query.limit + 1,
        });
        return pageOf(rows, offset, query.limit);
      },
      {
        operator: true,
        query: adminUserListQuerySchema,
        response: { 200: adminUserPageSchema, ...errors },
        detail: {
          summary: "AD7 The users (28)",
          description:
            "Deleted users last, the others by name. q looks for words in the name or the address, ignoring case; status keeps one state. Nothing of what they wrote.",
        },
      },
    )
    .get(
      "/api/v1/admin/workspaces",
      async ({ query }) => {
        const offset = query.cursor ?? 0;
        const rows = await loadWorkspaces(
          db,
          query.q === undefined || query.q === ""
            ? undefined
            : holds(sql`${workspaces.name}`, query.q),
          { offset, limit: query.limit + 1 },
        );
        return pageOf(rows, offset, query.limit);
      },
      {
        operator: true,
        query: adminWorkspaceListQuerySchema,
        response: { 200: adminWorkspacePageSchema, ...errors },
        detail: {
          summary: "AD7 The workspaces (28)",
          description:
            "By name. q looks for words in the name, ignoring case. Ideas count those not undone, archived ones included.",
        },
      },
    )
    .get(
      "/api/v1/admin/invitations",
      async ({ query }) => {
        const at = new Date(now());
        const offset = query.cursor ?? 0;
        const rows = await loadInvitations(
          db,
          query.status === "pending" ? isValidInvitation(at) : undefined,
          at,
          { page: { offset, limit: query.limit + 1 }, operator: true },
        );
        return pageOf(rows, offset, query.limit);
      },
      {
        operator: true,
        query: adminInvitationListQuerySchema,
        response: { 200: adminInvitationPageSchema, ...errors },
        detail: {
          summary: "AD7 The invitations (28)",
          description:
            "Of every workspace and of none, newest first. status=pending (the default) lists those that can still be accepted; all adds accepted, revoked and expired ones, as W4 GET does.",
        },
      },
    )
    .post(
      "/api/v1/admin/users/:userId/suspend",
      async ({ params, caller }) => {
        const userId = userIdOf(params.userId);
        if (userId === caller.id) {
          throw new ApiError(
            "CANNOT_SUSPEND_SELF",
            "An operator cannot suspend themselves",
          );
        }
        const at = new Date(now());
        await db.transaction(async (tx) => {
          const user = await lockUser(tx, userId);
          if (user.status === "suspended") return;
          await tx
            .update(users)
            .set({ status: "suspended", updatedAt: at })
            .where(eq(users.id, userId));
          // Signed out everywhere; the password and a reset link stay for the resumption
          // (SDD 5.4「ログインの制限」). No notification is made (design-spec 6.17).
          await tx.delete(sessions).where(eq(sessions.userId, userId));
        });
        return loadUser(db, userId);
      },
      {
        operator: true,
        params: adminUserParamsSchema,
        response: {
          200: adminUserSchema,
          ...errors,
          404: errorBodySchema,
        },
        detail: {
          summary: "AD8 Suspend a user (28)",
          description:
            "Ends their sessions and refuses their sign-in until resumed; memberships, shares and assignments stay. Suspending a suspended user changes nothing. 422 CANNOT_SUSPEND_SELF for the caller; 404 NOT_FOUND for a deleted account.",
        },
      },
    )
    .post(
      "/api/v1/admin/users/:userId/reactivate",
      async ({ params }) => {
        const userId = userIdOf(params.userId);
        const at = new Date(now());
        await db.transaction(async (tx) => {
          const user = await lockUser(tx, userId);
          if (user.status === "active") return;
          await tx
            .update(users)
            .set({ status: "active", updatedAt: at })
            .where(eq(users.id, userId));
        });
        return loadUser(db, userId);
      },
      {
        operator: true,
        params: adminUserParamsSchema,
        response: {
          200: adminUserSchema,
          ...errors,
          404: errorBodySchema,
        },
        detail: {
          summary: "AD8 Resume a suspended user (28)",
          description:
            "They may sign in again, with everything as it was. Resuming an active user changes nothing. 404 NOT_FOUND for a deleted account.",
        },
      },
    )
    .post(
      "/api/v1/admin/invitations",
      async ({ body, caller, request, status }) => {
        const at = new Date(now());
        const { requestId } = requestContext(request);
        const workspaceId = body.workspaceId?.toLowerCase() ?? null;
        const { id, token } = await db.transaction(async (tx) => {
          await lockActiveCaller(tx, caller.id);
          await lockInvitations(tx, workspaceId);
          const [workspace] =
            workspaceId === null
              ? [null]
              : await tx
                  .select({ name: workspaces.name })
                  .from(workspaces)
                  .where(eq(workspaces.id, workspaceId));
          if (workspace === undefined) {
            throw new ApiError("NOT_FOUND", `No workspace ${workspaceId}`);
          }
          await refuseDuplicate(tx, { workspaceId, email: body.email }, at);
          await countInvitationSend(limiter, caller, tx);
          const token = createInvitationToken();
          const [invitation] = await tx
            .insert(invitations)
            .values({
              workspaceId,
              email: body.email,
              role: body.role ?? null,
              // Only `make admin-create` makes operators (SDD 7.1「運営者」).
              grantsAdmin: false,
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
          // Inside the transaction: if Resend does not take the mail, the invitation is
          // not created either (SDD 5.5).
          await sendInvitationMail(
            mailer,
            config.betterAuthUrl,
            {
              to: body.email,
              token,
              workspace:
                workspace === null || body.role === undefined
                  ? null
                  : { name: workspace.name, role: body.role },
              inviterName: await inviterNameOf(tx, caller.id),
            },
            requestId,
          );
          return { id: invitation.id, token };
        });
        return status(201, {
          invitation: await loadInvitation(db, id, at, { operator: true }),
          link: invitationLink(config.betterAuthUrl, token),
        });
      },
      {
        operator: true,
        body: adminInvitationCreateSchema,
        parse: "json",
        response: {
          201: adminInvitationResultSchema,
          ...errors,
          404: errorBodySchema,
          409: errorBodySchema,
          429: errorBodySchema,
          503: errorBodySchema,
        },
        detail: {
          summary: "AD9 Invite someone (28)",
          description:
            "To a workspace with a role, or to none (whoever accepts gets their personal workspace only, never operator rights). Mails the link and answers with it too, so the operator may hand it over. Refuses as W4 POST does: 409 ALREADY_MEMBER, 409 INVITATION_PENDING, 429 RATE_LIMITED (W4, W5 and AD9 together per user), 503 UPSTREAM_UNAVAILABLE without making the invitation. 404 NOT_FOUND for a workspace that does not exist.",
        },
      },
    );
}
