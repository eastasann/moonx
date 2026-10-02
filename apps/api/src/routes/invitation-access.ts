import { schema } from "@moonx/db";
import {
  acceptInvitationResponseSchema,
  invitationPreviewSchema,
  invitationSignUpBodySchema,
} from "@moonx/schemas";
import { and, eq } from "drizzle-orm";
import { Elysia } from "elysia";
import { z } from "zod";
import type { AppContext } from "../context";
import { ApiError } from "../errors";
import { emailInUse, loadMe } from "../lib/account";
import type { Executor } from "../lib/db";
import { iso } from "../lib/dto";
import { reportable } from "../lib/error-report";
import { hashInvitationToken } from "../lib/invitation-token";
import { provisionNewUser } from "../lib/provision";
import { enforceRateLimit } from "../lib/rate-limit";
import { clientIp } from "../lib/request-info";
import { authPlugin } from "../plugins";

const tokenParams = z.object({ token: z.string().min(1).max(200) });

/**
 * U4-U6 (SDD 5.4): what an invitation link does. U4 and U5 are public and U6 needs a session.
 * Every "no such invitation" reason (unknown, revoked, expired) is one 410 answer, so the
 * response does not tell a guesser which tokens once existed.
 */
export function invitationAccessRoutes(ctx: AppContext) {
  const { db, auth } = ctx;

  async function findByToken(executor: Executor, token: string, lock = false) {
    const query = executor
      .select()
      .from(schema.invitations)
      .where(eq(schema.invitations.tokenHash, hashInvitationToken(token)));
    const [row] = await (lock ? query.for("update") : query);
    return row ?? null;
  }

  /**
   * Unknown, revoked and expired links are 410; an accepted one is still readable (U4). A row can
   * be stored as `expired` or be `pending` past its date: nothing rewrites it when time passes.
   */
  function usable(row: Awaited<ReturnType<typeof findByToken>>, now: Date) {
    if (!row) return null;
    if (row.status === "accepted") return row;
    if (row.status === "pending" && row.expiresAt.getTime() > now.getTime()) return row;
    return null;
  }

  const invalid = () => new ApiError("INVITATION_INVALID", "This invitation is invalid or expired");

  const publicRoutes = new Elysia({ name: "moonx-invitation-public" })
    .get(
      "/invitations/by-token/:token",
      async ({ params }) => {
        const row = usable(await findByToken(db, params.token), ctx.now());
        if (!row) throw invalid();
        const [workspace] = row.workspaceId
          ? await db
              .select({ id: schema.workspaces.id, name: schema.workspaces.name })
              .from(schema.workspaces)
              .where(eq(schema.workspaces.id, row.workspaceId))
          : [];
        const [inviter] = row.invitedById
          ? await db
              .select({ displayName: schema.users.displayName })
              .from(schema.users)
              .where(eq(schema.users.id, row.invitedById))
          : [];
        return {
          status: row.status === "accepted" ? ("accepted" as const) : ("pending" as const),
          email: row.email,
          workspace: workspace ?? null,
          role: row.role,
          invitedBy: inviter ?? null,
          expiresAt: iso(row.expiresAt),
          accountExists: await emailInUse(db, row.email),
        };
      },
      { params: tokenParams, response: { 200: invitationPreviewSchema } },
    )
    .post(
      "/invitations/by-token/:token/sign-up",
      async ({ params, body, request }) => {
        const now = ctx.now();
        await enforceRateLimit(db, "signUp", clientIp(request), now.getTime());
        const row = usable(await findByToken(db, params.token), now);
        if (row?.status !== "pending") throw invalid();
        if (await emailInUse(db, row.email)) {
          throw new ApiError("EMAIL_TAKEN", "An account with this email already exists");
        }
        const password = await (await auth.$context).password.hash(body.password);
        const email = row.email.toLowerCase();
        const userId = await db
          .transaction(async (tx) => {
            const [created] = await tx
              .insert(schema.users)
              .values({
                email,
                emailVerified: true,
                displayName: body.displayName,
                timezone: body.timezone,
              })
              .returning({ id: schema.users.id });
            const id = (created as NonNullable<typeof created>).id;
            await tx.insert(schema.accounts).values({
              userId: id,
              accountId: id,
              providerId: "credential",
              password,
            });
            await provisionNewUser(tx, { id, email, displayName: body.displayName }, now);
            return id;
          })
          .catch((error: unknown) => {
            // Two requests for one address race past the check above; the unique index decides.
            if (reportable(error).code === "23505") {
              throw new ApiError("EMAIL_TAKEN", "An account with this email already exists");
            }
            throw error;
          });
        const signedIn = await auth.api.signInEmail({
          body: { email, password: body.password },
          headers: request.headers,
          asResponse: true,
        });
        if (!signedIn.ok) throw new ApiError("INTERNAL", "Signing in after sign-up failed");
        const headers = new Headers({ "content-type": "application/json" });
        for (const cookie of signedIn.headers.getSetCookie()) headers.append("set-cookie", cookie);
        return new Response(JSON.stringify({ me: await loadMe(db, userId) }), {
          status: 201,
          headers,
        });
      },
      { params: tokenParams, body: invitationSignUpBodySchema },
    );

  const protectedRoutes = new Elysia({ name: "moonx-invitation-accept" }).use(authPlugin(ctx)).post(
    "/invitations/by-token/:token/accept",
    ({ params, user }) =>
      db.transaction(async (tx) => {
        const now = ctx.now();
        const row = usable(await findByToken(tx, params.token, true), now);
        if (!row) throw invalid();
        if (row.email.toLowerCase() !== user.email.toLowerCase()) {
          throw new ApiError("INVITATION_EMAIL_MISMATCH", "This invitation is for another email", {
            invitedEmail: row.email,
          });
        }
        if (row.status === "accepted") {
          throw new ApiError("INVITATION_ALREADY_ACCEPTED", "The invitation was already accepted");
        }
        let alreadyMember = false;
        if (row.workspaceId && row.role) {
          const inserted = await tx
            .insert(schema.memberships)
            .values({ workspaceId: row.workspaceId, userId: user.id, role: row.role })
            .onConflictDoNothing()
            .returning({ id: schema.memberships.id });
          alreadyMember = inserted.length === 0;
        } else {
          await tx.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, user.id));
        }
        await tx
          .update(schema.invitations)
          .set({ status: "accepted", acceptedById: user.id, acceptedAt: now })
          .where(and(eq(schema.invitations.id, row.id), eq(schema.invitations.status, "pending")));
        return { workspaceId: row.workspaceId, alreadyMember };
      }),
    { params: tokenParams, response: { 200: acceptInvitationResponseSchema } },
  );

  return new Elysia({ name: "moonx-invitation-access" }).use(publicRoutes).use(protectedRoutes);
}
