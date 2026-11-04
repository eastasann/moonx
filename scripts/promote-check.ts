// make promote-check BASE=...: a change to deploy/ is one promotion, which writes one
// environment's version file and nothing else (SDD 2章「make ターゲット」, ADR-016).
// deploy.yml deploys whatever SHA the file names once it lands on main, so this check is what
// keeps out a commit that is not on main, a rollback to a version the environment never had,
// and a production version that staging never had. ci.yml runs it before `bun install`, so
// it imports Bun's and Node's built-ins only.

/** The environments a promotion writes to. */
export const ENVIRONMENTS = ["staging", "production"] as const;

export type Environment = (typeof ENVIRONMENTS)[number];

/** The file naming the commit deployed to `env`, as deploy.yml reads it. */
export const versionFile = (env: Environment) => `deploy/${env}/version`;

/** One value a version file took on main, with the commit that wrote it. */
export interface Written {
  commit: string;
  sha: string;
}

const HINT =
  "A promotion changes only deploy/staging/version or deploy/production/version, to one full SHA of main: create it with make promote (docs/04_deployment-procedure.md 4.2).";

const FULL_SHA = /^[0-9a-f]{40}\n?$/;

const STATUS: Record<string, string> = {
  A: "added",
  D: "deleted",
  M: "modified",
  T: "changed type",
};

function run(repoDir: string, args: string[], stdin?: string) {
  const result = Bun.spawnSync(["git", "-C", repoDir, ...args], {
    stdin: stdin === undefined ? "ignore" : Buffer.from(stdin),
    stderr: "pipe",
  });
  return {
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr.toString().trim(),
  };
}

