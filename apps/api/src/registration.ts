import {
  type Database,
  type DatabaseTransaction,
  hashInvitationToken,
  invitations,
  memberships,
  users,
  workspaces,
} from "@moonx/db";
import {
  DISPLAY_NAME_MAX,
  fitWithSuffix,
  WORKSPACE_NAME_MAX,
} from "@moonx/schemas";
import { and, eq, gt, isNull, sql } from "drizzle-orm";

const PERSONAL_WORKSPACE_SUFFIX = "'s workspace";
const PERSONAL_WORKSPACE_CURRENCY = "PHP";

/**
 * The name of a new user's personal workspace (design-spec 5章「登録時」): "{表示名}'s
 * workspace", cutting the end of the display name so the whole fits the 60 characters
 * of a workspace name (6.0.8).
 */
function personalWorkspaceName(displayName: string): string {
  return fitWithSuffix(
    displayName.trim(),
    PERSONAL_WORKSPACE_SUFFIX,
    WORKSPACE_NAME_MAX,
  );
}

/**
 * A display name within the rule of design-spec 6.0.8 for a name a provider gives
 * (Google's profile name), which follows no rule of ours: trimmed and cut to 60
 * characters, or the address's local part when the provider gives none. The user can
 * change it at onboarding (3 ②).
 */
export function displayNameFromProvider(
  name: string | null | undefined,
  email: string,
): string {
  const trimmed = (name ?? "").trim();
  const fallback = email.split("@")[0] ?? email;
  return fitWithSuffix(
    trimmed === "" ? fallback : trimmed,
    "",
    DISPLAY_NAME_MAX,
  );
}

/** Invitations sent to `email`, matched ignoring case (design-spec 6.0.8). */
export const sentTo = (email: string) =>
  sql`lower(${invitations.email}) = lower(${email})`;

/** Pending and before `expires_at`: what SDD 5.4 calls a valid invitation. */
export const isValidInvitation = (at: Date) =>
  and(eq(invitations.status, "pending"), gt(invitations.expiresAt, at));

/**
 * Whether `token` names a valid invitation sent to `email`, matched ignoring case.
 * Sign-up through Google needs one: the invitation the screen was opened from, sent to
 * the Google account's address (SDD 5.4「新規登録の制限」, design-spec 6.16).
 */
export async function isValidInvitationFor(
  db: Database | DatabaseTransaction,
  token: string,
  email: string,
  at: Date,
): Promise<boolean> {
  const [found] = await db
    .select({ id: invitations.id })
    .from(invitations)
    .where(
      and(
        eq(invitations.tokenHash, hashInvitationToken(token)),
        sentTo(email),
        isValidInvitation(at),
      ),
    )
    .limit(1);
  return found !== undefined;
}

/** The user {@link setUpNewUser} sets up. */
export interface NewUser {
  id: string;
  email: string;
  displayName: string;
}

/**
 * What every sign-up adds to the user it has just created (SDD 5.4「登録の後」): a
 * personal workspace the user owns and lands on, and the acceptance of the valid
 * invitations to the address that name no workspace, which make the user an operator
 * when one grants it. Invitations to a workspace stay pending: onboarding accepts them
 * (U6, design-spec 6.16 3 ①).
 *
 * Does nothing for a user who already has a personal workspace, so it can run again
 * for one whose sign-up stopped halfway. Takes a transaction so that U5, which creates
 * the user itself, runs this in the same one.
 */
export async function setUpNewUser(
  tx: DatabaseTransaction,
  user: NewUser,
  at: Date,
): Promise<void> {
  // The lock makes a second run for the same user wait, then see the first one's work.
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, user.id))
    .for("update");
  const [existing] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(eq(workspaces.createdById, user.id), eq(workspaces.isPersonal, true)),
    )
    .limit(1);
  if (existing !== undefined) return;
  const [workspace] = await tx
    .insert(workspaces)
    .values({
      name: personalWorkspaceName(user.displayName),
      currency: PERSONAL_WORKSPACE_CURRENCY,
      isPersonal: true,
      createdById: user.id,
      createdAt: at,
      updatedAt: at,
    })
    .returning({ id: workspaces.id });
  if (workspace === undefined)
    throw new Error("workspace insert returned no row");
  await tx.insert(memberships).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner",
    createdAt: at,
    updatedAt: at,
  });
  const accepted = await tx
    .update(invitations)
    .set({
      status: "accepted",
      acceptedById: user.id,
      acceptedAt: at,
      updatedAt: at,
    })
    .where(
      and(
        sentTo(user.email),
        isValidInvitation(at),
        isNull(invitations.workspaceId),
      ),
    )
    .returning({ grantsAdmin: invitations.grantsAdmin });
  await tx
    .update(users)
    .set({
      lastWorkspaceId: workspace.id,
      ...(accepted.some((invitation) => invitation.grantsAdmin)
        ? { isAdmin: true }
        : {}),
    })
    .where(eq(users.id, user.id));
}
