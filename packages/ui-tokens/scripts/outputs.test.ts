import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildOutputs,
  formatGenerated,
  staleFiles,
  writeOutputs,
} from "./outputs";
import { loadTokens } from "./tokens";

const outputs = await buildOutputs(await loadTokens());

test("the committed src/generated/ is what 06 generates (run make tokens if not)", () => {
  expect(staleFiles(outputs)).toEqual([]);
});

test("building twice gives the same bytes", async () => {
  const again = await buildOutputs(await loadTokens());
  expect([...again.keys()]).toEqual([...outputs.keys()]);
  for (const [path, content] of again) {
    expect(
      Buffer.from(content).equals(Buffer.from(outputs.get(path) ?? "")),
    ).toBe(true);
  }
});

test("formats generated files as make format does, imports sorted", () => {
  expect(
    formatGenerated(
      "x.ts",
      'import { b } from "./b";\nimport { a } from "./a";\nexport const x = {"k": [ a,b ]}',
    ),
  ).toBe(
    'import { a } from "./a";\nimport { b } from "./b";\nexport const x = { k: [a, b] };\n',
  );
});

test("rejects generated text that Biome cannot parse", () => {
  expect(() => formatGenerated("x.ts", "export const = ;")).toThrow(
    "biome could not format x.ts",
  );
});

describe("writeOutputs", () => {
  let dir: string;
  const small = new Map<string, string | Uint8Array>([
    ["a.ts", "export const a = 1;\n"],
    ["pwa/b.png", new Uint8Array([1, 2, 3])],
  ]);

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ui-tokens-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  test("writes every file into an empty folder, then nothing", () => {
    expect(writeOutputs(small, dir)).toEqual(["a.ts", "pwa/b.png"]);
    expect(readFileSync(join(dir, "pwa/b.png"))).toEqual(
      Buffer.from([1, 2, 3]),
    );
    expect(writeOutputs(small, dir)).toEqual([]);
    expect(staleFiles(small, dir)).toEqual([]);
  });

  test("rewrites a changed file and deletes files it no longer makes", () => {
    writeOutputs(small, dir);
    writeFileSync(join(dir, "a.ts"), "edited by hand\n");
    mkdirSync(join(dir, "old/deeper"), { recursive: true });
    writeFileSync(join(dir, "old/deeper/c.ts"), "");
    expect(staleFiles(small, dir)).toEqual(["a.ts", "old/deeper/c.ts"]);
    expect(writeOutputs(small, dir)).toEqual(["a.ts", "old/deeper/c.ts"]);
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe(
      "export const a = 1;\n",
    );
    expect(existsSync(join(dir, "old"))).toBe(false);
    expect(existsSync(dir)).toBe(true);
  });

  test("leaves .DS_Store alone but not other dotfiles", () => {
    writeOutputs(small, dir);
    writeFileSync(join(dir, "pwa/.DS_Store"), "");
    writeFileSync(join(dir, ".hidden"), "");
    expect(staleFiles(small, dir)).toEqual([".hidden"]);
    expect(writeOutputs(small, dir)).toEqual([".hidden"]);
    expect(existsSync(join(dir, "pwa/.DS_Store"))).toBe(true);
  });
});
