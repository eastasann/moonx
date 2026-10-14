import { type Database, rateLimits } from "@moonx/db";
import { and, lte, sql } from "drizzle-orm";

/** One limit of SDD 7.2「レート制限」: at most `max` requests per `windowMs`. */
export interface Limit {
  /** The `<上限の名前>` part of the key (ADR-029), such as `health-db`. */
  name: string;
  max: number;
  windowMs: number;
}

/** Counted by the caller's IP before login, or by the user after it (ADR-029). */
export type LimitScope = "ip" | "user";

export type LimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Counts one request of `subject` (an IP or a user id) against `limit`. */
  consume(
    scope: LimitScope,
    limit: Limit,
    subject: string,
  ): Promise<LimitResult>;
}

/**
 * Counts in the `rate_limits` table it shares with Better Auth, so every Cloud Run
 * instance sees the same counts (ADR-029). Keys start with `app:`, which Better Auth
 * never uses.
 *
 * Counts as Better Auth 1.7 does (SDD 7.2): `last_request` moves to every allowed
 * request, and the count starts over only once a whole window has passed since the
 * last allowed one. No window-long stretch ever lets more than `max` through, which a
 * window fixed at its first request would allow at its edge. Denied requests still add
 * to `count` (Better Auth leaves it), so the returned count alone tells the outcome.
 * One upsert reads and counts, so concurrent requests cannot both take the last slot.
 *
 * Every caller adds a row, so once a window per limit this instance also deletes that
 * limit's rows whose window has passed. Such a row counts the same as a missing one,
 * so deleting it changes no outcome.
 */
export function createRateLimiter(
  db: Database,
  now: () => number = Date.now,
): RateLimiter {
  const lastSweeps = new Map<string, number>();
  return {
    async consume(scope, limit, subject) {
      const at = now();
      const prefix = `app:${scope}:${limit.name}:`;
      const lastSweep = lastSweeps.get(prefix);
      if (lastSweep === undefined || at - lastSweep >= limit.windowMs) {
        lastSweeps.set(prefix, at);
        await db
          .delete(rateLimits)
          .where(
            and(
              sql`starts_with(${rateLimits.key}, ${prefix})`,
              lte(rateLimits.lastRequest, at - limit.windowMs),
            ),
          );
      }
      const expired = sql`${rateLimits.lastRequest} <= ${at - limit.windowMs}`;
      const [row] = await db
        .insert(rateLimits)
        .values({
          key: `${prefix}${subject}`,
          count: 1,
          lastRequest: at,
        })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
            lastRequest: sql`case when ${expired} or ${rateLimits.count} < ${limit.max} then ${at} else ${rateLimits.lastRequest} end`,
          },
        })
        .returning({
          count: rateLimits.count,
          lastAllowed: rateLimits.lastRequest,
        });
      if (row === undefined)
        throw new Error("rate_limits upsert returned no row");
      if (row.count <= limit.max) return { allowed: true };
      return {
        allowed: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((row.lastAllowed + limit.windowMs - at) / 1000),
        ),
      };
    },
  };
}