function git(repoDir: string, args: string[], stdin?: string): Buffer {
  const result = run(repoDir, args, stdin);
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

/**
 * The full SHA of the commit `ref` names.
 *
 * @throws {Error} when `ref` names no commit; the message carries git's reason (unknown,
 * ambiguous).
 */
export function resolveCommit(repoDir: string, ref: string): string {
  try {
    return git(repoDir, ["rev-parse", "--verify", `${ref}^{commit}`])
      .toString()
      .trim();
  } catch (error) {
    throw new Error(`${ref} is not a commit (${(error as Error).message})`);
  }
}

/** The full SHA of the commit `ref` names, or `undefined` when the repository has none. */
export function commitOf(repoDir: string, ref: string): string | undefined {
  const args = ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`];
  const result = run(repoDir, args);
  if (result.exitCode === 1) return undefined;
  if (result.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.toString().trim();
}

/**
 * Whether `ancestor` is `descendant` or one of its ancestors. Both must be commits: call
 * {@link commitOf} first for a SHA read from a file.
 */
export function isAncestor(
  repoDir: string,
  ancestor: string,
  descendant: string,
): boolean {
  const args = ["merge-base", "--is-ancestor", ancestor, descendant];
  const result = run(repoDir, args);
  if (result.exitCode === 0) return true;
  if (result.exitCode === 1) return false;
  throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
}

/** The SHA a version file holds, or `undefined` unless it is one full SHA on one line. */
export function parseVersion(content: string | undefined): string | undefined {
  return content !== undefined && FULL_SHA.test(content)
    ? content.slice(0, 40)
    : undefined;
}

/**
 * The content of the file at `path` (from the top of the tree) in each of `commits`, in the
 * same order; `undefined` where that commit has no file there. One git process reads them
 * all, so a long deploy/ history stays cheap.
 */
function readFiles(
  repoDir: string,
  commits: string[],
  path: string,
): (string | undefined)[] {
  if (commits.length === 0) return [];
  const out = git(
    repoDir,
    ["cat-file", "--batch"],
    commits.map((commit) => `${commit}:${path}\n`).join(""),
  );
  let offset = 0;
  return commits.map(() => {
    const end = out.indexOf(0x0a, offset);
    // "<id> <type> <size>" before the content, "<name> missing" when there is no object.
    const header = out.subarray(offset, end).toString();
    offset = end + 1;
    const match = header.match(/^[0-9a-f]+ (\w+) (\d+)$/);
    if (match === null) return undefined;
    const size = Number(match[2]);
    const content = out.subarray(offset, offset + size).toString();
    offset += size + 1;
    return match[1] === "blob" ? content : undefined;
  });
}

/** The content of the file at `path` (from the top of the tree) at `commit`, if it has one. */
export function readFileAt(
  repoDir: string,
  commit: string,
  path: string,
): string | undefined {
  return readFiles(repoDir, [commit], path)[0];
}

/**
 * The values `deploy/{env}/version` took on the first-parent history of `base`, newest
 * first, each with the commit that wrote it: a commit is listed when the file there holds a
 * full SHA that differs from what it held at the commit's first parent. Commits without the
 * file, and contents that are not one full SHA, are left out; a value written again after
 * such a commit is listed again.
 */
export function versionHistory(
  repoDir: string,
  base: string,
  env: Environment,
): Written[] {
  const path = versionFile(env);
  const commits = git(repoDir, [
    "rev-list",
    "--first-parent",
    base,
    "--",
    `:(top)${path}`,
  ])
    .toString()
    .split("\n")
    .filter((line) => line !== "");
  // rev-list lists the commits that changed the file, so the next one down the list holds
  // what the file was at a commit's first parent (nothing after the oldest).
  const values = readFiles(repoDir, commits, path).map(parseVersion);
  const written: Written[] = [];
  commits.forEach((commit, index) => {
    const sha = values[index];
    if (sha !== undefined && sha !== values[index + 1]) {
      written.push({ commit, sha });
    }
  });
  return written;
}

/**
 * Checks the change to deploy/ from `base` to `head` and returns every problem, none when
 * the diff leaves deploy/ alone or is one valid promotion: exactly one changed file, which is
 * `deploy/staging/version` or `deploy/production/version`, added or modified, holding one
 * full SHA on one line. That SHA is a commit in main at `base`; when it is older than the
 * environment's version at `base` (a rollback), the environment's file held it at some commit
 * up to `base`; for production, `deploy/staging/version` held it at some commit up to
 * `base`.
 *
 * @throws {Error} when `base` or `head` is not a commit.
 */
export function checkPromotion(
  repoDir: string,
  base: string,
  head = "HEAD",
): string[] {
  const baseCommit = resolveCommit(repoDir, base);
  const headCommit = resolveCommit(repoDir, head);
  // Without --no-renames, a version file moved to the other environment would show as one
  // rename and hide the deletion.
  const fields = git(repoDir, [
    "diff",
    "--name-status",
    "--no-renames",
    "-z",
    baseCommit,
    headCommit,
  ])
    .toString()
    .split("\0");
  const changes: { status: string; path: string }[] = [];
  for (let index = 0; index + 1 < fields.length; index += 2) {
    changes.push({
      status: fields[index] ?? "",
      path: fields[index + 1] ?? "",
    });
  }
  if (!changes.some(({ path }) => path.startsWith("deploy/"))) return [];

  const problems: string[] = [];
  const histories = new Map<Environment, Set<string>>();
  const written = (env: Environment) => {
    let values = histories.get(env);
    if (values === undefined) {
      values = new Set(
        versionHistory(repoDir, baseCommit, env).map(({ sha }) => sha),
      );
      histories.set(env, values);
    }
    return values;
  };

  const promoted: Environment[] = [];
  for (const { status, path } of changes) {
    const env = ENVIRONMENTS.find((name) => versionFile(name) === path);
    if (env === undefined) {
      problems.push(
        `${path}: ${STATUS[status] ?? `changed (${status})`} in a promotion`,
      );
    } else if (status === "A" || status === "M") {
      promoted.push(env);
    } else {
      problems.push(`${path}: ${STATUS[status] ?? `changed (${status})`}`);
    }
  }
  if (promoted.length > 1) {
    problems.push(
      `${promoted.map(versionFile).join(", ")}: both changed in one promotion`,
    );
  }

  for (const env of promoted) {
    const path = versionFile(env);
    const content = readFileAt(repoDir, headCommit, path);
    const sha = parseVersion(content);
    if (sha === undefined) {
      problems.push(
        `${path}: holds ${JSON.stringify(content?.slice(0, 80))}, not one full SHA (40 lowercase hex characters) on one line`,
      );
      continue;
    }
    if (commitOf(repoDir, sha) === undefined) {
      problems.push(`${path}: ${sha} is not a commit`);
    } else if (!isAncestor(repoDir, sha, baseCommit)) {
      problems.push(`${path}: ${sha} is not in main at ${base}`);
    } else {
      const current = parseVersion(readFileAt(repoDir, baseCommit, path));
      const rollsBack =
        current !== undefined &&
        current !== sha &&
        commitOf(repoDir, current) !== undefined &&
        isAncestor(repoDir, sha, current);
      if (rollsBack && !written(env).has(sha)) {
        problems.push(
          `${path}: rolls back to ${sha}, which was never in ${path} up to ${base}`,
        );
      }
    }
    if (env === "production" && !written("staging").has(sha)) {
      problems.push(
        `${path}: ${sha} was never in ${versionFile("staging")} up to ${base}`,
      );
    }
  }
  return problems;
}

if (import.meta.main) {
  const base = process.argv[2];
  if (base === undefined || base === "") {
    console.error("usage: bun scripts/promote-check.ts <BASE>");
    process.exit(1);
  }
  let problems: string[];
  try {
    problems = checkPromotion(process.cwd(), base);
  } catch (error) {
    console.error(`promote-check: ${(error as Error).message}`);
    process.exit(1);
  }
  for (const problem of problems) console.error(problem);
  if (problems.length > 0) {
    console.error(`promote-check: ${problems.length} problem(s) since ${base}`);
    console.error(HINT);
    process.exit(1);
  }
}
