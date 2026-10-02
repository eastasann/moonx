import { schema } from "@moonx/db";
import { invitationLinkSchema, invitationWithLinkSchema } from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import type { Tx } from "../lib/db";
import { toInvitations } from "../lib/invitation-dto";
import { reissueInvitation } from "../lib/invitation-issue";
import { INVITATION_TTL_DAYS } from "../lib/invitation-token";
import { enforceRateLimit } from "../lib/rate-limit";
import { invitationMail } from "../mail/mailer";
import { authPlugin } from "../plugins";

const params = z.object({ invitationId: z.uuid() });

/** W5-W7 (SDD 5.5): the Owner of the invitation's workspace, or an Admin for any invitation. */
export function invitationRoutes(ctx: AppContext) {
  const { db } = ctx;

  /** Locks the row and checks who may act on it and what state it is in. */
  async function lockInvitation(
    tx: Tx,
    invitationId: string,
    user: { id: string; isAdmin: boolean },
  ) {
    const [row] = await tx
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, invitationId))
      .for("update");
    if (!row) throw new ApiError("NOT_FOUND", "Invitation not found");
    if (!user.isAdmin) {
      const [membership] = row.workspaceId
        ? await tx
            .select({ role: schema.memberships.role })
            .from(schema.memberships)
            .where(
              and(
                eq(schema.memberships.workspaceId, row.workspaceId),
                eq(schema.memberships.userId, user.id),
              ),
            )
        : [];
      if (row.workspaceId && !membership) {
        throw new ApiError("NO_ACCESS", "Not a member of this workspace");
      }
      if (membership?.role !== "owner") {
        throw new ApiError("FORBIDDEN", "Only an Owner can manage invitations");
      }
    }
    if (row.status === "accepted") {
      throw new ApiError("INVITATION_ALREADY_ACCEPTED", "The invitation was already accepted");
    }
    if (row.status === "revoked")
      throw new ApiError("INVITATION_INVALID", "The invitation was revoked");
    return row;
  }

  return new Elysia({ name: "moonx-invitations" })
    .use(authPlugin(ctx))
    .post(
      "/invitations/:invitationId/resend",
      async ({ params: p, user }) =>
        db.transaction(async (tx) => {
          const current = await lockInvitation(tx, p.invitationId, user);
          await enforceRateLimit(tx, "invitation", user.id, ctx.now().getTime());
          const now = ctx.now();
          const { row, link } = await reissueInvitation(tx, current.id, ctx.config.publicUrl, now);
          const [workspace] = row.workspaceId
            ? await tx
                .select({ name: schema.workspaces.name })
                .from(schema.workspaces)
                .where(eq(schema.workspaces.id, row.workspaceId))
            : [];
          await ctx.mailer.send(
            invitationMail({
              to: row.email,
              inviter: user.displayName,
              workspace: workspace && row.role ? { name: workspace.name, role: row.role } : null,
              link,
              expiresInDays: INVITATION_TTL_DAYS,
            }),
          );
          const [invitation] = await toInvitations(tx, [row], now);
          return { invitation: invitation as NonNullable<typeof invitation>, link };
        }),
      { params, response: { 200: invitationWithLinkSchema } },
    )
    .post(
      "/invitations/:invitationId/link",
      async ({ params: p, user }) =>
        db.transaction(async (tx) => {
          const current = await lockInvitation(tx, p.invitationId, user);
          const { link } = await reissueInvitation(tx, current.id, ctx.config.publicUrl, ctx.now());
          return { link };
        }),
      { params, response: { 200: invitationLinkSchema } },
    )
    .delete(
      "/invitations/:invitationId",
      async ({ params: p, user, set }) => {
        await db.transaction(async (tx) => {
          const current = await lockInvitation(tx, p.invitationId, user);
          await tx
            .update(schema.invitations)
            .set({ status: "revoked" })
            .where(eq(schema.invitations.id, current.id));
        });
        set.status = 204;
      },
      { params },
    );
}
