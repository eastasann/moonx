import { createHash, randomBytes } from "node:crypto";

/** How long an invitation link stays valid, counted from issue or resend (design-spec 6.16). */
export const INVITATION_TTL_DAYS = 7;

/** 32 random bytes; only {@link hashInvitationToken} of it is stored (SDD 7.2). */
export function newInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The SHA-256 hex digest stored in `invitations.token_hash`; the token itself is never stored. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** The link sent to the invitee (SDD 5.5). */
export function invitationLink(publicUrl: string, token: string): string {
  return `${publicUrl}/invite/${token}`;
}

/** The expiry of an invitation issued at `now`. */
export function invitationExpiry(now: Date): Date {
  return new Date(now.getTime() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
}
