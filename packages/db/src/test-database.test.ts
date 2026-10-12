import { afterAll, describe, expect, test } from "bun:test";
import { tmpdir } from "node:os";
import { SQL } from "bun";
import {
  quoteIdentifier,
  recreateTestDatabase,
  testDatabaseName,
  UnsafeTestDatabaseError,
} from "./test-database";

describe("testDatabaseName", () => {
  test("accepts a name of exactly 63 bytes", () => {
    const name = `${"x".repeat(58)}_test`;
    expect(
      testDatabaseName(`postgres://moonx:moonx@localhost:5432/${name}`),
    ).toBe(name);
  });

  test("returns the name of a database ending in _test", () => {
    expect(
      testDatabaseName("postgres://moonx:moonx@localhost:5432/moonx_test"),
    ).toBe("moonx_test");
  });

  test.each([
    ["the development database", "postgres://moonx:moonx@localhost:5432/moonx"],
    [
      "a name that only contains _test",
      "postgres://moonx:moonx@localhost:5432/moonx_test_copy",
    ],
    ["no database", "postgres://moonx:moonx@localhost:5432"],
    [
      "a query string",
      "postgres://moonx:moonx@localhost:5432/moonx_test?options=-csearch_path%3Dx",
    ],
    [
      "an empty query string",
      "postgres://moonx:moonx@localhost:5432/moonx_test?",
    ],
    ["something that is not a URL", "moonx_test"],
    [
      "a malformed escape",
      "postgres://moonx:moonx@localhost:5432/moonx%E0%A4%A_test",
    ],
    [
      "an encoded slash",
      "postgres://moonx:moonx@localhost:5432/moonx%2Fother_test",
    ],
    ["a NUL byte", "postgres://moonx:moonx@localhost:5432/moonx%00_test"],
    [
      "a name PostgreSQL would truncate before _test",
      `postgres://moonx:moonx@localhost:5432/${"x".repeat(59)}_test`,
    ],
  ])("refuses %s", (_, url) => {
    expect(() => testDatabaseName(url)).toThrow(UnsafeTestDatabaseError);
  });
});

describe("recreateTestDatabase", () => {
  const base = process.env.DATABASE_URL_TEST;
  if (base === undefined || base === "") {
    throw new Error("DATABASE_URL_TEST is required for make test-api");
  }
  // A database of its own, so recreating it never disturbs the one other tests use.
  const scratch = new URL(base);
  scratch.pathname = `/${testDatabaseName(base)}_recreate_test`;
  const scratchUrl = scratch.toString();

  afterAll(async () => {
    const admin = new URL(base);
    admin.pathname = "/postgres";
    const sql = new SQL(admin.toString());
    await sql.unsafe(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(testDatabaseName(scratchUrl))} WITH (FORCE)`,
    );
    await sql.close();
  });

  test("creates the database when it does not exist, then empties it on the next run", async () => {
    await recreateTestDatabase(scratchUrl);
    // Left open on purpose: a session still using the database must not block the drop.
    const before = new SQL(scratchUrl);
    await before`CREATE TABLE leftover (id int)`;

    await recreateTestDatabase(scratchUrl);
    await before.close();

    const after = new SQL(scratchUrl);
    const rows =
      await after`SELECT count(*)::int AS count FROM pg_tables WHERE tablename = 'leftover'`;
    await after.close();
    expect(rows[0].count).toBe(0);
  });
});

describe("recreate-test-database command", () => {
  const run = (url: string | undefined) => {
    const env = { ...process.env };
    if (url === undefined) delete env.DATABASE_URL_TEST;
    else env.DATABASE_URL_TEST = url;
    // Outside the repository, so Bun cannot pick DATABASE_URL_TEST up from the root .env.
    const result = Bun.spawnSync(
      ["bun", `${import.meta.dir}/recreate-test-database.ts`],
      { cwd: tmpdir(), env, stderr: "pipe" },
    );
    return { exitCode: result.exitCode, stderr: result.stderr.toString() };
  };

  test("refuses an unsafe URL without touching the database", () => {
    const result = run("postgres://moonx:moonx@localhost:5432/moonx");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      'Refusing to recreate the test database: DATABASE_URL_TEST must name a database ending in _test, got "moonx"',
    );
  });

  test("fails when DATABASE_URL_TEST is not set", () => {
    const result = run(undefined);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL_TEST is not set");
  });
});
