import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { checkPromotion, versionHistory } from "./promote-check";

const STAGING = "deploy/staging/version";
const PRODUCTION = "deploy/production/version";

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

function commit(message: string): string {
  git("add", "-A");
  git("commit", "--allow-empty", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

/** A merged promotion pull request: main's commit that writes `sha` to `path`. */
function land(path: string, sha: string): string {
  write(path, `${sha}\n`);
  return commit(`chore(deploy): promote to ${sha.slice(0, 7)}`);
}

// main: c0 c1 c2 c3, staging had c1 then c2, production has c1; BASE is main's tip. Git
// is slow to start, so the history is built once and each test works on a copy.
let template: string;
let c0: string;
let c1: string;
let c2: string;
let c3: string;
let base: string;
const messages = (from = base) => checkPromotion(repo, from);

beforeAll(() => {
  template = mkdtempSync(join(tmpdir(), "moonx-promote-check-"));
  repo = template;
  git("init", "-q", "-b", "main");
  write("README.md", "0\n");
  c0 = commit("c0");
  write("README.md", "1\n");
  c1 = commit("c1");
  land(STAGING, c1);
  write("README.md", "2\n");
  c2 = commit("c2");
  land(STAGING, c2);
  land(PRODUCTION, c1);
  write("README.md", "3\n");
  c3 = commit("c3");
  base = c3;
});

afterAll(() => {
  rmSync(template, { recursive: true, force: true });
});

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "moonx-promote-check-"));
  cpSync(template, repo, { recursive: true });
});

afterEach(() => {
  rmSync(repo, { recursive: true, force: true });
});

describe("checkPromotion", () => {
  test("passes when the diff leaves deploy/ alone", () => {
    write("README.md", "4\n");
    commit("code");

    expect(messages()).toEqual([]);
  });

  test("passes a promotion to staging", () => {
    land(STAGING, c3);

    expect(messages()).toEqual([]);
  });

  test("passes a promotion to production of a SHA staging had", () => {
    land(PRODUCTION, c2);

    expect(messages()).toEqual([]);
  });

  test("passes a version file without the final newline", () => {
    write(STAGING, c3);
    commit("promote");

    expect(messages()).toEqual([]);
  });

  test("passes a rollback to a version the environment had", () => {
    land(STAGING, c1);

    expect(messages()).toEqual([]);
  });

  test("fails a rollback to a SHA the environment never had", () => {
    land(STAGING, c0);

    expect(messages()).toEqual([
      `${STAGING}: rolls back to ${c0}, which was never in ${STAGING} up to ${base}`,
    ]);
  });

  test("fails a production SHA that was never in staging", () => {
    land(PRODUCTION, c3);

    expect(messages()).toEqual([
      `${PRODUCTION}: ${c3} was never in ${STAGING} up to ${base}`,
    ]);
  });

  test("fails a production rollback that neither environment had", () => {
    land(PRODUCTION, c0);

    expect(messages()).toEqual([
      `${PRODUCTION}: rolls back to ${c0}, which was never in ${PRODUCTION} up to ${base}`,
      `${PRODUCTION}: ${c0} was never in ${STAGING} up to ${base}`,
    ]);
  });

  test("counts only what staging held up to BASE", () => {
    const stagingLater = land(STAGING, c3);
    git("switch", "-q", "-c", "early", base);
    land(PRODUCTION, c3);

    expect(messages()).toEqual([
      `${PRODUCTION}: ${c3} was never in ${STAGING} up to ${base}`,
    ]);

    git("switch", "-q", "main");
    land(PRODUCTION, c3);

    expect(checkPromotion(repo, stagingLater)).toEqual([]);
  });

  test("fails when both version files change", () => {
    write(STAGING, `${c3}\n`);
    write(PRODUCTION, `${c2}\n`);
    commit("promote both");

    expect(messages()).toEqual([
      `${PRODUCTION}, ${STAGING}: both changed in one promotion`,
    ]);
  });

  test.each([
    ["outside deploy/", "README.md", "modified"],
    ["under deploy/", "deploy/notes.md", "added"],
  ])("fails when a file %s changes with the version file", (_, path, verb) => {
    write(path, "other\n");
    land(STAGING, c3);

    expect(messages()).toEqual([`${path}: ${verb} in a promotion`]);
  });

  test("fails when another file is deleted with the version file", () => {
    rmSync(join(repo, "README.md"));
    land(STAGING, c3);

    expect(messages()).toEqual(["README.md: deleted in a promotion"]);
  });

  test("fails when only another file under deploy/ changes", () => {
    write("deploy/README.md", "notes\n");
    commit("notes");

    expect(messages()).toEqual(["deploy/README.md: added in a promotion"]);
  });

  test("fails when the version file is deleted", () => {
    rmSync(join(repo, STAGING));
    commit("delete");

    expect(messages()).toEqual([`${STAGING}: deleted`]);
  });

  test("fails when a version file moves to the other environment", () => {
    rmSync(join(repo, PRODUCTION));
    commit("drop production");
    const moved = git("rev-parse", "HEAD");
    git("mv", STAGING, PRODUCTION);
    commit("move");

    expect(checkPromotion(repo, moved)).toEqual([`${STAGING}: deleted`]);
  });

  test.each([
    ["a short SHA", (sha: string) => `${sha.slice(0, 7)}\n`],
    ["uppercase", (sha: string) => `${sha.toUpperCase()}\n`],
    ["two lines", (sha: string) => `${sha}\n${sha}\n`],
    ["a trailing space", (sha: string) => `${sha} \n`],
    ["an empty line after the SHA", (sha: string) => `${sha}\n\n`],
  ])("fails when the version file holds %s", (_, content) => {
    write(STAGING, content(c3));
    commit("promote");

    expect(messages()).toEqual([
      `${STAGING}: holds ${JSON.stringify(content(c3).slice(0, 80))}, not one full SHA (40 lowercase hex characters) on one line`,
    ]);
  });

  test("fails a SHA that is not in main at BASE", () => {
    git("switch", "-q", "-c", "side", c2);
    write("side.md", "side\n");
    const side = commit("side");
    git("switch", "-q", "main");
    land(STAGING, side);

    expect(messages()).toEqual([
      `${STAGING}: ${side} is not in main at ${base}`,
    ]);
  });

  test("fails a SHA that is in main only after BASE", () => {
    write("README.md", "4\n");
    const c4 = commit("c4");
    land(STAGING, c4);

    expect(messages(c3)).toEqual([
      "README.md: modified in a promotion",
      `${STAGING}: ${c4} is not in main at ${c3}`,
    ]);
  });

  test("fails a SHA that is no object", () => {
    const unknown = "0123456789abcdef0123456789abcdef01234567";
    land(STAGING, unknown);

    expect(messages()).toEqual([`${STAGING}: ${unknown} is not a commit`]);
  });

  test("throws when BASE is not a commit", () => {
    expect(() => checkPromotion(repo, "no-such-ref")).toThrow(
      "no-such-ref is not a commit",
    );
  });

  test("throws when HEAD is not a commit", () => {
    expect(() => checkPromotion(repo, base, "no-such-ref")).toThrow(
      "no-such-ref is not a commit",
    );
  });

  describe("when BASE has no version file for the environment (the first promotion)", () => {
    let empty: string;

    beforeEach(() => {
      rmSync(join(repo, "deploy"), { recursive: true });
      empty = commit("no deploy/");
    });

    test("passes a staging promotion of an older commit", () => {
      land(STAGING, c0);

      expect(checkPromotion(repo, empty)).toEqual([]);
    });

    test("passes a production promotion of a SHA staging had", () => {
      // staging's history up to BASE still holds c1 and c2, written before the file went.
      land(PRODUCTION, c1);

      expect(checkPromotion(repo, empty)).toEqual([]);
    });

    test("fails a production promotion of a SHA staging never had", () => {
      land(PRODUCTION, c0);

      expect(checkPromotion(repo, empty)).toEqual([
        `${PRODUCTION}: ${c0} was never in ${STAGING} up to ${empty}`,
      ]);
    });
  });
});

