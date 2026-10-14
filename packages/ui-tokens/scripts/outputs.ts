// The files make tokens owns: everything under src/generated/ but .DS_Store, nothing
// else. A file the generator no longer makes is deleted, so after make tokens the folder
// holds exactly what 06 produces and `git status` shows any drift (ADR-018: CI fails on
// a diff).

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { printSource } from "./print-theme";
import { iconPngs, iconSvg, manifest } from "./pwa";
import type { TokenTree } from "./tokens";
import { themeSource, varsSource } from "./web-theme";

export const GENERATED_DIR = fileURLToPath(
  new URL("../src/generated", import.meta.url),
);
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

function biome(args: string[], path: string, text: string) {
  return Bun.spawnSync(
    [
      process.execPath,
      "--bun",
      "x",
      "--no-install",
      "biome",
      ...args,
      `--stdin-file-path=${relative(REPO_ROOT, join(GENERATED_DIR, path))}`,
    ],
    { cwd: REPO_ROOT, stdin: Buffer.from(text), stderr: "pipe" },
  );
}

/**
 * Formats `text` as make format would format the file at `path` (under src/generated/),
 * imports sorted, so make lint covers the generated files without excluding them.
 *
 * @throws when Biome cannot parse the text. `check --write` passes such text through
 *   unchanged with exit 0, so `format`, which reports it, runs on the result.
 */
export function formatGenerated(path: string, text: string): string {
  const sorted = biome(
    ["check", "--write", "--linter-enabled=false"],
    path,
    text,
  );
  const formatted = biome(["format"], path, sorted.stdout.toString());
  if (sorted.exitCode !== 0 || formatted.exitCode !== 0) {
    throw new Error(
      `biome could not format ${path}:\n${sorted.stderr.toString()}${formatted.stderr.toString()}`.trim(),
    );
  }
  return formatted.stdout.toString();
}

/** Every generated file, by path under src/generated/. */
export async function buildOutputs(
  tree: TokenTree,
): Promise<Map<string, string | Uint8Array>> {
  const outputs = new Map<string, string | Uint8Array>();
  outputs.set("vars.ts", formatGenerated("vars.ts", varsSource(tree)));
  outputs.set(
    "theme.css.ts",
    formatGenerated("theme.css.ts", themeSource(tree)),
  );
  outputs.set("print.ts", formatGenerated("print.ts", printSource(tree)));
  const svg = iconSvg(tree);
  outputs.set("pwa/icon.svg", svg);
  for (const [name, png] of await iconPngs(svg)) {
    outputs.set(`pwa/${name}`, png);
  }
  outputs.set(
    "pwa/manifest.webmanifest",
    formatGenerated("pwa/manifest.webmanifest", JSON.stringify(manifest(tree))),
  );
  return outputs;
}

// macOS drops .DS_Store into any folder opened in Finder; .gitignore keeps it out of Git.
function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name !== ".DS_Store")
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * The paths under `dir` that differ from `outputs`: changed, missing, or not generated
 * at all.
 */
export function staleFiles(
  outputs: Map<string, string | Uint8Array>,
  dir = GENERATED_DIR,
): string[] {
  const stale = new Set<string>();
  for (const path of listFiles(dir)) {
    if (!outputs.has(path)) stale.add(path);
  }
  for (const [path, content] of outputs) {
    const target = join(dir, path);
    const current = existsSync(target) ? readFileSync(target) : undefined;
    if (current === undefined || !current.equals(Buffer.from(content))) {
      stale.add(path);
    }
  }
  return [...stale].sort();
}

/**
 * Makes `dir` hold exactly `outputs`: writes the files that differ and deletes the rest.
 * Files already equal are left alone, so their timestamps do not change.
 *
 * @returns the paths written or deleted.
 */
export function writeOutputs(
  outputs: Map<string, string | Uint8Array>,
  dir = GENERATED_DIR,
): string[] {
  const stale = staleFiles(outputs, dir);
  for (const path of stale) {
    const target = join(dir, path);
    const content = outputs.get(path);
    if (content === undefined) {
      rmSync(target);
      // Drop folders the deletion emptied, up to dir itself.
      for (
        let folder = dirname(target);
        folder.startsWith(`${dir}/`) && readdirSync(folder).length === 0;
        folder = dirname(folder)
      ) {
        rmdirSync(folder);
      }
    } else {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, content);
    }
  }
  return stale;
}
