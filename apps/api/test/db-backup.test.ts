import { expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");

test("make db-backup hands the connection URL to pg_dump", () => {
  const url = "postgres://user:secret@db.example.test:5432/app";
  // Command-line variables beat the ones `.env` sets.
  const run = Bun.spawnSync(
    [
      "make",
      "-n",
      "db-backup",
      "ENV=staging",
      "GCP_PROJECT_ID=moonx-test",
      `DATABASE_URL_DIRECT=${url}`,
    ],
    { cwd: root, env: { PATH: process.env.PATH } },
  );
  expect(run.exitCode).toBe(0);
  const plan = run.stdout.toString();
  expect(plan).toMatch(
    /pg_dump -Fc -d "postgres:\/\/user:secret@db\.example\.test:5432\/app" -f \S+\.dump/,
  );
  expect(plan).not.toContain("PGDATABASE");
});

const pgDump = Bun.which("pg_dump");

test.skipIf(!pgDump)("pg_dump writes a non-empty dump of the test database", () => {
  const url = process.env.DATABASE_URL_TEST;
  expect(url).toBeTruthy();
  const dir = mkdtempSync(join(tmpdir(), "moonx-backup-"));
  const file = join(dir, "backup.dump");
  try {
    const run = Bun.spawnSync([pgDump as string, "-Fc", "-d", url as string, "-f", file]);
    expect(run.stderr.toString()).toBe("");
    expect(run.exitCode).toBe(0);
    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
