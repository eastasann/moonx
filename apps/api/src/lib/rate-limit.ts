import { schema } from "@moonx/db";
import { sql } from "drizzle-orm";
import { ApiError } from "../errors";
import type { Executor } from "./db";

/** Limits of SDD 7.2. The window is fixed: it starts at the first counted request. */
export const RATE_LIMITS = {
  invitation: { limit: 20, windowSeconds: 3600 },
  pdf: { limit: 30, windowSeconds: 3600 },
  ai: { limit: 60, windowSeconds: 3600 },
  /** Per IP address, not per user: the caller has no account yet (U5). */
  signUp: { limit: 10, windowSeconds: 60 },
  /** Password guesses at U7, per user: a stolen session must not be able to try passwords freely. */
  passwordCheck: { limit: 5, windowSeconds: 600 },
} as const;

/** The operations that have a per-user limit. */
export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Counts one use of `name` by `userId` in `rate_limits` (key prefix `app:`, ADR-029) and throws
 * 429 RATE_LIMITED once the window's limit is exceeded. One atomic upsert, so several Cloud Run
 * instances agree on the count. Inside a transaction pass the transaction: a second connection
 * would wait for the first one's pool slot and can deadlock the pool.
 */
export async function enforceRateLimit(
  db: Executor,
  name: RateLimitName,
  userId: string,
  now: number = Date.now(),
): Promise<void> {
  const { limit, windowSeconds } = RATE_LIMITS[name];
  const windowMs = windowSeconds * 1000;
  const key = `app:${name}:${userId}`;
  const expired = sql`${schema.rateLimits.lastRequest} < ${now - windowMs}`;
  const rows = await db
    .insert(schema.rateLimits)
    .values({ key, count: 1, lastRequest: now })
    .onConflictDoUpdate({
      target: schema.rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${schema.rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${expired} then ${now} else ${schema.rateLimits.lastRequest} end`,
      },
    })
    .returning({ count: schema.rateLimits.count, lastRequest: schema.rateLimits.lastRequest });
  const row = rows[0];
  if (row && row.count > limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((row.lastRequest + windowMs - now) / 1000));
    throw new ApiError("RATE_LIMITED", `Rate limit exceeded for ${name}`, { retryAfterSeconds });
  }
}
