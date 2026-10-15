import {
  businessPlans,
  type DatabaseTransaction,
  executionItemContent,
  executionItems,
  ideas,
  memberships,
  selfAnalyses,
  selfAnalysisShares,
  users,
  workspaces,
} from "@moonx/db";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import type { ClientKind } from "./entry";
import { withHistory } from "./history";
import { advisoryLock } from "./lock";

/**
 * Serializes the changes to `workspaceId`'s members until the transaction ends: role
 * changes, removals and leaving (W3), joining (U6) and account deletion (U7). Checks
 * such as "the last Owner" then count members no other change is moving. An advisory
 * lock leaves the workspace row free for the writes inside it, which update that row
 * at their end (SDD 7.1「実装」). Take it before any other lock; U7 takes several, in
 * the order of their ids.
 */
export async function lockMembers(
  tx: DatabaseTransaction,
  workspaceId: string,
): Promise<void> {
  await advisoryLock(tx, `moonx:members:${workspaceId}`);
}

/** How many members, and how many Owners, `workspaceId` has. */
export async function memberCounts(
  tx: DatabaseTransaction,
  workspaceId: string,
): Promise<{ members: number; owners: number }> {
  const [row] = await tx
    .select({
      members: count(),
      owners: sql<number>`count(*) filter (where ${memberships.role} = 'owner')::int`,
    })
    .from(memberships)
    .where(eq(memberships.workspaceId, workspaceId));
  return { members: row?.members ?? 0, owners: row?.owners ?? 0 };
}

/** The personal workspace sign-up made for `userId` (SDD 5.4「登録の後」), if any. */
export async function personalWorkspaceOf(
  tx: DatabaseTransaction,
  userId: string,
): Promise<string | null> {
  const [row] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.createdById, userId), eq(workspaces.isPersonal, true)),
    )
    .orderBy(asc(workspaces.createdAt))
    .limit(1);
  return row?.id ?? null;
}

/** Who stops being able to work in a workspace, and who made it so. */
export interface Release {
  workspaceId: string;
  userId: string;
  /**
   * The name the person's execution items show instead of them: their display name, or
   * "Deleted user" when the account is deleted (design-spec 6.16).
   */
  assigneeName: string;
  /** The person who removed or demoted them; themselves when leaving or deleting. */
  actorId: string;
  client: ClientKind;
  at: Date;
}

/**
 * What design-spec 6.16 does when a member leaves or is removed, and when one becomes a
 * Viewer, besides the membership itself:
 *
 * - their self-analysis stops being shared with the workspace (its comments stay, hidden
 *   until it is shared again);
 * - their execution items name them in free text instead, since only Owners and Members
 *   may be assignees (SDD 5.9 P9). Each item records the change as a `manual` history
 *   row, raises its lock version and moves the last activity of its idea and plan.
 *
 * Items of ideas and plans whose creation was undone are left alone: nothing reads them
 * again (SDD 5.1). Archived ones change too, so no item ever names someone who cannot
 * be its assignee. Call it under {@link lockMembers}. The workspace's own last activity
 * is the caller's to move, with the membership change.
 */
export async function releaseMember(
  tx: DatabaseTransaction,
  release: Release,
): Promise<void> {
  const { workspaceId, userId, assigneeName, actorId, client, at } = release;
  await tx
    .delete(selfAnalysisShares)
    .where(
      and(
        eq(selfAnalysisShares.workspaceId, workspaceId),
        inArray(
          selfAnalysisShares.selfAnalysisId,
          tx
            .select({ id: selfAnalyses.id })
            .from(selfAnalyses)
            .where(eq(selfAnalyses.userId, userId)),
        ),
      ),
    );

  const assigned = and(
    eq(ideas.workspaceId, workspaceId),
    isNull(ideas.deletedAt),
    isNull(businessPlans.deletedAt),
    eq(executionItems.assigneeUserId, userId),
  );
  const places = await tx
    .selectDistinct({ ideaId: ideas.id, planId: businessPlans.id })
    .from(executionItems)
    .innerJoin(
      businessPlans,
      eq(businessPlans.id, executionItems.businessPlanId),
    )
    .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
    .where(assigned);
  if (places.length === 0) return;
  const ideaIds = [...new Set(places.map((place) => place.ideaId))].sort();
  const planIds = [...new Set(places.map((place) => place.planId))].sort();
  // The order every write takes them in (SDD 7.1「実装」, scope.ts lockScope): ideas,
  // then plans, then the items. Taking an item first could deadlock with a save that
  // holds its idea and waits for the item.
  await tx
    .select({ id: ideas.id })
    .from(ideas)
    .where(inArray(ideas.id, ideaIds))
    .orderBy(asc(ideas.id))
    .for("no key update");
  await tx
    .select({ id: businessPlans.id })
    .from(businessPlans)
    .where(inArray(businessPlans.id, planIds))
    .orderBy(asc(businessPlans.id))
    .for("no key update");
  const items = await tx
    .select({ item: executionItems })
    .from(executionItems)
    .innerJoin(
      businessPlans,
      eq(businessPlans.id, executionItems.businessPlanId),
    )
    .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
    .where(assigned)
    .orderBy(asc(executionItems.id))
    .for("update", { of: executionItems });

  const byPlan = new Map<string, (typeof executionItems.$inferSelect)[]>();
  for (const { item } of items) {
    byPlan.set(item.businessPlanId, [
      ...(byPlan.get(item.businessPlanId) ?? []),
      item,
    ]);
  }
  for (const [planId, planItems] of byPlan) {
    await withHistory(
      tx,
      {
        container: { type: "business_plan", id: planId, workspaceId },
        changedById: actorId,
        source: "manual",
        batchId: null,
        client,
        at,
      },
      async () => {
        const changes = [];
        for (const item of planItems) {
          const after = { ...item, assigneeUserId: null, assigneeName };
          await tx
            .update(executionItems)
            .set({
              assigneeUserId: null,
              assigneeName,
              lockVersion: item.lockVersion + 1,
              updatedById: actorId,
              updatedAt: at,
            })
            .where(eq(executionItems.id, item.id));
          changes.push({
            target: { type: "execution_item" as const, id: item.id },
            action: "update" as const,
            before: executionItemContent(item),
            after: executionItemContent(after),
          });
        }
        return changes;
      },
    );
  }
  await tx
    .update(ideas)
    .set({ lastActivityAt: at })
    .where(inArray(ideas.id, ideaIds));
  await tx
    .update(businessPlans)
    .set({ lastActivityAt: at })
    .where(inArray(businessPlans.id, planIds));
}

/**
 * Removes `userId` from `workspaceId` after {@link releaseMember}, and sends them back
 * to their personal workspace when they were last in this one (SDD 5.5 W3 DELETE).
 */
export async function removeMember(
  tx: DatabaseTransaction,
  release: Release,
): Promise<void> {
  await releaseMember(tx, release);
  await tx
    .delete(memberships)
    .where(
      and(
        eq(memberships.workspaceId, release.workspaceId),
        eq(memberships.userId, release.userId),
      ),
    );
  await tx
    .update(users)
    .set({ lastWorkspaceId: await personalWorkspaceOf(tx, release.userId) })
    .where(
      and(
        eq(users.id, release.userId),
        eq(users.lastWorkspaceId, release.workspaceId),
      ),
    );
}
