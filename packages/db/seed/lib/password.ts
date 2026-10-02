import { randomBytes, scrypt } from "node:crypto";

/** Parameters Better Auth uses for its default password hash. */
const SCRYPT = { N: 16384, r: 16, p: 1, dkLen: 64 };

/**
 * Hashes a password the way Better Auth does (`better-auth/crypto`): scrypt over the NFKC-normalized
 * password with the hex salt string as the salt, stored as `salt:key` in hex. A seeded account can
 * then sign in through Better Auth without a reset.
 */
export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      SCRYPT.dkLen,
      { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, maxmem: 128 * SCRYPT.N * SCRYPT.r * 2 },
      (err, key) => (err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`)),
    );
  });
}
