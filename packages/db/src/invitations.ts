import { createHash } from "node:crypto";

/**
 * The value `invitations.token_hash` holds for an invitation token: its SHA-256 as
 * lowercase hex. Only the hash is stored (SDD 5.5), so whatever issues or accepts an
 * invitation looks it up through this function.
 */
export const hashInvitationToken = (token: string): string =>
  createHash("sha256").update(token, "utf8").digest("hex");