describe("versionHistory", () => {
  test("lists the values each commit wrote, newest first", () => {
    const tip = git("rev-parse", "HEAD");
    const writes = git("rev-list", "--first-parent", tip, "--", STAGING).split(
      "\n",
    );

    expect(versionHistory(repo, base, "staging")).toEqual([
      { commit: writes[0] ?? "", sha: c2 },
      { commit: writes[1] ?? "", sha: c1 },
    ]);
  });

  test("leaves out commits without the file, contents that are not a SHA, and rewrites of the same value", () => {
    rmSync(join(repo, STAGING));
    commit("delete");
    const again = land(STAGING, c2);
    write(STAGING, c2);
    commit("drop the newline");
    write(STAGING, "not a sha\n");
    commit("break");
    const fixed = land(STAGING, c3);
    const writes = versionHistory(repo, "HEAD", "staging");

    expect(writes.map(({ sha }) => sha)).toEqual([c3, c2, c2, c1]);
    expect(writes[0]?.commit).toBe(fixed);
    expect(writes[1]?.commit).toBe(again);
  });

  test("is empty when the file never existed", () => {
    expect(versionHistory(repo, c0, "staging")).toEqual([]);
  });
});

describe("promote-check command", () => {
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(
      ["bun", join(import.meta.dir, "promote-check.ts"), ...args],
      { cwd: repo, stderr: "pipe" },
    );
    return { exitCode: result.exitCode, stderr: result.stderr.toString() };
  };

  test("exits 0 when the diff leaves deploy/ alone", () => {
    write("README.md", "4\n");
    commit("code");

    expect(run(base)).toEqual({ exitCode: 0, stderr: "" });
  });

  test("exits 0 for a promotion, also from a subfolder", () => {
    land(STAGING, c3);
    mkdirSync(join(repo, "deploy", "staging"), { recursive: true });
    const result = Bun.spawnSync(
      ["bun", join(import.meta.dir, "promote-check.ts"), base],
      { cwd: join(repo, "deploy", "staging"), stderr: "pipe" },
    );

    expect(result.exitCode).toBe(0);
  });

  test("lists the problems and exits 1", () => {
    land(PRODUCTION, c3);

    const result = run(base);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      `${PRODUCTION}: ${c3} was never in ${STAGING} up to ${base}\n`,
    );
    expect(result.stderr).toContain(
      `promote-check: 1 problem(s) since ${base}`,
    );
    expect(result.stderr).toContain("create it with make promote");
  });

  test("exits 1 when BASE is not a commit", () => {
    const result = run("no-such-ref");
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "promote-check: no-such-ref is not a commit (",
    );
  });

  test("exits 1 without BASE", () => {
    const result = run();
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(
      "usage: bun scripts/promote-check.ts <BASE>",
    );
  });
});
