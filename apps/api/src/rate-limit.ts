import { type Database, rateLimits } from "@moonx/db";
import type { BetterAuthOptions } from "better-auth";
import { and, lte, not, type SQL, sql } from "drizzle-orm";

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

/** Keys the entry plugin writes start with this; Better Auth's never do (ADR-029). */
const APP_PREFIX = "app:";

/**
 * Counts one request of `key` against `max` per `windowMs`, at `at` (epoch ms).
 *
 * Counts as Better Auth 1.7 does (SDD 7.2): `last_request` moves to every allowed
 * request, and the count starts over only once a whole window has passed since the
 * last allowed one. No window-long stretch ever lets more than `max` through, which a
 * window fixed at its first request would allow at its edge. Denied requests still add
 * to `count` (Better Auth leaves it), so the returned count alone tells the outcome.
 * One upsert reads and counts, so concurrent requests cannot both take the last slot.
 */
async function consumeKey(
  db: Database,
  key: string,
  max: number,
  windowMs: number,
  at: number,
): Promise<LimitResult> {
  const expired = sql`${rateLimits.lastRequest} <= ${at - windowMs}`;
  const [row] = await db
    .insert(rateLimits)
    .values({ key, count: 1, lastRequest: at })
    .onConflictDoUpdate({
      target: rateLimits.key,
      set: {
        count: sql`case when ${expired} then 1 else ${rateLimits.count} + 1 end`,
        lastRequest: sql`case when ${expired} or ${rateLimits.count} < ${max} then ${at} else ${rateLimits.lastRequest} end`,
      },
    })
    .returning({
      count: rateLimits.count,
      lastAllowed: rateLimits.lastRequest,
    });
  if (row === undefined) throw new Error("rate_limits upsert returned no row");
  if (row.count <= max) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((row.lastAllowed + windowMs - at) / 1000),
    ),
  };
}

async function sweep(db: Database, scope: SQL, windowMs: number, at: number) {
  await db
    .delete(rateLimits)
    .where(and(scope, lte(rateLimits.lastRequest, at - windowMs)));
}

/**
 * Counts in the `rate_limits` table it shares with Better Auth, so every Cloud Run
 * instance sees the same counts (ADR-029). Keys start with `app:`, which Better Auth
 * never uses.
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
      const prefix = `${APP_PREFIX}${scope}:${limit.name}:`;
      const lastSweep = lastSweeps.get(prefix);
      if (lastSweep === undefined || at - lastSweep >= limit.windowMs) {
        lastSweeps.set(prefix, at);
        await sweep(
          db,
          sql`starts_with(${rateLimits.key}, ${prefix})`,
          limit.windowMs,
          at,
        );
      }
      return consumeKey(
        db,
        `${prefix}${subject}`,
        limit.max,
        limit.windowMs,
        at,
      );
    },
  };
}

type BetterAuthRateLimitStorage = NonNullable<
  NonNullable<BetterAuthOptions["rateLimit"]>["customStorage"]
>;

/**
 * Better Auth's rate-limit store (`rateLimit.customStorage`): the same table and the
 * same counting as {@link createRateLimiter}, under Better Auth's own keys.
 *
 * Better Auth's built-in database store is not used because its clean-up deletes every
 * row older than its own longest window (60 s), `app:` rows included, which would
 * reset the hour-long per-user limits of 7.2. This store deletes only rows outside
 * `app:`, once per the longest window it has been asked to count.
 *
 * @param configuredWindowMs The longest window Better Auth is configured with. Rows stay
 * at least this long even before this instance has counted a rule with that window;
 * a longer window seen in a rule stretches it.
 */
export function createBetterAuthRateLimitStorage(
  db: Database,
  configuredWindowMs: number,
  now: () => number = Date.now,
): BetterAuthRateLimitStorage {
  let longestWindowMs = configuredWindowMs;
  let lastSweep: number | undefined;
  return {
    async consume(key, rule) {
      const at = now();
      const windowMs = rule.window * 1000;
      longestWindowMs = Math.max(longestWindowMs, windowMs);
      if (lastSweep === undefined || at - lastSweep >= longestWindowMs) {
        lastSweep = at;
        await sweep(
          db,
          not(sql`starts_with(${rateLimits.key}, ${APP_PREFIX})`),
          longestWindowMs,
          at,
        );
      }
      const result = await consumeKey(db, key, rule.max, windowMs, at);
      return result.allowed
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: result.retryAfterSeconds };
    },
  };
}
