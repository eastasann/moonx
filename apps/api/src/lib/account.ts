import { schema } from "@moonx/db";
import type { Me } from "@moonx/schemas";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Auth } from "../auth";
import { ApiError } from "../errors";
import type { HistoryActor } from "../history/with-history";
import type { Db, Executor, Tx } from "./db";
import { releaseMemberDuties } from "./workspace-members";

/** How recent a sign-in must be for U7 and U8 when there is no password to ask for (design-spec 6.16). */
export const REAUTH_WINDOW_MS = 10 * 60 * 1000;

/** U1: the signed-in user with the workspaces they belong to. */
export async function loadMe(db: Executor, userId: string): Promise<Me> {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new ApiError("UNAUTHENTICATED", "Sign in required");
  const memberships = await db
    .select({
      id: schema.workspaces.id,
      name: schema.workspaces.name,
      isPersonal: schema.workspaces.isPersonal,
      currency: schema.workspaces.currency,
      role: schema.memberships.role,
    })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(eq(schema.memberships.userId, userId))
    .orderBy(
      desc(schema.workspaces.isPersonal),
      asc(schema.workspaces.name),
      asc(schema.workspaces.id),
    );
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
    timezone: user.timezone,
    theme: user.theme,
    isAdmin: user.isAdmin,
    hasPassword: await credentialHash(db, userId).then((hash) => hash !== null),
    lastWorkspaceId: user.lastWorkspaceId,
    memberships: memberships.map((m) => ({
      workspace: { id: m.id, name: m.name, isPersonal: m.isPersonal, currency: m.currency },
      role: m.role,
    })),
  };
}

/** The stored hash of the email-and-password sign-in, or null for people who only use Google. */
export async function credentialHash(db: Executor, userId: string): Promise<string | null> {
  const [account] = await db
    .select({ password: schema.accounts.password })
    .from(schema.accounts)
    .where(and(eq(schema.accounts.userId, userId), eq(schema.accounts.providerId, "credential")));
  return account?.password ?? null;
}

/** 403 REAUTH_REQUIRED unless the session was created within {@link REAUTH_WINDOW_MS}. */
export function requireRecentSignIn(sessionCreatedAt: Date, now: Date): void {
  if (now.getTime() - sessionCreatedAt.getTime() > REAUTH_WINDOW_MS) {
    throw new ApiError("REAUTH_REQUIRED", "Sign in again to continue");
  }
}

const DELETED_NAME = "Deleted user";

/** The change a person's email gets when the account is deleted: unique, and nobody's address. */
export const deletedEmail = (userId: string) => `deleted+${userId}@deleted.invalid`;

/**
 * U7 (SDD 5.4, design-spec 6.16). The `users` row stays because team records refer to it; what
 * identifies the person goes. Runs in the caller's transaction so a failure leaves everything
 * as it was. Better Auth's own `deleteUser` is not used: it deletes the row. Returns the photo
 * URL for the caller to delete once the transaction has committed: storage cannot roll back.
 */
