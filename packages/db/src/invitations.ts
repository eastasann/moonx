import { createHash, randomBytes } from "node:crypto";

/** How long an invitation link stays valid from when it is sent (design-spec 6.16, screen 9). */
export const INVITATION_VALID_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The value `invitations.token_hash` holds for an invitation token: its SHA-256 as
 * lowercase hex. Only the hash is stored (SDD 5.5), so whatever issues or accepts an
 * invitation looks it up through this function.
 */
export const hashInvitationToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");

/**
 * A new invitation token: 32 random bytes (SDD 5.5) in base64url, so it goes into the
 * `/invite/{token}` path as it is. Store {@link hashInvitationToken} of it, never the
 * token.
 */
export const createInvitationToken = (): string =>
  randomBytes(32).toString("base64url");
