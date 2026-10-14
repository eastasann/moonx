// make db-check BASE=...: migrations only ever grow (SDD 2章「make ターゲット」, ADR-009).
// drizzle-orm 0.45 applies a migration only when its `when` is later than the newest one
// the database has, and skips older ones without an error, so rewriting a migration or
// adding one with an older timestamp would leave some databases silently behind.

/** The folder this check guards: `out` in drizzle.config.ts, read by the migrator. */
export const MIGRATIONS_DIR = "packages/db/migrations";
const JOURNAL = `${MIGRATIONS_DIR}/meta/_journal.json`;

/** One problem, and the kind of fix it needs. */
export interface Problem {
  kind: "existing" | "order";
  message: string;
}

const HINTS: Record<Problem["kind"], string> = {
  existing:
    "Migrations already on BASE never change: add a new migration instead (docs/03_dev-setup.md 4章).",
  order:
    "A migration added since BASE must be later than BASE's last one: delete it and its journal row, then run make db-generate again on top of BASE.",
};

type Row = Record<string, unknown>;

function git(repoDir: string, args: string[]): string {
  const result = Bun.spawnSync(["git", "-C", repoDir, ...args], {
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout.toString();
}

function resolveCommit(repoDir: string, ref: string): string {
  try {
    return git(repoDir, ["rev-parse", "--verify", `${ref}^{commit}`]).trim();
  } catch (error) {
    throw new Error(`${ref} is not a commit (${(error as Error).message})`);
  }
}

/** The files under the migrations folder at `commit`, as path → blob id. */
function migrationFiles(repoDir: string, commit: string): Map<string, string> {
  const files = new Map<string, string>();
  const listing = git(repoDir, [
    "ls-tree",
    "-r",
    "-z",
    "--full-tree",
    commit,
    "--",
    MIGRATIONS_DIR,
  ]);
  for (const line of listing.split("\0")) {
    const match = line.match(/^\d+ \w+ (\w+)\t(.*)$/s);
    if (match?.[1] !== undefined && match[2] !== undefined) {
      files.set(match[2], match[1]);
    }
  }
  return files;
}

/** The journal's rows at `commit`; `undefined` when the commit has no journal. */
function journalRows(
  repoDir: string,
  commit: string,
  files: Map<string, string>,
): unknown[] | undefined {
  if (!files.has(JOURNAL)) return undefined;
  const text = git(repoDir, ["show", `${commit}:${JOURNAL}`]);
  let entries: unknown;
  try {
    entries = (JSON.parse(text) as { entries?: unknown } | null)?.entries;
  } catch (error) {
    throw new Error(
      `${JOURNAL} at ${commit} is not valid JSON (${(error as Error).message})`,
    );
  }
  if (!Array.isArray(entries)) {
    throw new Error(`${JOURNAL} at ${commit} has no entries array`);
  }
  return entries;
}

const isRow = (value: unknown): value is Row =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasIntegerWhen = (row: unknown): row is Row & { when: number } =>
  isRow(row) && typeof row.when === "number" && Number.isSafeInteger(row.when);

const describeRow = (row: unknown, index: number) =>
  `journal row ${index}${isRow(row) && typeof row.tag === "string" && row.tag !== "" ? ` (${row.tag})` : ""}`;

/**
 * Compares the migrations of `head` with those of `base` and returns every problem, none
 * when the migrations only grew. Existing files must be unchanged and still there, and
 * existing journal rows unchanged and still there. Each added row needs an integer `when`
 * later than every row before it, those of `base` included (none when `base` has no
 * journal), and a tag no earlier row uses whose `.sql` file is new since `base`.
 *
 * @throws {Error} when `base` or `head` is not a commit, a journal cannot be read, or a
 * row of `base`'s journal has no integer `when` to order the added rows against.
 */
export function checkMigrations(
  repoDir: string,
  base: string,
  head = "HEAD",
): Problem[] {
  const baseCommit = resolveCommit(repoDir, base);
  const headCommit = resolveCommit(repoDir, head);
  const baseFiles = migrationFiles(repoDir, baseCommit);
  const headFiles = migrationFiles(repoDir, headCommit);
  const problems: Problem[] = [];
  const existing = (message: string) =>
    problems.push({ kind: "existing", message });
  const order = (message: string) => problems.push({ kind: "order", message });

  for (const [path, blob] of baseFiles) {
    if (path === JOURNAL) continue;
    const headBlob = headFiles.get(path);
    if (headBlob === undefined) existing(`${path}: deleted`);
    else if (headBlob !== blob) existing(`${path}: changed`);
  }

  const baseRows = journalRows(repoDir, baseCommit, baseFiles);
  const headRows = journalRows(repoDir, headCommit, headFiles);
  if (baseRows !== undefined && headRows === undefined) {
    existing(`${JOURNAL}: deleted`);
    return problems;
  }
  const oldRows = baseRows ?? [];
  const rows = headRows ?? [];
  oldRows.forEach((row, index) => {
    if (index >= rows.length) existing(`${describeRow(row, index)}: deleted`);
    else if (!Bun.deepEquals(rows[index], row)) {
      existing(`${describeRow(row, index)}: changed`);
    }
  });

  const tags = new Map<string, number>();
  oldRows.forEach((row, index) => {
    if (isRow(row) && typeof row.tag === "string") tags.set(row.tag, index);
  });
  // The migrator applies a migration only when its `when` is later than the newest one the
  // database has, so the bound is the largest `when` of base, and base must have one in
  // every row for that bound to mean anything.
  let previous: { when: number; label: string } | undefined;
  oldRows.forEach((row, index) => {
    if (!hasIntegerWhen(row)) {
      throw new Error(
        `${JOURNAL} at ${base}: ${describeRow(row, index)} has no integer when`,
      );
    }
    if (previous === undefined || row.when >= previous.when) {
      previous = { when: row.when, label: describeRow(row, index) };
    }
  });

  rows.slice(oldRows.length).forEach((row, offset) => {
    const index = oldRows.length + offset;
    const label = describeRow(row, index);
    if (!isRow(row)) {
      order(`${label}: not an object`);
      return;
    }
    if (typeof row.tag !== "string" || row.tag === "") {
      order(`${label}: tag is not a name`);
    } else {
      const usedBy = tags.get(row.tag);
      const sql = `${MIGRATIONS_DIR}/${row.tag}.sql`;
      if (usedBy !== undefined) {
        order(`${label}: tag is already used by journal row ${usedBy}`);
      } else if (!headFiles.has(sql) || baseFiles.has(sql)) {
        order(`${label}: ${sql} is not a file added since BASE`);
      }
      tags.set(row.tag, index);
    }
    if (!hasIntegerWhen(row)) {
      order(`${label}: when is not an integer`);
      return;
    }
    if (previous !== undefined && row.when <= previous.when) {
      order(
        `${label}: when ${row.when} is not later than ${previous.when} of ${previous.label}`,
      );
    }
    previous = { when: row.when, label };
  });
  return problems;
}

if (import.meta.main) {
  const base = process.argv[2];
  if (base === undefined || base === "") {
    console.error("usage: bun scripts/db-check.ts <BASE>");
    process.exit(1);
  }
  let problems: Problem[];
  try {
    problems = checkMigrations(process.cwd(), base);
  } catch (error) {
    console.error(`db-check: ${(error as Error).message}`);
    process.exit(1);
  }
  for (const problem of problems) console.error(problem.message);
  if (problems.length > 0) {
    console.error(`db-check: ${problems.length} problem(s) since ${base}`);
    for (const kind of new Set(problems.map((problem) => problem.kind))) {
      console.error(HINTS[kind]);
    }
    process.exit(1);
  }
}
