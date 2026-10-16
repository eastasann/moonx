import {
  businessPlans,
  comments,
  type DatabaseTransaction,
  type decisionLogEntries,
  ideas,
  memberships,
  notifications,
  selfAnalyses,
  selfAnalysisShares,
  users,
  validations,
} from "@moonx/db";
import type { LinkTarget, TargetRef } from "@moonx/schemas";
import { and, eq, inArray, or } from "drizzle-orm";
import { itemLink } from "./links";

type CommentRow = Pick<
  typeof comments.$inferSelect,
  | "id"
  | "workspaceId"
  | "containerType"
  | "containerId"
  | "targetType"
  | "targetId"
  | "targetKey"
  | "parentId"
  | "authorId"
>;

type DecisionRow = Pick<
  typeof decisionLogEntries.$inferSelect,
  "id" | "workspaceId" | "ideaId" | "businessPlanId" | "kind" | "recordedById"
>;

/** Active members of `workspaceId` (SDD 5.11: suspended users get no notifications). */
async function activeMembers(
  tx: DatabaseTransaction,
  workspaceId: string,
  roles: readonly ("owner" | "member" | "viewer")[],
): Promise<string[]> {
  const rows = await tx
    .select({ id: memberships.userId })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(
      and(
        eq(memberships.workspaceId, workspaceId),
        inArray(memberships.role, [...roles]),
        eq(users.status, "active"),
      ),
    );
  return rows.map((row) => row.id);
}

/**
 * Tells the workspace that `entry` was recorded (design-spec 6.15 判定): a decision,
 * a Go / No-Go or a saved version. Everyone in the workspace hears of it, Viewers
 * too since they read the decision log, except the person who recorded it. The
 * notification opens 13 for a decision and 20 for the others.
 */
export async function notifyDecision(
  tx: DatabaseTransaction,
  entry: DecisionRow,
  at: Date,
): Promise<void> {
  const recipients = (
    await activeMembers(tx, entry.workspaceId, ["owner", "member", "viewer"])
  ).filter((id) => id !== entry.recordedById);
  if (recipients.length === 0) return;
  if (entry.kind !== "validation_decision" && entry.businessPlanId === null) {
    throw new Error(`A ${entry.kind} entry must name its plan`);
  }
  const link: LinkTarget =
    entry.businessPlanId === null
      ? { screen: 13, workspaceId: entry.workspaceId, ideaId: entry.ideaId }
      : {
          screen: 20,
          workspaceId: entry.workspaceId,
          ideaId: entry.ideaId,
          planId: entry.businessPlanId,
        };
  await tx.insert(notifications).values(
    recipients.map((userId) => ({
      userId,
      workspaceId: entry.workspaceId,
      kind: "decision" as const,
      actorId: entry.recordedById,
      decisionLogEntryId: entry.id,
      link,
      createdAt: at,
    })),
  );
}

/** The idea, plan or self-analysis a comment is about. */
interface CommentPlace {
  ideaId: string | null;
  planId: string | null;
  /** Who proposed the idea, made the plan, or owns the self-analysis. */
  owners: string[];
  /** The owner of a self-analysis, whose screens differ from everyone else's. */
  selfAnalysisOwnerId: string | null;
}

async function placeOf(
  tx: DatabaseTransaction,
  comment: CommentRow,
): Promise<CommentPlace> {
  const { containerType, containerId } = comment;
  if (containerType === "self_analysis") {
    const [row] = await tx
      .select({ userId: selfAnalyses.userId })
      .from(selfAnalyses)
      .where(eq(selfAnalyses.id, containerId));
    const ownerId = row?.userId ?? null;
    return {
      ideaId: null,
      planId: null,
      owners: ownerId === null ? [] : [ownerId],
      selfAnalysisOwnerId: ownerId,
    };
  }
  if (containerType === "business_plan") {
    const [row] = await tx
      .select({
        ideaId: ideas.id,
        creatorId: businessPlans.createdById,
        proposerId: ideas.proposerId,
      })
      .from(businessPlans)
      .innerJoin(ideas, eq(ideas.id, businessPlans.ideaId))
      .where(eq(businessPlans.id, containerId));
    return {
      ideaId: row?.ideaId ?? null,
      planId: containerId,
      owners: row === undefined ? [] : [row.creatorId, row.proposerId],
      selfAnalysisOwnerId: null,
    };
  }
  const [row] = await tx
    .select({ ideaId: ideas.id, proposerId: ideas.proposerId })
    .from(ideas)
    .where(
      containerType === "idea"
        ? eq(ideas.id, containerId)
        : inArray(
            ideas.id,
            tx
              .select({ id: validations.ideaId })
              .from(validations)
              .where(eq(validations.id, containerId)),
          ),
    );
  return {
    ideaId: row?.ideaId ?? null,
    planId: null,
    owners: row === undefined ? [] : [row.proposerId],
    selfAnalysisOwnerId: null,
  };
}

