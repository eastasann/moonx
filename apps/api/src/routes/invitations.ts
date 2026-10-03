import { schema } from "@moonx/db";
import { invitationResultSchema } from "@moonx/schemas";
import { eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import { type AccessInput, accessPlugin } from "../access";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import type { Tx } from "../lib/db";
import { toInvitations } from "../lib/invitation-dto";
import { reissueInvitation } from "../lib/invitation-issue";
import { INVITATION_TTL_DAYS } from "../lib/invitation-token";
import { enforceRateLimit } from "../lib/rate-limit";
import { invitationMail } from "../mail/mailer";

const params = z.object({ invitationId: z.uuid() });

/** W5 and W7 (SDD 5.5): the Owner of the invitation's workspace, or an Admin for any invitation. */
export function invitationRoutes(ctx: AppContext) {
  const { db } = ctx;

  /**
   * The workspace of the invitation, which its Owner manages; `null` for an operator, who may
   * manage any invitation (W5, W7), and 403 for anyone else on an operator invitation.
   */
  async function invitationScope({ params, user }: AccessInput) {
    const [row] = await db
      .select({ workspaceId: schema.invitations.workspaceId })
      .from(schema.invitations)
      .where(eq(schema.invitations.id, params.invitationId));
    if (!row) throw new ApiError("NOT_FOUND", "Invitation not found");
    if (user.isAdmin) return null;
    if (!row.workspaceId) throw new ApiError("FORBIDDEN", "Only an Owner can manage invitations");
    return { workspaceId: row.workspaceId };
  }
  const manage = { to: invitationScope, need: "owner" } as const;

  /** Locks the row and checks the state it is in. */
  async function lockInvitation(tx: Tx, invitationId: string) {
    const [row] = await tx
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.id, invitationId))
      .for("update");
    if (!row) throw new ApiError("NOT_FOUND", "Invitation not found");
    if (row.status === "accepted") {
      throw new ApiError("INVITATION_ALREADY_ACCEPTED", "The invitation was already accepted");
    }
    if (row.status === "revoked")
      throw new ApiError("INVITATION_INVALID", "The invitation was revoked");
    return row;
  }

  return new Elysia({ name: "moonx-invitations" })
    .use(accessPlugin(ctx))
    .post(
      "/invitations/:invitationId/resend",
      async ({ params: p, user }) =>
        db.transaction(async (tx) => {
          const current = await lockInvitation(tx, p.invitationId);
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
          return { invitation: invitation as NonNullable<typeof invitation> };
        }),
      { params, response: { 200: invitationResultSchema }, located: manage },
    )
    .delete(
      "/invitations/:invitationId",
      async ({ params: p, set }) => {
        await db.transaction(async (tx) => {
          const current = await lockInvitation(tx, p.invitationId);
          await tx
            .update(schema.invitations)
            .set({ status: "revoked" })
            .where(eq(schema.invitations.id, current.id));
        });
        set.status = 204;
      },
      { params, located: manage },
    );
}
