import { describe, expect, test } from "bun:test";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse } from "@babel/parser";
import type { Statement } from "@babel/types";
import { migrationsFolder } from "./migrate";

const ROOT = join(import.meta.dir, "../../..");

/** The one TypeScript block of SDD 6.3, which schema.ts copies. */
function sddSchemaCode(): string {
  const doc = readFileSync(
    join(ROOT, "docs/02-01_system-design-doc.md"),
    "utf8",
  );
  const start = doc.indexOf("\n### 6.3 ");
  const end = doc.indexOf("\n### 6.4 ", start);
  if (start < 0 || end < 0) throw new Error("SDD 6.3 not found");
  const blocks = [
    ...doc.slice(start, end).matchAll(/^```ts\n([\s\S]*?)^```$/gm),
  ];
  if (blocks.length !== 1) {
    throw new Error(`SDD 6.3 has ${blocks.length} ts blocks, expected 1`);
  }
  return blocks[0]?.[1] ?? "";
}

// Positions, comments and formatting details (quotes, parentheses, trailing commas) live
// in these keys; dropping them leaves what the code means.
const IGNORED_KEYS = new Set([
  "start",
  "end",
  "loc",
  "range",
  "extra",
  "comments",
  "leadingComments",
  "trailingComments",
  "innerComments",
]);

/** The name a top-level statement declares, or its first line when it declares none. */
function label(node: Statement, code: string): string {
  const declaration =
    node.type === "ExportNamedDeclaration" ? node.declaration : node;
  const id =
    declaration?.type === "VariableDeclaration"
      ? declaration.declarations[0]?.id
      : undefined;
  if (id?.type === "Identifier") return id.name;
  return code.slice(node.start ?? 0, node.end ?? 0).split("\n")[0] ?? "";
}

/** Each top-level statement as a label and its syntax tree without formatting. */
function statements(code: string): { label: string; tree: string }[] {
  const program = parse(code, {
    sourceType: "module",
    plugins: ["typescript"],
  }).program;
  return program.body.map((node) => ({
    label: label(node, code),
    tree: JSON.stringify(node, (key, value) =>
      IGNORED_KEYS.has(key) ? undefined : value,
    ),
  }));
}

/** Every file under `dir`, as relative path → content. */
function filesIn(dir: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const path = join(entry.parentPath, entry.name);
        return [relative(dir, path), readFileSync(path, "utf8")];
      }),
  );
}

describe("schema.ts", () => {
  test("is the code of SDD 6.3, comments and formatting aside", () => {
    const sdd = statements(sddSchemaCode());
    const schema = statements(
      readFileSync(join(import.meta.dir, "schema.ts"), "utf8"),
    );
    const differences: string[] = [];
    for (let i = 0; i < Math.max(sdd.length, schema.length); i++) {
      if (sdd[i]?.tree !== schema[i]?.tree) {
        differences.push(
          `statement ${i + 1}: SDD ${sdd[i]?.label} / schema.ts ${schema[i]?.label}`,
        );
      }
    }
    expect(differences).toEqual([]);
  });

  test("has no change that make db-generate has yet to turn into a migration", () => {
    const work = mkdtempSync(join(tmpdir(), "moonx-db-generate-"));
    try {
      cpSync(migrationsFolder, join(work, "migrations"), { recursive: true });
      // drizzle-kit reads `schema` and `out` relative to its working directory, so it
      // runs in the copy, with drizzle.config.ts as it is apart from those two paths.
      const packageDir = join(import.meta.dir, "..");
      writeFileSync(
        join(work, "drizzle.config.ts"),
        [
          `import { resolve } from "node:path";`,
          `import config from ${JSON.stringify(join(packageDir, "drizzle.config.ts"))};`,
          "export default {",
          "  ...config,",
          `  schema: [config.schema].flat().map((path) => resolve(${JSON.stringify(packageDir)}, path)),`,
          `  out: "./migrations",`,
          "};",
          "",
        ].join("\n"),
      );
      const result = Bun.spawnSync(
        [
          "bun",
          "--bun",
          join(packageDir, "node_modules/drizzle-kit/bin.cjs"),
          "generate",
          "--config=drizzle.config.ts",
        ],
        {
          cwd: work,
          stdin: "ignore",
          stdout: "pipe",
          stderr: "pipe",
          timeout: 60_000,
        },
      );
      if (result.exitCode !== 0) {
        // A timeout here is drizzle-kit asking whether a change is a rename, which only
        // make db-generate in a terminal can answer.
        throw new Error(
          `drizzle-kit generate failed (${result.signalCode ?? result.exitCode}); run make db-generate: ${result.stdout}${result.stderr}`,
        );
      }
      expect(filesIn(join(work, "migrations"))).toEqual(
        filesIn(migrationsFolder),
      );
    } finally {
      rmSync(work, { recursive: true, force: true });
    }
  });
});
