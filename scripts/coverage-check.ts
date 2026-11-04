import { readFileSync } from "node:fs";
import { join } from "node:path";

/** A layer of SDD 10章 with a coverage target, as `make coverage` measures it. */
export interface Target {
  name: string;
  /** The lcov file Bun wrote for the layer's suite. */
  lcov: string;
  /** The layer's own source files, under this directory of the repository. */
  directory: string;
  /** The least share of lines run, 0–1. */
  lines: number;
  /** The least share of functions run, 0–1, where the layer has a target for them. */
  functions?: number;
  /**
   * Files no test loads, left out of the sums: entry points the suites run as a process
   * of their own, and re-exports.
   */
  entries: readonly string[];
}

export const TARGETS: readonly Target[] = [
  {
    name: "packages/domain",
    lcov: "coverage/domain/lcov.info",
    directory: "packages/domain/src",
    lines: 0.95,
    entries: ["packages/domain/src/index.ts"],
  },
  {
    name: "apps/api",
    lcov: "coverage/api/lcov.info",
    directory: "apps/api/src",
    lines: 0.8,
    functions: 0.8,
    entries: ["apps/api/src/index.ts"],
  },
];

/** Lines and functions found and run, summed over files. */
export interface Totals {
  linesFound: number;
  linesHit: number;
  functionsFound: number;
  functionsHit: number;
}

const FIELDS = {
  LF: "linesFound",
  LH: "linesHit",
  FNF: "functionsFound",
  FNH: "functionsHit",
} as const;

/** The totals of each source file in an lcov report, by the path it names. */
export function readLcov(text: string): Map<string, Totals> {
  const files = new Map<string, Totals>();
  let current: Totals | null = null;
  for (const line of text.split("\n")) {
    const [key = "", value = ""] = line.trim().split(/:(.*)/s);
    if (key === "SF") {
      current = {
        linesFound: 0,
        linesHit: 0,
        functionsFound: 0,
        functionsHit: 0,
      };
      files.set(value, current);
    } else if (current !== null && key in FIELDS) {
      current[FIELDS[key as keyof typeof FIELDS]] += Number(value);
    } else if (key === "end_of_record") {
      current = null;
    }
  }
  return files;
}

/** The layer's source files: TypeScript under its directory, not tests or declarations. */
export function sourceFiles(directory: string, cwd = process.cwd()): string[] {
  return [...new Bun.Glob("**/*.{ts,tsx}").scanSync(join(cwd, directory))]
    .filter((path) => !/\.test\.tsx?$/.test(path) && !path.endsWith(".d.ts"))
    .map((path) => `${directory}/${path}`)
    .sort();
}

/**
 * What falls short of `target`: each source file the report lacks (Bun reports only the
 * files a test loaded, so one no test loads would otherwise not count), and each share
 * under its target. Empty when the layer meets it.
 */
export function shortfalls(
  target: Target,
  report: Map<string, Totals>,
  sources: readonly string[],
): { totals: Totals; problems: string[] } {
  const totals: Totals = {
    linesFound: 0,
    linesHit: 0,
    functionsFound: 0,
    functionsHit: 0,
  };
  const problems: string[] = [];
  for (const source of sources) {
    if (target.entries.includes(source)) continue;
    const file = report.get(source);
    if (file === undefined) {
      problems.push(`${source}: no test loads it`);
      continue;
    }
    for (const field of Object.values(FIELDS)) totals[field] += file[field];
  }
  const share = (hit: number, found: number) => (found === 0 ? 1 : hit / found);
  const lines = share(totals.linesHit, totals.linesFound);
  if (lines < target.lines) {
    problems.push(
      `lines ${percent(lines)} under ${percent(target.lines)} (${totals.linesHit}/${totals.linesFound})`,
    );
  }
  const functions = share(totals.functionsHit, totals.functionsFound);
  if (target.functions !== undefined && functions < target.functions) {
    problems.push(
      `functions ${percent(functions)} under ${percent(target.functions)} (${totals.functionsHit}/${totals.functionsFound})`,
    );
  }
  return { totals, problems };
}

const percent = (share: number) => `${(share * 100).toFixed(2)}%`;

if (import.meta.main) {
  let failed = false;
  for (const target of TARGETS) {
    const { totals, problems } = shortfalls(
      target,
      readLcov(readFileSync(target.lcov, "utf8")),
      sourceFiles(target.directory),
    );
    console.log(
      `${target.name}: lines ${percent(totals.linesHit / totals.linesFound)}, functions ${percent(totals.functionsHit / totals.functionsFound)}`,
    );
    for (const problem of problems) console.error(`${target.name}: ${problem}`);
    failed ||= problems.length > 0;
  }
  if (failed) process.exit(1);
}
