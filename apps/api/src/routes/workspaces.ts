import { schema } from "@moonx/db";
import {
  createInvitationBodySchema,
  createWorkspaceBodySchema,
  invitationWithLinkSchema,
  listInvitationsQuerySchema,
  memberSchema,
  mentionCandidatesQuerySchema,
  updateMemberBodySchema,
  updateWorkspaceBodySchema,
  type Workspace,
  workspaceSchema,
} from "@moonx/schemas";
import { and, count, desc, eq, gt } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import type { Executor } from "../lib/db";
import { historyActor } from "../lib/dto";
import { toInvitations } from "../lib/invitation-dto";
import { issueInvitation } from "../lib/invitation-issue";
import {
  loadMentionCandidates,
  loadWorkspaceMembers,
  releaseMemberDuties,
  resetLastWorkspace,
} from "../lib/workspace-members";

async function loadWorkspace(
  db: Executor,
  id: string,
  role: Workspace["myRole"],
): Promise<Workspace> {
  const [row] = await db.select().from(schema.workspaces).where(eq(schema.workspaces.id, id));
  if (!row) throw new ApiError("NOT_FOUND", "Workspace not found");
  const [members] = await db
    .select({ n: count() })
    .from(schema.memberships)
    .where(eq(schema.memberships.workspaceId, id));
  return {
    id,
    name: row.name,
    currency: row.currency,
    isPersonal: row.isPersonal,
    myRole: role,
    memberCount: members?.n ?? 0,
  };
}

const workspaceParams = z.object({ workspaceId: z.uuid() });
const memberParams = z.object({
  workspaceId: z.uuid(),
  userId: z.union([z.uuid(), z.literal("me")]),
});

