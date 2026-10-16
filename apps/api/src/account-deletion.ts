import {
  accounts,
  businessPlans,
  changeHistory,
  comments,
  type DatabaseTransaction,
  ideas,
  invitations,
  memberships,
  notifications,
  selfAnalyses,
  sessions,
  users,
  verifications,
  workspaces,
} from "@moonx/db";
import { and, asc, eq, inArray, like } from "drizzle-orm";
import type { ClientKind } from "./entry";
import { ApiError } from "./errors";
import { lockActiveCaller } from "./lock";
import { lockMembers, memberCounts, releaseMember } from "./membership";
import { isValidInvitation } from "./registration";

/**
 * Locks `workspaceId`'s ideas, then their plans, in the order every write inside the
 * workspace takes them before it updates the workspace row last (SDD 7.1「実装」).
 * Deleting the workspace row first would hold it while the cascade waits for an idea a
 * write holds, and that write wait for the row: a deadlock.
 */
async function lockContent(
  tx: DatabaseTransaction,
  workspaceId: string,
): Promise<void> {
  const inside = await tx
    .select({ id: ideas.id })
    .from(ideas)
    .where(eq(ideas.workspaceId, workspaceId))
    .orderBy(asc(ideas.id))
    .for("update");
  if (inside.length === 0) return;
  await tx
    .select({ id: businessPlans.id })
    .from(businessPlans)
    .where(
      inArray(
        businessPlans.ideaId,
        inside.map((idea) => idea.id),
      ),
    )
    .orderBy(asc(businessPlans.id))
    .for("update");
}

/** The name a deleted account shows wherever its records remain (SDD 5.4 U7). */
export const DELETED_USER_NAME = "Deleted user";

/**
 * Deletes `userId`'s account as design-spec 6.16「アカウントの削除」and SDD 5.4 U7 say, in
 * the caller's transaction:
 *
 * - The `users` row stays, since the team's records refer to it, with its personal
 *   data replaced; sessions, accounts and password reset tokens go.
 * - The self-analysis goes with its answers, shares, the comments on it and its history.
 * - A personal workspace with nobody else in it goes with everything inside. Every other
 *   workspace loses the member as W3 DELETE removes one, with "Deleted user" as the
 *   assignee's name; a team workspace left without members stays as a record.
 * - The user's notifications go, and the invitations they sent that are still valid are
 *   revoked.
 *
 * The photo file is the caller's to remove once this commits.
 *
 * @returns The photo URL the account had.
 * @throws {ApiError} LAST_OWNER, with `workspaces`, when the user is the only Owner of a
 * workspace that has other members
 */
export async function deleteAccount(
  tx: DatabaseTransaction,
  userId: string,
  client: ClientKind,
  at: Date,
): Promise<{ avatarUrl: string | null }> {
  // The user's own writes wait for this one, or finished before it (a second U7 is
  // refused here): no membership, invitation or photo of theirs appears meanwhile.
  await lockActiveCaller(tx, userId, "exclusive");
  // Before the members' locks, in the order U6 takes an invitation and then its
  // workspace's members, so the two cannot deadlock.
  await tx
    .update(invitations)
    .set({ status: "revoked", updatedAt: at })
    .where(and(eq(invitations.invitedById, userId), isValidInvitation(at)));
  const memberOf = await tx
    .select({ id: memberships.workspaceId })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .orderBy(asc(memberships.workspaceId));
  for (const { id } of memberOf) await lockMembers(tx, id);
  // After the members' locks, as W3 takes a removed member's row after them.
  const [before] = await tx
    .select({ avatarUrl: users.avatarUrl })
    .from(users)
    .where(eq(users.id, userId))
    .for("no key update");
  // Read again under the locks: a role another Owner changed meanwhile counts.
  const joined = await tx
    .select({
      id: workspaces.id,
      name: workspaces.name,
      isPersonal: workspaces.isPersonal,
      createdById: workspaces.createdById,
      role: memberships.role,
    })
    .from(memberships)
    .innerJoin(workspaces, eq(workspaces.id, memberships.workspaceId))
    .where(eq(memberships.userId, userId))
    .orderBy(asc(workspaces.id));

  const departures = [];
  const lastOwnerOf: { id: string; name: string }[] = [];
  for (const workspace of joined) {
    const counts = await memberCounts(tx, workspace.id);
    if (
      workspace.role === "owner" &&
      counts.owners === 1 &&
      counts.members > 1
    ) {
      lastOwnerOf.push({ id: workspace.id, name: workspace.name });
    }
    const ownPersonal =
      workspace.isPersonal && workspace.createdById === userId;
    departures.push({ ...workspace, alone: counts.members === 1, ownPersonal });
  }
  if (lastOwnerOf.length > 0) {
    throw new ApiError(
      "LAST_OWNER",
      "The account is the only Owner of a workspace with other members",
      { workspaces: lastOwnerOf },
    );
  }

  for (const workspace of departures) {
    if (workspace.ownPersonal && workspace.alone) {
      await lockContent(tx, workspace.id);
      // Everything inside goes with it (the foreign keys cascade).
      await tx.delete(workspaces).where(eq(workspaces.id, workspace.id));
      continue;
    }
    await releaseMember(tx, {
      workspaceId: workspace.id,
      userId,
      assigneeName: DELETED_USER_NAME,
      actorId: userId,
      client,
      at,
    });
    await tx
      .delete(memberships)
      .where(
        and(
          eq(memberships.workspaceId, workspace.id),
          eq(memberships.userId, userId),
        ),
      );
    await tx
      .update(workspaces)
      .set({ lastActiveAt: at })
      .where(eq(workspaces.id, workspace.id));
  }

  const [analysis] = await tx
    .select({ id: selfAnalyses.id })
    .from(selfAnalyses)
    .where(eq(selfAnalyses.userId, userId));
  if (analysis !== undefined) {
    // Replies, mentions and the notifications of these comments cascade.
    await tx
      .delete(comments)
      .where(
        and(
          eq(comments.targetType, "self_analysis_answer"),
          eq(comments.targetId, analysis.id),
        ),
      );
    await tx
      .delete(changeHistory)
      .where(
        and(
          eq(changeHistory.containerType, "self_analysis"),
          eq(changeHistory.containerId, analysis.id),
        ),
      );
    // Its answers and shares cascade.
    await tx.delete(selfAnalyses).where(eq(selfAnalyses.id, analysis.id));
  }

  await tx.delete(notifications).where(eq(notifications.userId, userId));

  await tx.delete(sessions).where(eq(sessions.userId, userId));
  await tx.delete(accounts).where(eq(accounts.userId, userId));
  // Better Auth keeps a reset token as `reset-password:<token>` with the user's id as
  // its value.
  await tx
    .delete(verifications)
    .where(
      and(
        like(verifications.identifier, "reset-password:%"),
        eq(verifications.value, userId),
      ),
    );

  await tx
    .update(users)
    .set({
      email: `deleted+${userId}@deleted.invalid`,
      displayName: DELETED_USER_NAME,
      avatarUrl: null,
      status: "deleted",
      lastWorkspaceId: null,
      updatedAt: at,
    })
    .where(eq(users.id, userId));
  return { avatarUrl: before?.avatarUrl ?? null };
}
