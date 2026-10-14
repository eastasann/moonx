import { afterAll, describe, expect, test } from "bun:test";
import { rateLimits } from "@moonx/db";
import { eq, like } from "drizzle-orm";
import { createRateLimiter, type Limit } from "./rate-limit";
import { connectTestDatabase, uniqueIp } from "./test-app";

const database = connectTestDatabase();
afterAll(() => database.close());

const limit: Limit = { name: "test", max: 3, windowMs: 60_000 };

describe("createRateLimiter", () => {
  test("allows max requests, then tells how long until a window has passed since the last allowed one", async () => {
    let clock = 10_000_000;
    const limiter = createRateLimiter(database.db, () => clock);
    const ip = uniqueIp();

    const results = [];
    for (let i = 0; i < limit.max; i++) {
      results.push(await limiter.consume("ip", limit, ip));
      clock += 1_000;
    }
    clock += 20_500;
    const over = await limiter.consume("ip", limit, ip);

    expect(results).toEqual(Array(limit.max).fill({ allowed: true }));
    // The last allowed request came 21.5s ago, at +2s.
    expect(over).toEqual({ allowed: false, retryAfterSeconds: 39 });
  });

  test("starts over once a whole window has passed since the last allowed request", async () => {
    let clock = 20_000_000;
    const limiter = createRateLimiter(database.db, () => clock);
    const ip = uniqueIp();
    for (let i = 0; i <= limit.max; i++) await limiter.consume("ip", limit, ip);

    clock += limit.windowMs - 1;
    const early = await limiter.consume("ip", limit, ip);
    clock += 1;
    const after = await limiter.consume("ip", limit, ip);

    expect(early.allowed).toBe(false);
    expect(after).toEqual({ allowed: true });
  });

  test("never lets more than max through within one window, even across its edge", async () => {
    let clock = 30_000_000;
    const limiter = createRateLimiter(database.db, () => clock);
    const ip = uniqueIp();
    await limiter.consume("ip", limit, ip);
    clock += limit.windowMs - 100;
    for (let i = 1; i < limit.max; i++) await limiter.consume("ip", limit, ip);

    clock += 100;
    const burst = await Promise.all(
      Array.from({ length: limit.max }, () => limiter.consume("ip", limit, ip)),
    );

    expect(burst.filter((result) => result.allowed)).toHaveLength(0);
  });

  test("does not let denied requests push the wait further", async () => {
    let clock = 40_000_000;
    const limiter = createRateLimiter(database.db, () => clock);
    const ip = uniqueIp();
    for (let i = 0; i < 10; i++) {
      await limiter.consume("ip", limit, ip);
      clock += 5_000;
    }

    // Allowed at +0s, +5s and +10s; denied from +15s on.
    expect(await limiter.consume("ip", limit, ip)).toEqual({
      allowed: false,
      retryAfterSeconds: 20,
    });
  });

  test("deletes a limit's rows once their window has passed, and nothing else", async () => {
    const name = `sweep-${crypto.randomUUID()}`;
    const other = `kept-${crypto.randomUUID()}`;
    const at = 50_000_000;
    await database.db.insert(rateLimits).values([
      { key: `app:ip:${name}:old`, count: 3, lastRequest: at - 60_000 },
      { key: `app:ip:${name}:recent`, count: 3, lastRequest: at - 59_999 },
      { key: `app:ip:${other}:old`, count: 3, lastRequest: at - 60_000 },
      { key: `${name}:better-auth-style`, count: 3, lastRequest: 0 },
    ]);
    const limiter = createRateLimiter(database.db, () => at);

    await limiter.consume("ip", { ...limit, name }, "new");

    const keys = async (pattern: string) =>
      (
        await database.db
          .select({ key: rateLimits.key })
          .from(rateLimits)
          .where(like(rateLimits.key, pattern))
      )
        .map((row) => row.key)
        .sort();
    expect(await keys(`%${name}%`)).toEqual([
      `app:ip:${name}:new`,
      `app:ip:${name}:recent`,
      `${name}:better-auth-style`,
    ]);
    expect(await keys(`%${other}%`)).toEqual([`app:ip:${other}:old`]);
  });

  test("stores app: keys that Better Auth never uses (ADR-029)", async () => {
    const limiter = createRateLimiter(database.db);
    const ip = uniqueIp();
    const user = crypto.randomUUID();
    await limiter.consume("ip", { ...limit, name: "health-db" }, ip);
    await limiter.consume("user", { ...limit, name: "pdf" }, user);

    for (const key of [`app:ip:health-db:${ip}`, `app:user:pdf:${user}`]) {
      const rows = await database.db
        .select()
        .from(rateLimits)
        .where(eq(rateLimits.key, key));
      expect(rows).toHaveLength(1);
      expect(rows[0]?.count).toBe(1);
    }
  });

  test("counts limits and subjects separately", async () => {
    const limiter = createRateLimiter(database.db);
    const ip = uniqueIp();
    for (let i = 0; i <= limit.max; i++) await limiter.consume("ip", limit, ip);

    expect(
      await limiter.consume("ip", { ...limit, name: "other" }, ip),
    ).toEqual({ allowed: true });
    expect(await limiter.consume("ip", limit, uniqueIp())).toEqual({
      allowed: true,
    });
  });

  test("lets exactly max of many concurrent requests through", async () => {
    const limiter = createRateLimiter(database.db);
    const ip = uniqueIp();

    const results = await Promise.all(
      Array.from({ length: 20 }, () => limiter.consume("ip", limit, ip)),
    );

    expect(results.filter((result) => result.allowed)).toHaveLength(limit.max);
  });
});
