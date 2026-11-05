import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  quoteIdentifier,
  recreateTestDatabase,
  testDatabaseName,
} from "@moonx/db/test-database";
import { SQL } from "bun";
import { connectTestDatabase } from "./test-app";
import { testFixtures } from "./test-fixtures";

// The backup of ADR-028 as db-backup.yml takes it (SDD 10章): the real Makefile's
// db-backup with the pg_dump on PATH, which must be PostgreSQL 17's (03_dev-setup.md 1章).
// Only the outside is replaced: gcloud by a script that hands out a token, and Cloud
// Storage by a server that keeps what is uploaded. The dump is then restored into another
// database the way 05_operation-runbook.md 6.2 restores one. pg_dump runs through a
// script that records its arguments, which must never hold the password.

const makefile = join(import.meta.dir, "..", "..", "..", "Makefile");
const PROJECT = "moonx-backup-check";
const TOKEN = "backup-check-token";
const TIMEOUT_MS = 60_000;

const FAKE_GCLOUD = `#!/bin/sh
[ "$*" = "auth print-access-token" ] || { echo "unexpected: gcloud $*" >&2; exit 2; }
echo ${TOKEN}
`;

/** The pg_dump make finds first: it writes each argument on a line, then runs the real one. */
const recordingPgDump = (real: string, log: string) => `#!/bin/sh
for arg in "$@"; do printf '%s\n' "$arg"; done >> '${log}'
exec '${real}' "$@"
`;

interface Upload {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | null;
  contentType: string | null;
  body: Uint8Array;
}

const uploads: Upload[] = [];
const storage = Bun.serve({
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    uploads.push({
      method: request.method,
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      authorization: request.headers.get("authorization"),
      contentType: request.headers.get("content-type"),
      body: new Uint8Array(await request.arrayBuffer()),
    });
    return Response.json({ kind: "storage#object" });
  },
});

const sourceUrl = process.env.DATABASE_URL_TEST ?? "";
const testName = testDatabaseName(sourceUrl);
const restoreUrl = (() => {
  const url = new URL(sourceUrl);
  url.pathname = `/${testName.slice(0, -"_test".length)}_restore_test`;
  return url.toString();
})();

/**
 * A role made as 03_dev-setup.md 5.4 E makes moonx_backup_ro, on the test database, with
 * a password holding the characters a URL must percent-encode.
 */
const reader = {
  role: `backup_reader_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`,
  password: `p@ss:w/rd%${crypto.randomUUID().replaceAll("-", "")}`,
};
const readerUrl = (() => {
  const url = new URL(sourceUrl);
  return `${url.protocol}//${reader.role}:${encodeURIComponent(reader.password)}@${url.host}${url.pathname}`;
})();

const connection = connectTestDatabase();
const fixtures = testFixtures(connection.db);
let dir: string;
let pgDumpArgs: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "moonx-backup-"));
  pgDumpArgs = join(dir, "pg_dump.args");
  writeFileSync(join(dir, "gcloud"), FAKE_GCLOUD);
  chmodSync(join(dir, "gcloud"), 0o755);
  const real = Bun.which("pg_dump");
  if (real === null)
    throw new Error("No pg_dump on PATH (03_dev-setup.md 1章)");
  writeFileSync(join(dir, "pg_dump"), recordingPgDump(real, pgDumpArgs));
  chmodSync(join(dir, "pg_dump"), 0o755);
});