export async function eraseAccount(
  tx: Tx,
  user: { id: string; displayName: string },
  actor: HistoryActor,
): Promise<{ avatarUrl: string | null }> {
  const memberships = await tx
    .select({
      workspaceId: schema.memberships.workspaceId,
      role: schema.memberships.role,
      name: schema.workspaces.name,
      isPersonal: schema.workspaces.isPersonal,
    })
    .from(schema.memberships)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.memberships.workspaceId))
    .where(eq(schema.memberships.userId, user.id))
    .orderBy(asc(schema.workspaces.name));
  const ids = memberships.map((m) => m.workspaceId);
  // Lock every membership of those workspaces so two Owners deleting at once cannot both pass.
  const everyone =
    ids.length === 0
      ? []
      : await tx
          .select({
            workspaceId: schema.memberships.workspaceId,
            userId: schema.memberships.userId,
            role: schema.memberships.role,
          })
          .from(schema.memberships)
          .where(inArray(schema.memberships.workspaceId, ids))
          .for("update");
  const othersIn = (workspaceId: string) =>
    everyone.filter((m) => m.workspaceId === workspaceId && m.userId !== user.id);
  const blocking = memberships.filter(
    (m) =>
      m.role === "owner" &&
      othersIn(m.workspaceId).length > 0 &&
      !othersIn(m.workspaceId).some((o) => o.role === "owner"),
  );
  if (blocking.length > 0) {
    throw new ApiError("LAST_OWNER", "Make someone else Owner first", {
      workspaces: blocking.map((m) => ({ id: m.workspaceId, name: m.name })),
    });
  }

  // Only a personal workspace nobody else belongs to goes with its content. A team workspace
  // stays even when this person was its only member: it is the team's record (design-spec 6.16),
  // so only the membership is removed and the workspace is left without members.
  const doomed = memberships
    .filter((m) => m.isPersonal && othersIn(m.workspaceId).length === 0)
    .map((m) => m.workspaceId);
  for (const m of memberships) {
    if (doomed.includes(m.workspaceId)) continue;
    // What was assigned to this person reads "Deleted user" from now on (design-spec 6.16).
    await releaseMemberDuties(tx, m.workspaceId, { id: user.id, displayName: DELETED_NAME }, actor);
    await tx
      .delete(schema.memberships)
      .where(
        and(
          eq(schema.memberships.workspaceId, m.workspaceId),
          eq(schema.memberships.userId, user.id),
        ),
      );
  }
  if (doomed.length > 0) {
    await tx.delete(schema.workspaces).where(inArray(schema.workspaces.id, doomed));
  }

  // Self analysis: answers, shares and history go, and so do the comments left on it.
  const [analysis] = await tx
    .select({ id: schema.selfAnalyses.id })
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.userId, user.id));
  if (analysis) {
    await tx
      .delete(schema.comments)
      .where(
        and(
          eq(schema.comments.targetType, "self_analysis_answer"),
          eq(schema.comments.targetId, analysis.id),
        ),
      );
    await tx.delete(schema.selfAnalyses).where(eq(schema.selfAnalyses.id, analysis.id));
  }
  await tx.delete(schema.changeHistory).where(eq(schema.changeHistory.ownerUserId, user.id));

  await tx.delete(schema.notifications).where(eq(schema.notifications.userId, user.id));
  await tx
    .update(schema.invitations)
    .set({ status: "revoked" })
    .where(
      and(eq(schema.invitations.invitedById, user.id), eq(schema.invitations.status, "pending")),
    );
  // Reset-password tokens are keyed by the user id in `value`.
  await tx.delete(schema.verifications).where(eq(schema.verifications.value, user.id));
  await tx.delete(schema.sessions).where(eq(schema.sessions.userId, user.id));
  await tx.delete(schema.accounts).where(eq(schema.accounts.userId, user.id));

  const [row] = await tx
    .select({ avatarUrl: schema.users.avatarUrl })
    .from(schema.users)
    .where(eq(schema.users.id, user.id));
  await tx
    .update(schema.users)
    .set({
      email: deletedEmail(user.id),
      displayName: DELETED_NAME,
      avatarUrl: null,
      status: "deleted",
      lastWorkspaceId: null,
    })
    .where(eq(schema.users.id, user.id));
  return { avatarUrl: row?.avatarUrl ?? null };
}

/**
 * `Set-Cookie` values that expire the session cookies in the browser. The sessions are already
 * deleted by then, so Better Auth's sign-out has no session left to look up.
 */
export async function expiredSessionCookies(auth: Auth): Promise<string[]> {
  const { authCookies } = await auth.$context;
  return [authCookies.sessionToken, authCookies.sessionData, authCookies.dontRememberToken].map(
    ({ name, attributes }) =>
      [
        `${name}=`,
        "Max-Age=0",
        `Path=${attributes.path ?? "/"}`,
        "HttpOnly",
        `SameSite=${attributes.sameSite ?? "Lax"}`,
        ...(attributes.secure ? ["Secure"] : []),
      ].join("; "),
  );
}

/** Whether another account already uses this address (compared without case). */
export async function emailInUse(db: Db | Tx, email: string): Promise<boolean> {
  const [row] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        sql`lower(${schema.users.email}) = ${email.toLowerCase()}`,
        ne(schema.users.status, "deleted"),
      ),
    );
  return Boolean(row);
}