/**
 * Who may read the comment's target, the only people it may notify: the active members
 * of its workspace, or for a self-analysis its owner and the active Owners and Members
 * of the workspace it is shared with (design-spec 6.15).
 */
async function readersOf(
  tx: DatabaseTransaction,
  comment: CommentRow,
  place: CommentPlace,
): Promise<Set<string>> {
  if (comment.containerType !== "self_analysis") {
    return new Set(
      await activeMembers(tx, comment.workspaceId, [
        "owner",
        "member",
        "viewer",
      ]),
    );
  }
  const readers = new Set<string>();
  if (place.selfAnalysisOwnerId !== null) {
    const [owner] = await tx
      .select({ status: users.status })
      .from(users)
      .where(eq(users.id, place.selfAnalysisOwnerId));
    if (owner?.status === "active") readers.add(place.selfAnalysisOwnerId);
  }
  const [shared] = await tx
    .select({ id: selfAnalysisShares.id })
    .from(selfAnalysisShares)
    .where(
      and(
        eq(selfAnalysisShares.selfAnalysisId, comment.containerId),
        eq(selfAnalysisShares.workspaceId, comment.workspaceId),
      ),
    );
  if (shared !== undefined) {
    for (const id of await activeMembers(tx, comment.workspaceId, [
      "owner",
      "member",
    ])) {
      readers.add(id);
    }
  }
  return readers;
}

/**
 * The people who wrote in the comment's thread, the first comment included. Writers of
 * deleted comments count too: they did comment in the thread (SDD 5.11 C1).
 */
async function threadAuthors(
  tx: DatabaseTransaction,
  comment: CommentRow,
): Promise<string[]> {
  const rootId = comment.parentId ?? comment.id;
  const rows = await tx
    .select({ authorId: comments.authorId })
    .from(comments)
    .where(or(eq(comments.id, rootId), eq(comments.parentId, rootId)));
  return rows.map((row) => row.authorId);
}

/**
 * Where a notification about `comment` takes `recipientId`: the commented item with
 * the comment panel open (design-spec 6.15), on the screen that shows it.
 */
export function commentLink(
  comment: CommentRow,
  place: Pick<CommentPlace, "ideaId" | "planId" | "selfAnalysisOwnerId">,
  recipientId: string,
): LinkTarget {
  const target: TargetRef = {
    type: comment.targetType,
    id: comment.targetId,
    key: comment.targetKey,
  };
  return {
    ...itemLink(
      target,
      { workspaceId: comment.workspaceId, ...place },
      recipientId,
    ),
    panel: "comments",
    target,
  };
}

/** Who {@link notifyComment} tells about a comment. */
export interface CommentNotice {
  /** The people the comment mentions (`mention` notifications). */
  mentioned: readonly string[];
  /**
   * Whether to tell the people who follow the item (`comment` notifications): who
   * proposed the idea, made the plan (for a plan's items, both) or owns the
   * self-analysis, and who wrote in the thread. False when an edit adds mentions,
   * which notify only the newly mentioned (SDD 5.11 C2).
   */
  followers: boolean;
}

/**
 * Notifies about a new or edited comment under the conditions of design-spec 6.15:
 * a `mention` to each mentioned person, then a `comment` to each follower not already
 * told, at most one per person. Only people who can read the commented item hear of it,
 * never the author, and never a suspended user.
 */
export async function notifyComment(
  tx: DatabaseTransaction,
  comment: CommentRow,
  notice: CommentNotice,
  at: Date,
): Promise<void> {
  const place = await placeOf(tx, comment);
  const readers = await readersOf(tx, comment, place);
  const reachable = (id: string) => id !== comment.authorId && readers.has(id);
  const mentioned = new Set(notice.mentioned.filter(reachable));
  const followers = new Set(
    notice.followers
      ? [...place.owners, ...(await threadAuthors(tx, comment))].filter(
          (id) => reachable(id) && !mentioned.has(id),
        )
      : [],
  );
  const rows = [
    ...[...mentioned].map((userId) => ({ userId, kind: "mention" as const })),
    ...[...followers].map((userId) => ({ userId, kind: "comment" as const })),
  ].map(({ userId, kind }) => ({
    userId,
    workspaceId: comment.workspaceId,
    kind,
    actorId: comment.authorId,
    commentId: comment.id,
    link: commentLink(comment, place, userId),
    createdAt: at,
  }));
  if (rows.length > 0) await tx.insert(notifications).values(rows);
}
