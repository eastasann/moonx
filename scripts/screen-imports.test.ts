import { afterAll, beforeAll, expect, test } from "bun:test";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Guards the biome.json override that keeps screens from writing styles (ADR-025). Runs
// Biome on a copy of the config so the fixtures never enter the real source tree.
const root = join(import.meta.dir, "..");
const fixture = [
  'import { style } from "@vanilla-extract/css";',
  'import { recipe } from "@vanilla-extract/recipes";',
  'import { globalStyle } from "@vanilla-extract/css/injectStyles";',
  "",
  "export const a = style({});",
  "export const b = recipe({});",
  "export const c = globalStyle;",
  "",
].join("\n");

let dir: string;
let output: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "moonx-screen-imports-"));
  copyFileSync(join(root, "biome.json"), join(dir, "biome.json"));
  for (const path of [
    "apps/web/src/routes/example.tsx",
    "packages/ui-web/src/button.css.ts",
  ]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), fixture);
  }
  const result = Bun.spawnSync(
    [join(root, "node_modules/.bin/biome"), "lint", "--vcs-enabled=false", "."],
    { cwd: dir, stdout: "pipe", stderr: "pipe" },
  );
  output = result.stdout.toString() + result.stderr.toString();
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test("screens cannot import vanilla-extract", () => {
  expect(output).toContain(
    "apps/web/src/routes/example.tsx:1:23 lint/style/noRestrictedImports",
  );
  expect(output).toContain(
    "apps/web/src/routes/example.tsx:2:24 lint/style/noRestrictedImports",
  );
  // Subpath entry points such as injectStyles can write global CSS too.
  expect(output).toContain(
    "apps/web/src/routes/example.tsx:3:29 lint/style/noRestrictedImports",
  );
});

test("components in packages/ui-web can", () => {
  expect(output).not.toContain("packages/ui-web/src/button.css.ts");
});