/** W0-W4 and W8 (SDD 5.5). W5-W7 live in `invitations.ts`. */
export function workspaceRoutes(ctx: AppContext) {
  const { db } = ctx;
  return new Elysia({ name: "moonx-workspaces" })
    .use(accessPlugin(ctx))
    .post(
      "/workspaces",
      async ({ body, user, set }) => {
        const id = await db.transaction(async (tx) => {
          const [created] = await tx
            .insert(schema.workspaces)
            .values({
              name: body.name,
              currency: body.currency ?? "PHP",
              isPersonal: false,
              createdById: user.id,
              lastActiveAt: ctx.now(),
            })
            .returning({ id: schema.workspaces.id });
          const workspaceId = (created as { id: string }).id;
          await tx
            .insert(schema.memberships)
            .values({ workspaceId, userId: user.id, role: "owner" });
          await tx
            .update(schema.users)
            .set({ lastWorkspaceId: workspaceId })
            .where(eq(schema.users.id, user.id));
          return workspaceId;
        });
        set.status = 201;
        return loadWorkspace(db, id, "owner");
      },
      { body: createWorkspaceBodySchema, response: { 201: workspaceSchema }, signedIn: true },
    )
    .get(
      "/workspaces/:workspaceId",
      async ({ scope }) => {
        return loadWorkspace(db, scope.workspaceId, scope.role);
      },
      {
        params: z.object({ workspaceId: z.uuid() }),
        response: { 200: workspaceSchema },
        scoped: { to: { workspaceId: "workspaceId" }, need: "member" },
      },
    )
    .patch(
      "/workspaces/:workspaceId",
      async ({ body, scope }) => {
        if (body.name !== undefined || body.currency !== undefined) {
          await db
            .update(schema.workspaces)
            .set(body)
            .where(eq(schema.workspaces.id, scope.workspaceId));
        }
        return loadWorkspace(db, scope.workspaceId, scope.role);
      },
      {
        params: z.object({ workspaceId: z.uuid() }),
        body: updateWorkspaceBodySchema,
        response: { 200: workspaceSchema },
        scoped: { to: { workspaceId: "workspaceId" }, need: "owner" },
      },
    )
    .get(
      "/workspaces/:workspaceId/members",
      async ({ scope }) => {
        return { items: await loadWorkspaceMembers(db, scope.workspaceId, scope.role) };
      },
      {
        params: workspaceParams,
        response: { 200: z.object({ items: z.array(memberSchema) }) },
        scoped: { to: { workspaceId: "workspaceId" }, need: "member" },
      },
    )
    .patch(
      "/workspaces/:workspaceId/members/:userId",
      async ({ params, body, user, request, scope }) => {
        const targetId = params.userId === "me" ? user.id : params.userId;
        await db.transaction(async (tx) => {
          const members = await tx
            .select({ userId: schema.memberships.userId, role: schema.memberships.role })
            .from(schema.memberships)
            .where(eq(schema.memberships.workspaceId, scope.workspaceId))
            .for("update");
          const target = members.find((m) => m.userId === targetId);
          if (!target) throw new ApiError("NOT_FOUND", "Member not found");
          if (target.role === body.role) return;
          const owners = members.filter((m) => m.role === "owner").length;
          if (target.role === "owner" && owners <= 1) {
            throw new ApiError("LAST_OWNER", "A workspace needs at least one Owner");
          }
          await tx
            .update(schema.memberships)
            .set({ role: body.role })
            .where(
              and(
                eq(schema.memberships.workspaceId, scope.workspaceId),
                eq(schema.memberships.userId, targetId),
              ),
            );
          if (body.role === "viewer") {
            const [person] = await tx
              .select({ id: schema.users.id, displayName: schema.users.displayName })
              .from(schema.users)
              .where(eq(schema.users.id, targetId));
            if (person)
              await releaseMemberDuties(tx, scope.workspaceId, person, historyActor(request, user));
          }
        });
        const [member] = await loadWorkspaceMembers(db, scope.workspaceId, scope.role, targetId);
        return member as NonNullable<typeof member>;
      },
      {
        params: z.object({ workspaceId: z.uuid(), userId: z.uuid() }),
        body: updateMemberBodySchema,
        response: { 200: memberSchema },
        scoped: { to: { workspaceId: "workspaceId" }, need: "owner" },
      },
    )
    .delete(
      "/workspaces/:workspaceId/members/:userId",
      async ({ params, user, request, set, scope }) => {
        const targetId = params.userId === "me" ? user.id : params.userId;
        await db.transaction(async (tx) => {
          const [workspace] = await tx
            .select({ isPersonal: schema.workspaces.isPersonal })
            .from(schema.workspaces)
            .where(eq(schema.workspaces.id, scope.workspaceId));
          if (workspace?.isPersonal && targetId === user.id) {
            throw new ApiError("CANNOT_LEAVE_PERSONAL", "A personal workspace cannot be left");
          }
          const members = await tx
            .select({ userId: schema.memberships.userId, role: schema.memberships.role })
            .from(schema.memberships)
            .where(eq(schema.memberships.workspaceId, scope.workspaceId))
            .for("update");
          const target = members.find((m) => m.userId === targetId);
          if (!target) throw new ApiError("NOT_FOUND", "Member not found");
          if (target.role === "owner" && members.filter((m) => m.role === "owner").length <= 1) {
            throw new ApiError("LAST_OWNER", "Make someone else Owner first");
          }
          const [person] = await tx
            .select({ id: schema.users.id, displayName: schema.users.displayName })
            .from(schema.users)
            .where(eq(schema.users.id, targetId));
          if (person)
            await releaseMemberDuties(tx, scope.workspaceId, person, historyActor(request, user));
          await tx
            .delete(schema.memberships)
            .where(
              and(
                eq(schema.memberships.workspaceId, scope.workspaceId),
                eq(schema.memberships.userId, targetId),
              ),
            );
          await resetLastWorkspace(tx, targetId, scope.workspaceId);
        });
        set.status = 204;
      },
      {
        params: memberParams,
        // A member may leave on their own; removing someone else is for Owners.
        scoped: {
          to: { workspaceId: "workspaceId" },
          need: ({ params, user }: AccessInput) =>
            params.userId === "me" || params.userId === user.id ? "member" : "owner",
        },
      },
    )
    .get(
      "/workspaces/:workspaceId/invitations",
      async ({ query, scope }) => {
        const now = ctx.now();
        const rows = await db
          .select()
          .from(schema.invitations)
          .where(
            and(
              eq(schema.invitations.workspaceId, scope.workspaceId),
              (query.status ?? "pending") === "pending"
                ? and(
                    eq(schema.invitations.status, "pending"),
                    gt(schema.invitations.expiresAt, now),
                  )
                : undefined,
            ),
          )
          .orderBy(desc(schema.invitations.createdAt), desc(schema.invitations.id));
        return { items: await toInvitations(db, rows, now) };
      },
      {
        params: workspaceParams,
        query: listInvitationsQuerySchema,
        scoped: { to: { workspaceId: "workspaceId" }, need: "owner" },
      },
    )
    .post(
      "/workspaces/:workspaceId/invitations",
      async ({ body, user, set, scope }) => {
        const { invitation, link } = await issueInvitation(db, {
          publicUrl: ctx.config.publicUrl,
          now: ctx.now(),
          inviter: user,
          email: body.email,
          target: { workspaceId: scope.workspaceId, role: body.role },
          mailer: ctx.mailer,
          rateLimited: true,
        });
        set.status = 201;
        return { invitation, link };
      },
      {
        params: workspaceParams,
        body: createInvitationBodySchema,
        response: { 201: invitationWithLinkSchema },
        scoped: { to: { workspaceId: "workspaceId" }, need: "owner" },
      },
    )
    .get(
      "/workspaces/:workspaceId/mention-candidates",
      async ({ query, scope }) => {
        const target =
          query.targetType && query.targetId
            ? { type: query.targetType, id: query.targetId }
            : null;
        return { items: await loadMentionCandidates(db, scope, target) };
      },
      {
        params: workspaceParams,
        query: mentionCandidatesQuerySchema,
        scoped: { to: { workspaceId: "workspaceId" }, need: "member" },
      },
    );
}
