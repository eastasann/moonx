import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import drizzleConfig from "../packages/db/drizzle.config";
import { migrationsFolder } from "../packages/db/src/migrate";
import { checkMigrations, MIGRATIONS_DIR } from "./db-check";

const MIGRATIONS = "packages/db/migrations";
const JOURNAL = `${MIGRATIONS}/meta/_journal.json`;

let repo: string;

function git(...args: string[]): string {
  const result = Bun.spawnSync(
    [
      "git",
      "-C",
      repo,
      "-c",
      "user.name=test",
      "-c",
      "user.email=test@example.com",
      "-c",
      "commit.gpgsign=false",
      ...args,
    ],
    { stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw new Error(result.stderr.toString());
  return result.stdout.toString().trim();
}

function write(path: string, content: string) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

/** A journal shaped like drizzle-kit's, with one row per `[tag, when]`. */
function journal(rows: [string, number][]): string {
  return `${JSON.stringify(
    {
      version: "7",
      dialect: "postgresql",
      entries: rows.map(([tag, when], idx) => ({
        idx,
        version: "7",
        when,
        tag,
        breakpoints: true,
      })),
    },
    null,
    2,
  )}\n`;
}

/** Writes each migration's SQL file and snapshot as make db-generate does; callers write the journal. */
function addMigrations(rows: [string, number][]) {
  for (const [tag] of rows) {
    write(`${MIGRATIONS}/${tag}.sql`, `CREATE TABLE "${tag}" ();\n`);
    write(
      `${MIGRATIONS}/meta/${tag.slice(0, 4)}_snapshot.json`,
      `{"id":"${tag}"}\n`,
    );
  }
}

function commit(message: string): string {
  git("add", "-A");
  git("commit", "--allow-empty", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

const FIRST: [string, number][] = [
  ["0000_first", 1000],
  ["0001_second", 2000],
];
let base: string;
const messages = (from: string) =>
  checkMigrations(repo, from).map((problem) => problem.message);

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "moonx-db-check-"));
  git("init", "-q");
  write("README.md", "base\n");
  addMigrations(FIRST);
  write(JOURNAL, journal(FIRST));
  base = commit("base");
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkMigrations", () => {
  test("passes when nothing changed", () => {
    expect(messages(base)).toEqual([]);
  });

  test("passes when migrations are only added, each later than the one before", () => {
    const rows: [string, number][] = [
      ...FIRST,
      ["0002_third", 3000],
      ["0003_fourth", 4000],
    ];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows));
    write("README.md", "outside the migrations\n");
    commit("add");

    expect(messages(base)).toEqual([]);
  });

  test("fails when an existing migration is changed or deleted", () => {
    write(`${MIGRATIONS}/0000_first.sql`, "DROP TABLE users;\n");
    rmSync(join(repo, MIGRATIONS, "0001_second.sql"));
    commit("rewrite");

    expect(messages(base)).toEqual([
      `${MIGRATIONS}/0000_first.sql: changed`,
      `${MIGRATIONS}/0001_second.sql: deleted`,
    ]);
  });

  test("fails when an existing snapshot is changed", () => {
    write(`${MIGRATIONS}/meta/0001_snapshot.json`, "{}\n");
    commit("rewrite");

    expect(messages(base)).toEqual([
      `${MIGRATIONS}/meta/0001_snapshot.json: changed`,
    ]);
  });

  test("fails when an existing journal row is changed", () => {
    write(
      JOURNAL,
      journal([
        ["0000_first", 1000],
        ["0001_second", 2500],
      ]),
    );
    commit("rewrite");

    expect(messages(base)).toEqual(["journal row 1 (0001_second): changed"]);
  });

  test("fails when an existing journal row is deleted", () => {
    write(JOURNAL, journal(FIRST.slice(0, 1)));
    commit("rewrite");

    expect(messages(base)).toEqual(["journal row 1 (0001_second): deleted"]);
  });

  test("fails when the journal is deleted", () => {
    rmSync(join(repo, JOURNAL));
    commit("rewrite");

    expect(messages(base)).toEqual([`${JOURNAL}: deleted`]);
  });

  test("ignores the key order of a journal row", () => {
    const text = journal(FIRST).replace(
      '"idx": 0,\n      "version": "7",',
      '"version": "7",\n      "idx": 0,',
    );
    expect(text).not.toBe(journal(FIRST));
    write(JOURNAL, text);
    commit("reorder");

    expect(messages(base)).toEqual([]);
  });

  test.each([
    ["older than", 1500],
    ["the same as", 2000],
  ])("fails when an added row's when is %s the base's last row", (_, when) => {
    const rows: [string, number][] = [...FIRST, ["0002_third", when]];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows));
    commit("add");

    expect(messages(base)).toEqual([
      `journal row 2 (0002_third): when ${when} is not later than 2000 of journal row 1 (0001_second)`,
    ]);
  });

  test("fails when added rows do not increase among themselves", () => {
    const rows: [string, number][] = [
      ...FIRST,
      ["0002_third", 4000],
      ["0003_fourth", 3000],
    ];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows));
    commit("add");

    expect(messages(base)).toEqual([
      "journal row 3 (0003_fourth): when 3000 is not later than 4000 of journal row 2 (0002_third)",
    ]);
  });

  test.each([
    ["a string", '"3000"'],
    ["a fraction", "3000.5"],
  ])("fails when an added row's when is %s", (_, when) => {
    addMigrations([["0002_third", 3000]]);
    const text = journal([...FIRST, ["0002_third", 3000]]).replace(
      '"when": 3000',
      `"when": ${when}`,
    );
    write(JOURNAL, text);
    commit("add");

    expect(messages(base)).toEqual([
      "journal row 2 (0002_third): when is not an integer",
    ]);
  });

  test("compares the row after a row without a usable when with the one before", () => {
    const rows: [string, number][] = [
      ...FIRST,
      ["0002_third", 3000],
      ["0003_fourth", 1500],
    ];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows).replace('"when": 3000', '"when": null'));
    commit("add");

    expect(messages(base)).toEqual([
      "journal row 2 (0002_third): when is not an integer",
      "journal row 3 (0003_fourth): when 1500 is not later than 2000 of journal row 1 (0001_second)",
    ]);
  });

  test("fails when an added row reuses a tag", () => {
    write(JOURNAL, journal([...FIRST, ["0000_first", 3000]]));
    commit("add");

    expect(messages(base)).toEqual([
      "journal row 2 (0000_first): tag is already used by journal row 0",
    ]);
  });

  test.each([
    ["empty", '""'],
    ["not a string", "2"],
  ])("fails when an added row's tag is %s", (_, tag) => {
    addMigrations([["0002_third", 3000]]);
    write(
      JOURNAL,
      journal([...FIRST, ["0002_third", 3000]]).replace(
        '"tag": "0002_third"',
        `"tag": ${tag}`,
      ),
    );
    commit("add");

    expect(messages(base)).toEqual(["journal row 2: tag is not a name"]);
  });

  test("fails when an added row has no SQL file of its own", () => {
    write(JOURNAL, journal([...FIRST, ["0002_third", 3000]]));
    commit("add");

    expect(messages(base)).toEqual([
      `journal row 2 (0002_third): ${MIGRATIONS}/0002_third.sql is not a file added since BASE`,
    ]);
  });

  test("fails when an added row is not an object", () => {
    write(
      JOURNAL,
      journal(FIRST).replace(/\n {2}\]\n\}\n$/, ",\n    null\n  ]\n}\n"),
    );
    commit("add");

    expect(messages(base)).toEqual(["journal row 2: not an object"]);
  });

  test("tells changes to existing migrations from added ones out of order", () => {
    write(`${MIGRATIONS}/0000_first.sql`, "DROP TABLE users;\n");
    const rows: [string, number][] = [...FIRST, ["0002_third", 1500]];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows));
    commit("add");

    expect(checkMigrations(repo, base).map((problem) => problem.kind)).toEqual([
      "existing",
      "order",
    ]);
  });

  test.each([
    ["not valid JSON", "{", "is not valid JSON"],
    ["without an entries array", '{"entries": {}}', "has no entries array"],
  ])("throws when the journal is %s", (_, text, message) => {
    write(JOURNAL, text);
    commit("break");

    expect(() => checkMigrations(repo, base)).toThrow(message);
  });

  test("throws when a row of the base journal has no integer when", () => {
    const text = journal(FIRST).replace('"when": 2000', '"when": "2000"');
    write(JOURNAL, text);
    base = commit("malformed base");
    addMigrations([["0002_third", 1]]);
    write(
      JOURNAL,
      journal([...FIRST, ["0002_third", 1]]).replace(
        '"when": 2000',
        '"when": "2000"',
      ),
    );
    commit("add");

    expect(() => checkMigrations(repo, base)).toThrow(
      "journal row 1 (0001_second) has no integer when",
    );
  });

  test("orders added rows after the largest when of the base journal", () => {
    const unordered: [string, number][] = [
      ["0000_first", 3000],
      ["0001_second", 2000],
    ];
    write(JOURNAL, journal(unordered));
    base = commit("unordered base");
    const rows: [string, number][] = [...unordered, ["0002_third", 2500]];
    addMigrations(rows.slice(2));
    write(JOURNAL, journal(rows));
    commit("add");

    expect(messages(base)).toEqual([
      "journal row 2 (0002_third): when 2500 is not later than 3000 of journal row 0 (0000_first)",
    ]);
  });

  test("reports every problem at once", () => {
    write(`${MIGRATIONS}/0000_first.sql`, "DROP TABLE users;\n");
    addMigrations([["0002_third", 1500]]);
    write(
      JOURNAL,
      journal([
        ["0000_first", 1000],
        ["0001_second", 2500],
        ["0002_third", 1500],
      ]),
    );
    commit("rewrite");

    expect(messages(base)).toEqual([
      `${MIGRATIONS}/0000_first.sql: changed`,
      "journal row 1 (0001_second): changed",
      "journal row 2 (0002_third): when 1500 is not later than 2000 of journal row 1 (0001_second)",
    ]);
  });

  test("throws when BASE is not a commit", () => {
    expect(() => checkMigrations(repo, "no-such-ref")).toThrow(
      "no-such-ref is not a commit",
    );
  });

  test("guards the folder drizzle-kit writes to and the migrator reads", () => {
    const root = resolve(import.meta.dir, "..");
    expect(resolve(root, "packages/db", drizzleConfig.out ?? "")).toBe(
      resolve(root, MIGRATIONS_DIR),
    );
    expect(migrationsFolder).toBe(resolve(root, MIGRATIONS_DIR));
  });

  describe("when BASE has no journal (the first migration)", () => {
    let empty: string;

    beforeEach(() => {
      rmSync(join(repo, MIGRATIONS), { recursive: true });
      empty = commit("no migrations");
    });

    test("passes when the added rows' when increase", () => {
      addMigrations(FIRST);
      write(JOURNAL, journal(FIRST));
      commit("first");

      expect(messages(empty)).toEqual([]);
    });

    test.each([
      ["the same", 1000],
      ["older", 900],
    ])("fails when an added row's when is %s as the row before", (_, when) => {
      const rows: [string, number][] = [
        ["0000_first", 1000],
        ["0001_second", when],
      ];
      addMigrations(rows);
      write(JOURNAL, journal(rows));
      commit("first");

      expect(messages(empty)).toEqual([
        `journal row 1 (0001_second): when ${when} is not later than 1000 of journal row 0 (0000_first)`,
      ]);
    });
  });
});

describe("db-check command", () => {
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(
      ["bun", join(import.meta.dir, "db-check.ts"), ...args],
      { cwd: repo, stderr: "pipe" },
    );
    return { exitCode: result.exitCode, stderr: result.stderr.toString() };
  };

  test("exits 0 when the migrations only grew", () => {
    expect(run(base)).toEqual({ exitCode: 0, stderr: "" });
  });

  test("lists the problems and exits 1", () => {
    rmSync(join(repo, MIGRATIONS, "0001_second.sql"));
    commit("delete");

    const result = run(base);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`${MIGRATIONS}/0001_second.sql: deleted\n`);
    expect(result.stderr).toContain(`db-check: 1 problem(s) since ${base}`);
    expect(result.stderr).toContain("add a new migration instead");
  });

  test("exits 1 when BASE is not a commit", () => {
    const result = run("no-such-ref");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("db-check: no-such-ref is not a commit (");
  });

  test("exits 1 without BASE", () => {
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("usage: bun scripts/db-check.ts <BASE>");
  });
});
