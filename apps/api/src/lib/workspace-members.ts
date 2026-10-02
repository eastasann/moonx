import { schema } from "@moonx/db";
import type { Member, Role, UserRef } from "@moonx/schemas";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { ApiError } from "../errors";
import { HISTORY_SECTION } from "../history/sections";
import { executionItemSnapshot } from "../history/snapshots";
import { type HistoryActor, withHistory } from "../history/with-history";
import type { Executor, Tx } from "./db";
import { iso } from "./dto";
import { toUserRef } from "./users";

const ROLE_ORDER = sql`case ${schema.memberships.role} when 'owner' then 0 when 'member' then 1 else 2 end`;

/** Members of a workspace, Owners first. `email` is filled only when the caller is an Owner. */
export async function loadWorkspaceMembers(
  db: Executor,
  workspaceId: string,
  viewerRole: Role,
  only?: string,
): Promise<Member[]> {
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      status: schema.users.status,
      email: schema.users.email,
      role: schema.memberships.role,
      joinedAt: schema.memberships.createdAt,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        only ? eq(schema.memberships.userId, only) : undefined,
      ),
    )
    .orderBy(asc(ROLE_ORDER), asc(schema.memberships.createdAt), asc(schema.users.id));
  return rows.map((row) => ({
    user: toUserRef(row),
    email: viewerRole === "owner" && row.status !== "deleted" ? row.email : null,
    role: row.role,
    joinedAt: iso(row.joinedAt),
  }));
}

/**
 * Members who can be @mentioned. Without a target everyone is a candidate, Viewers included
 * (design-spec 6.0.4). On a self-analysis target (`id` is the self-analysis, SDD 5.1 TargetRef)
 * only Owners and Members who can read it are, and a Viewer cannot ask: the analysis must be
 * shared with this workspace (the share is removed when its owner becomes a Viewer, so the owner
 * is among the readers whenever the share exists).
 */
export async function loadMentionCandidates(
  db: Executor,
  scope: { workspaceId: string; role: Role },
  target: { type: string; id: string } | null,
): Promise<UserRef[]> {
  const { workspaceId } = scope;
  let readersOnly = false;
  if (target?.type === "self_analysis_answer") {
    if (scope.role === "viewer") {
      throw new ApiError("FORBIDDEN", "Viewers cannot read self analyses");
    }
    const [found] = await db
      .select({ analysisId: schema.selfAnalyses.id })
      .from(schema.selfAnalyses)
      .where(eq(schema.selfAnalyses.id, target.id));
    if (!found) throw new ApiError("NOT_FOUND", "Self analysis not found");
    const [share] = await db
      .select({ id: schema.selfAnalysisShares.id })
      .from(schema.selfAnalysisShares)
      .where(
        and(
          eq(schema.selfAnalysisShares.selfAnalysisId, found.analysisId),
          eq(schema.selfAnalysisShares.workspaceId, workspaceId),
        ),
      );
    if (!share) throw new ApiError("NOT_SHARED", "This self analysis is not shared here");
    readersOnly = true;
  }
  const rows = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      status: schema.users.status,
    })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.workspaceId, workspaceId),
        readersOnly ? inArray(schema.memberships.role, ["owner", "member"]) : undefined,
      ),
    )
    .orderBy(asc(schema.users.displayName), asc(schema.users.id));
  return rows.map((row) => toUserRef(row));
}

/**
 * What stops being true when a person leaves a workspace or becomes a Viewer (design-spec 6.16):
 * their self-analysis stops being shared here (comments stay, hidden) and the execution items
 * they were assigned in this workspace keep their name as free text, which also stops the due
 * notices that follow `assignee_user_id`. The reassignment is a change of the execution item, so
 * it is recorded in the history like any other (design-spec 6.0.5).
 */
export async function releaseMemberDuties(
  tx: Tx,
  workspaceId: string,
  person: { id: string; displayName: string },
  actor: HistoryActor,
): Promise<void> {
  const analyses = tx
    .select({ id: schema.selfAnalyses.id })
    .from(schema.selfAnalyses)
    .where(eq(schema.selfAnalyses.userId, person.id));
  await tx
    .delete(schema.selfAnalysisShares)
    .where(
      and(
        eq(schema.selfAnalysisShares.workspaceId, workspaceId),
        inArray(schema.selfAnalysisShares.selfAnalysisId, analyses),
      ),
    );
  const plans = tx
    .select({ id: schema.businessPlans.id })
    .from(schema.businessPlans)
    .innerJoin(schema.ideas, eq(schema.ideas.id, schema.businessPlans.ideaId))
    .where(eq(schema.ideas.workspaceId, workspaceId));
  const items = await tx
    .select()
    .from(schema.executionItems)
    .where(
      and(
        eq(schema.executionItems.assigneeUserId, person.id),
        inArray(schema.executionItems.businessPlanId, plans),
      ),
    )
    .for("update");
  for (const item of items) {
    await withHistory(
      tx,
      {
        container: { type: "business_plan", id: item.businessPlanId },
        workspaceId,
        sectionKey: HISTORY_SECTION.execution,
        target: { type: "execution_item", id: item.id },
        actor,
      },
      async () => {
        const [updated] = await tx
          .update(schema.executionItems)
          .set({
            assigneeUserId: null,
            assigneeName: person.displayName,
            lockVersion: item.lockVersion + 1,
            updatedById: actor.userId,
          })
          .where(eq(schema.executionItems.id, item.id))
          .returning();
        return {
          result: undefined,
          before: executionItemSnapshot(item),
          after: executionItemSnapshot(updated as typeof item),
        };
      },
    );
  }
}

/** The workspace a person returns to when the one they last opened is gone for them. */
export async function resetLastWorkspace(
  tx: Tx,
  userId: string,
  leftWorkspaceId: string,
): Promise<void> {
  const [personal] = await tx
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .innerJoin(schema.memberships, eq(schema.memberships.workspaceId, schema.workspaces.id))
    .where(and(eq(schema.memberships.userId, userId), eq(schema.workspaces.isPersonal, true)));
  await tx
    .update(schema.users)
    .set({ lastWorkspaceId: personal?.id ?? null })
    .where(and(eq(schema.users.id, userId), eq(schema.users.lastWorkspaceId, leftWorkspaceId)));
}
