import { schema } from "@moonx/db";
import {
  adminInvitationsPageSchema,
  adminInvitationsQuerySchema,
  adminUserSchema,
  adminUsersPageSchema,
  adminUsersQuerySchema,
  adminWorkspacesPageSchema,
  adminWorkspacesQuerySchema,
  createAdminInvitationBodySchema,
  invitationWithLinkSchema,
} from "@moonx/schemas";
import { and, desc, eq, gt, lte, or } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { operatorPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { listAdminUsers, listAdminWorkspaces, loadAdminUser } from "../lib/admin-directory";
import { toInvitations } from "../lib/invitation-dto";
import { issueInvitation } from "../lib/invitation-issue";
import { decodeCursor, toPage } from "../lib/page";
import { adminTemplateRoutes } from "./admin-templates";

const userParams = z.object({ userId: z.uuid() });

/** AD1-AD9 (SDD 5.13). Operators see counts and dates, never the content of a workspace. */
export function adminRoutes(ctx: AppContext) {
  const { db } = ctx;

  /**
   * Changes `status` of a user in one transaction. Repeating a request is not an error: it
   * answers 200 with the current state (suspending a suspended user still clears any session
   * that was created meanwhile). A deleted user is not editable (design-spec 6.17: no actions).
   */
  async function setStatus(userId: string, status: "active" | "suspended") {
    await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: schema.users.status })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .for("update");
      if (!row) throw new ApiError("NOT_FOUND", "User not found");
      if (row.status === "deleted") {
        throw new ApiError("NOT_EDITABLE", "A deleted user cannot be changed");
      }
      if (row.status !== status) {
        await tx.update(schema.users).set({ status }).where(eq(schema.users.id, userId));
      }
      if (status === "suspended") {
        await tx.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
      }
    });
    return (await loadAdminUser(db, userId)) as NonNullable<
      Awaited<ReturnType<typeof loadAdminUser>>
    >;
  }

  return new Elysia({ name: "moonx-admin" })
    .use(adminTemplateRoutes(ctx))
    .use(operatorPlugin(ctx))
    .guard({ operator: true })
    .get("/admin/users", ({ query }) => listAdminUsers(db, query), {
      query: adminUsersQuerySchema,
      response: { 200: adminUsersPageSchema },
    })
    .get("/admin/workspaces", ({ query }) => listAdminWorkspaces(db, query), {
      query: adminWorkspacesQuerySchema,
      response: { 200: adminWorkspacesPageSchema },
    })
    .get(
      "/admin/invitations",
      async ({ query }) => {
        const now = ctx.now();
        const offset = decodeCursor(query.cursor);
        // A pending row past its expiry reads as `expired` (see effectiveInvitationStatus), so the filters look at the expiry too.
        const status = !query.status
          ? undefined
          : query.status === "pending"
            ? and(eq(schema.invitations.status, "pending"), gt(schema.invitations.expiresAt, now))
            : query.status === "expired"
              ? or(
                  eq(schema.invitations.status, "expired"),
                  and(
                    eq(schema.invitations.status, "pending"),
                    lte(schema.invitations.expiresAt, now),
                  ),
                )
              : eq(schema.invitations.status, query.status);
        const rows = await db
          .select()
          .from(schema.invitations)
          .where(status)
          .orderBy(desc(schema.invitations.createdAt), desc(schema.invitations.id))
          .limit(query.limit + 1)
          .offset(offset);
        const page = toPage(rows, offset, query.limit);
        return { items: await toInvitations(db, page.items, now), nextCursor: page.nextCursor };
      },
      { query: adminInvitationsQuerySchema, response: { 200: adminInvitationsPageSchema } },
    )
    .post(
      "/admin/users/:userId/suspend",
      ({ params, user }) => {
        if (params.userId === user.id) {
          throw new ApiError("CANNOT_SUSPEND_SELF", "You cannot suspend your own account");
        }
        return setStatus(params.userId, "suspended");
      },
      { params: userParams, response: { 200: adminUserSchema } },
    )
    .post("/admin/users/:userId/reactivate", ({ params }) => setStatus(params.userId, "active"), {
      params: userParams,
      response: { 200: adminUserSchema },
    })
    .post(
      "/admin/invitations",
      async ({ body, user, set }) => {
        if (body.workspaceId !== undefined) {
          const [workspace] = await db
            .select({ id: schema.workspaces.id })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, body.workspaceId));
          if (!workspace) throw new ApiError("NOT_FOUND", "Workspace not found");
        }
        const result = await issueInvitation(db, {
          publicUrl: ctx.config.publicUrl,
          now: ctx.now(),
          inviter: user,
          email: body.email,
          target:
            body.workspaceId !== undefined && body.role !== undefined
              ? { workspaceId: body.workspaceId, role: body.role }
              : null,
          mailer: ctx.mailer,
          rateLimited: true,
        });
        set.status = 201;
        return result;
      },
      { body: createAdminInvitationBodySchema, response: { 201: invitationWithLinkSchema } },
    );
}
