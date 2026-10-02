import { schema } from "@moonx/db";
import type { LinkTarget } from "@moonx/schemas";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { Tx } from "./db";

/**
 * Notifies every active member of the workspace except the person who recorded the entry that a
 * decision, Go / No-Go or saved version was added (design-spec 6.15 "判定"). Suspended and
 * deleted users get none.
 */
export async function notifyDecisionRecorded(
  tx: Tx,
  p: { workspaceId: string; recorderId: string; entryId: string; link: LinkTarget },
): Promise<void> {
  const recipients = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.workspaceId, p.workspaceId),
        ne(schema.memberships.userId, p.recorderId),
        eq(schema.users.status, "active"),
      ),
    );
  if (recipients.length === 0) return;
  await tx.insert(schema.notifications).values(
    recipients.map((r) => ({
      userId: r.userId,
      workspaceId: p.workspaceId,
      kind: "decision" as const,
      actorId: p.recorderId,
      decisionLogEntryId: p.entryId,
      link: p.link,
    })),
  );
}

/**
 * Creates the `mention` and `comment` notifications of a written comment (design-spec 6.15).
 * `mentionIds` are the people newly mentioned (an edit passes only the added ones) and
 * `interestedIds` the people the comment concerns: whoever proposed the idea, created the plan,
 * owns the self analysis or wrote in the thread. A person who is both gets the mention only.
 * Nobody is told about their own comment, and suspended or deleted users and people who are not
 * members of the workspace get nothing. For a self analysis only Owners and Members count: they
 * are the ones who can read it.
 */
export async function notifyComment(
  tx: Tx,
  p: {
    commentId: string;
    authorId: string;
    workspaceId: string;
    selfAnalysis: boolean;
    mentionIds: string[];
    interestedIds: string[];
    linkFor: (recipientId: string) => LinkTarget;
  },
): Promise<void> {
  const candidates = [...new Set([...p.mentionIds, ...p.interestedIds])].filter(
    (id) => id !== p.authorId,
  );
  if (candidates.length === 0) return;
  const eligible = await tx
    .select({ userId: schema.memberships.userId })
    .from(schema.memberships)
    .innerJoin(schema.users, eq(schema.users.id, schema.memberships.userId))
    .where(
      and(
        eq(schema.memberships.workspaceId, p.workspaceId),
        inArray(schema.memberships.userId, candidates),
        eq(schema.users.status, "active"),
        p.selfAnalysis ? inArray(schema.memberships.role, ["owner", "member"]) : undefined,
      ),
    );
  const ok = new Set(eligible.map((r) => r.userId));
  const mentioned = p.mentionIds.filter((id) => ok.has(id));
  const mentionSet = new Set(mentioned);
  const commented = [...new Set(p.interestedIds)].filter((id) => ok.has(id) && !mentionSet.has(id));
  const rows = [
    ...[...new Set(mentioned)].map((userId) => ({ userId, kind: "mention" as const })),
    ...commented.map((userId) => ({ userId, kind: "comment" as const })),
  ];
  if (rows.length === 0) return;
  await tx.insert(schema.notifications).values(
    rows.map((r) => ({
      userId: r.userId,
      workspaceId: p.workspaceId,
      kind: r.kind,
      actorId: p.authorId,
      commentId: p.commentId,
      link: p.linkFor(r.userId),
    })),
  );
}
