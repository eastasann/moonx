import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  readLcov,
  shortfalls,
  sourceFiles,
  TARGETS,
  type Target,
} from "./coverage-check";

const record = (path: string, lf: number, lh: number, fnf = 0, fnh = 0) =>
  `TN:\nSF:${path}\nFNF:${fnf}\nFNH:${fnh}\nDA:1,1\nLF:${lf}\nLH:${lh}\nend_of_record\n`;

const api: Target = {
  name: "apps/api",
  lcov: "coverage/api/lcov.info",
  directory: "apps/api/src",
  lines: 0.8,
  functions: 0.8,
  entries: ["apps/api/src/index.ts"],
};

describe("readLcov", () => {
  test("sums each file's lines and functions found and run", () => {
    const report = readLcov(
      record("apps/api/src/a.ts", 10, 9, 4, 3) +
        record("packages/db/src/b.ts", 5, 0),
    );
    expect(report.get("apps/api/src/a.ts")).toEqual({
      linesFound: 10,
      linesHit: 9,
      functionsFound: 4,
      functionsHit: 3,
    });
    expect(report.get("packages/db/src/b.ts")?.linesHit).toBe(0);
  });
});

describe("shortfalls (SDD 10章)", () => {
  const sources = [
    "apps/api/src/a.ts",
    "apps/api/src/b.ts",
    "apps/api/src/index.ts",
  ];

  test("met: summed over the layer's own files, other packages left out", () => {
    const report = readLcov(
      record("apps/api/src/a.ts", 100, 90, 10, 9) +
        record("apps/api/src/b.ts", 100, 72, 10, 7) +
        record("packages/db/src/c.ts", 100, 0, 10, 0),
    );
    const { totals, problems } = shortfalls(api, report, sources);
    expect(totals).toEqual({
      linesFound: 200,
      linesHit: 162,
      functionsFound: 20,
      functionsHit: 16,
    });
    expect(problems).toEqual([]);
  });

  test("lines and functions under their targets", () => {
    const report = readLcov(
      record("apps/api/src/a.ts", 100, 70, 10, 7) +
        record("apps/api/src/b.ts", 100, 80, 10, 8),
    );
    expect(shortfalls(api, report, sources).problems).toEqual([
      "lines 75.00% under 80.00% (150/200)",
      "functions 75.00% under 80.00% (15/20)",
    ]);
  });

  test("a source file no test loads, the entry aside", () => {
    const report = readLcov(record("apps/api/src/a.ts", 10, 10, 1, 1));
    expect(shortfalls(api, report, sources).problems).toEqual([
      "apps/api/src/b.ts: no test loads it",
    ]);
  });

  test("a layer without a function target is not held to one", () => {
    const domain = TARGETS.find(({ name }) => name === "packages/domain");
    const report = readLcov(record("packages/domain/src/a.ts", 100, 96, 10, 1));
    expect(
      domain &&
        shortfalls(domain, report, ["packages/domain/src/a.ts"]).problems,
    ).toEqual([]);
  });
});

describe("sourceFiles", () => {
  const root = mkdtempSync(join(tmpdir(), "moonx-coverage-"));
  afterAll(() => rmSync(root, { recursive: true }));

  test("TypeScript under the directory, not tests or declarations", () => {
    for (const path of [
      "src/a.ts",
      "src/a.test.ts",
      "src/b/c.tsx",
      "src/b/c.test.tsx",
      "src/types.d.ts",
      "src/data.json",
    ]) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), "");
    }
    expect(sourceFiles("src", root)).toEqual(["src/a.ts", "src/b/c.tsx"]);
  });
});