afterAll(async () => {
  storage.stop(true);
  await connection.close();
  const admin = new URL(sourceUrl);
  admin.pathname = "/postgres";
  const sql = new SQL(admin.toString());
  try {
    const name = quoteIdentifier(testDatabaseName(restoreUrl));
    await sql.unsafe(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
  } finally {
    await sql.close();
  }
  // The role's grants live in the test database, so they go there before the role can.
  const owner = new SQL(sourceUrl);
  try {
    const role = quoteIdentifier(reader.role);
    const [found] =
      await owner`select 1 from pg_roles where rolname = ${reader.role}`;
    if (found !== undefined) {
      await owner.unsafe(`DROP OWNED BY ${role}`);
      await owner.unsafe(`DROP ROLE ${role}`);
    }
  } finally {
    await owner.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

/**
 * make db-backup ENV=production, outside the repository so no .env is read. Spawned
 * without blocking, since the fake Cloud Storage answers in this process.
 */
async function backup(
  databaseUrlDirect: string,
  storageUrl = storage.url.origin,
) {
  uploads.length = 0;
  rmSync(pgDumpArgs, { force: true });
  const child = Bun.spawn(
    [
      "make",
      "--no-print-directory",
      "-f",
      makefile,
      "db-backup",
      "ENV=production",
      `GCP_PROJECT_ID=${PROJECT}`,
      `STORAGE_URL=${storageUrl}`,
    ],
    {
      cwd: dir,
      env: {
        PATH: `${dir}:${process.env.PATH ?? ""}`,
        DATABASE_URL_DIRECT: databaseUrlDirect,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { exitCode, stdout, stderr };
}

/** The arguments the last make db-backup gave pg_dump, one per line; none if it did not run. */
const pgDumpArguments = () =>
  existsSync(pgDumpArgs)
    ? readFileSync(pgDumpArgs, "utf8").split("\n").slice(0, -1)
    : [];

/** The object name's time, as make db-backup writes it: UTC to the second. */
const objectTime = (name: string): number => {
  const match =
    /^production\/(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump$/.exec(name);
  if (match === null) throw new Error(`Not a backup's name: ${name}`);
  const [, day, hours, minutes, seconds] = match;
  return Date.parse(`${day}T${hours}:${minutes}:${seconds}Z`);
};

async function rowCounts(url: string) {
  const sql = new SQL(url);
  try {
    const tables: { schemaname: string; tablename: string }[] =
      await sql`select schemaname, tablename from pg_tables
        where schemaname in ('public', 'drizzle') order by 1, 2`;
    const counts: Record<string, number> = {};
    for (const { schemaname, tablename } of tables) {
      const [row] = await sql.unsafe(
        `select count(*)::int as n from ${quoteIdentifier(schemaname)}.${quoteIdentifier(tablename)}`,
      );
      counts[`${schemaname}.${tablename}`] = row.n;
    }
    return counts;
  } finally {
    await sql.close();
  }
}

/** The schema as pg_dump writes it, without the per-run \restrict key of PostgreSQL 17.6+. */
function schemaOf(url: string): string {
  const result = Bun.spawnSync(
    ["pg_dump", "--schema-only", "--no-owner", "--no-privileges", url],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout
    .toString()
    .split("\n")
    .filter((line) => !/^\\(un)?restrict /.test(line))
    .join("\n");
}

describe("make db-backup", () => {
  test(
    "uploads a custom-format dump of the database as the day's object, which pg_restore puts back",
    async () => {
      const marker = await fixtures.createUser({
        displayName: "Backup marker",
      });
      const before = Math.floor(Date.now() / 1000) * 1000;
      const result = await backup(sourceUrl);
      const after = Date.now();

      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(uploads).toHaveLength(1);
      const [upload] = uploads;
      expect(upload).toMatchObject({
        method: "POST",
        path: `/upload/storage/v1/b/${PROJECT}-moonx-backups/o`,
        authorization: `Bearer ${TOKEN}`,
        contentType: "application/octet-stream",
      });
      expect(upload?.query.uploadType).toBe("media");
      // Never over an object already there: a second run gets a name of its own.
      expect(upload?.query.ifGenerationMatch).toBe("0");
      const time = objectTime(upload?.query.name ?? "");
      expect(time).toBeGreaterThanOrEqual(before);
      expect(time).toBeLessThanOrEqual(after);
      const dump = upload?.body ?? new Uint8Array();
      // The signature of pg_dump's custom format (-Fc).
      expect(new TextDecoder().decode(dump.subarray(0, 5))).toBe("PGDMP");

      const file = join(dir, "restore.dump");
      writeFileSync(file, dump);
      await recreateTestDatabase(restoreUrl);
      const restore = Bun.spawnSync(
        [
          "pg_restore",
          "--no-owner",
          "--no-privileges",
          `--dbname=${restoreUrl}`,
          file,
        ],
        { stdout: "pipe", stderr: "pipe" },
      );
      expect({
        exitCode: restore.exitCode,
        stderr: restore.stderr.toString(),
      }).toEqual({ exitCode: 0, stderr: "" });

      expect(schemaOf(restoreUrl)).toBe(schemaOf(sourceUrl));
      const counts = await rowCounts(restoreUrl);
      expect(counts).toEqual(await rowCounts(sourceUrl));
      expect(counts["drizzle.__drizzle_migrations"]).toBeGreaterThan(0);
      const restored = new SQL(restoreUrl);
      try {
        const users: unknown[] =
          await restored`select email, display_name from users where id = ${marker.id}`;
        expect(users).toEqual([
          { email: marker.email, display_name: "Backup marker" },
        ]);
      } finally {
        await restored.close();
      }
    },
    TIMEOUT_MS,
  );

  test(
    "dumps on a role that can only read, its password kept out of pg_dump's arguments",
    async () => {
      const owner = new SQL(sourceUrl);
      try {
        const role = quoteIdentifier(reader.role);
        // 03_dev-setup.md 5.4 E's grants on a database whose tables already exist.
        await owner.unsafe(
          `CREATE ROLE ${role} WITH LOGIN PASSWORD '${reader.password.replaceAll("'", "''")}'`,
        );
        await owner.unsafe(
          `GRANT CONNECT ON DATABASE ${quoteIdentifier(testName)} TO ${role}`,
        );
        await owner.unsafe(`GRANT USAGE ON SCHEMA public, drizzle TO ${role}`);
        await owner.unsafe(
          `GRANT SELECT ON ALL TABLES IN SCHEMA public, drizzle TO ${role}`,
        );
        await owner.unsafe(
          `GRANT SELECT ON ALL SEQUENCES IN SCHEMA public, drizzle TO ${role}`,
        );
      } finally {
        await owner.close();
      }

      const result = await backup(readerUrl);

      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(uploads).toHaveLength(1);
      const dump = uploads[0]?.body ?? new Uint8Array();
      expect(new TextDecoder().decode(dump.subarray(0, 5))).toBe("PGDMP");
      const args = pgDumpArguments();
      // The URL without its password, which libpq took from PGPASSWORD decoded.
      const url = new URL(readerUrl);
      expect(args).toContain(
        `${url.protocol}//${reader.role}@${url.host}${url.pathname}`,
      );
      for (const arg of args) {
        expect(arg).not.toContain(reader.password);
        expect(arg).not.toContain(encodeURIComponent(reader.password));
      }
    },
    TIMEOUT_MS,
  );

  test.each([
    ["the key=value form", "host=localhost dbname=moonx_test password=secret"],
    [
      "a password= parameter",
      "postgresql://moonx@localhost/moonx_test?password=secret",
    ],
    [
      "a password parameter whose name is percent-encoded",
      "postgresql://moonx@localhost/moonx_test?pass%77ord=secret",
    ],
    [
      "the key=value form holding a URL",
      "host=localhost dbname=moonx_test password=secret application_name=http://x",
    ],
    [
      "a password with an unencoded @",
      "postgresql://moonx:sec@ret@localhost/moonx_test",
    ],
    [
      "a password with an unencoded slash",
      "postgresql://moonx:sec/ret@localhost/moonx_test",
    ],
  ])(
    "refuses a connection string in %s, whose password would be an argument",
    async (_, databaseUrlDirect) => {
      const result = await backup(databaseUrlDirect);

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain(
        "DATABASE_URL_DIRECT must be a postgres:// URL with any password in its user:password@ part",
      );
      expect(pgDumpArguments()).toEqual([]);
      expect(uploads).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "fails and uploads nothing when pg_dump fails",
    async () => {
      const missing = new URL(sourceUrl);
      missing.pathname = `/${testName.slice(0, -"_test".length)}_missing_test`;

      const result = await backup(missing.toString());

      expect(result.exitCode).not.toBe(0);
      expect(result.stderr).toContain("does not exist");
      expect(uploads).toEqual([]);
    },
    TIMEOUT_MS,
  );

  test(
    "fails when Cloud Storage refuses the upload",
    async () => {
      const refusing = Bun.serve({
        port: 0,
        fetch: () =>
          Response.json(
            { error: { code: 403, message: "denied" } },
            {
              status: 403,
            },
          ),
      });
      try {
        const result = await backup(sourceUrl, refusing.url.origin);

        expect(result.exitCode).not.toBe(0);
        // Cloud Storage's own message reaches the workflow's log (--fail-with-body).
        expect(result.stdout).toContain("denied");
      } finally {
        refusing.stop(true);
      }
    },
    TIMEOUT_MS,
  );
});
