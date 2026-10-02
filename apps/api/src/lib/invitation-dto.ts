import { schema } from "@moonx/db";
import type { Invitation } from "@moonx/schemas";
import { inArray } from "drizzle-orm";
import type { Executor } from "./db";
import { iso, isoOrNull } from "./dto";
import { toUserRef } from "./users";

type InvitationRow = typeof schema.invitations.$inferSelect;

/**
 * The status a client sees: a pending invitation past its expiry reads as `expired` even though
 * nothing rewrites the row when the time passes.
 */
export function effectiveInvitationStatus(
  row: Pick<InvitationRow, "status" | "expiresAt">,
  now: Date,
): Invitation["status"] {
  return row.status === "pending" && row.expiresAt.getTime() <= now.getTime()
    ? "expired"
    : row.status;
}

/**
 * Turns rows into `Invitation`s. The inviter keeps a "former member" badge only when the
 * invitation belongs to a workspace they have left; operator invitations have no workspace.
 */
export async function toInvitations(
  db: Executor,
  rows: InvitationRow[],
  now: Date,
): Promise<Invitation[]> {
  if (rows.length === 0) return [];
  const workspaceIds = [...new Set(rows.flatMap((r) => (r.workspaceId ? [r.workspaceId] : [])))];
  const workspaces = workspaceIds.length
    ? await db
        .select({ id: schema.workspaces.id, name: schema.workspaces.name })
        .from(schema.workspaces)
        .where(inArray(schema.workspaces.id, workspaceIds))
    : [];
  const names = new Map(workspaces.map((w) => [w.id, w.name]));
  const inviterIds = [...new Set(rows.map((r) => r.invitedById))];
  const inviters = await db
    .select({
      id: schema.users.id,
      displayName: schema.users.displayName,
      avatarUrl: schema.users.avatarUrl,
      status: schema.users.status,
    })
    .from(schema.users)
    .where(inArray(schema.users.id, inviterIds));
  const memberships = workspaceIds.length
    ? await db
        .select({ workspaceId: schema.memberships.workspaceId, userId: schema.memberships.userId })
        .from(schema.memberships)
        .where(inArray(schema.memberships.workspaceId, workspaceIds))
    : [];
  const member = new Set(memberships.map((m) => `${m.workspaceId}:${m.userId}`));
  const byId = new Map(inviters.map((u) => [u.id, u]));
  return rows.map((row) => {
    const inviter = byId.get(row.invitedById);
    if (!inviter) throw new Error(`invitation ${row.id} has no inviter`);
    return {
      id: row.id,
      email: row.email,
      role: row.role,
      workspace: row.workspaceId
        ? { id: row.workspaceId, name: names.get(row.workspaceId) ?? "" }
        : null,
      status: effectiveInvitationStatus(row, now),
      invitedBy: toUserRef(
        inviter,
        row.workspaceId === null || member.has(`${row.workspaceId}:${row.invitedById}`),
      ),
      createdAt: iso(row.createdAt),
      expiresAt: iso(row.expiresAt),
      acceptedAt: isoOrNull(row.acceptedAt),
    };
  });
}
