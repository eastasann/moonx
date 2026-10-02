import { schema } from "@moonx/db";
import type { LinkTarget } from "@moonx/schemas";
import { and, eq, ne } from "drizzle-orm";
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
