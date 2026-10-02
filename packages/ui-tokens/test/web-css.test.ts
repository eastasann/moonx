import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { createCompiler } from "@vanilla-extract/compiler";

const root = resolve(import.meta.dir, "..");

async function compileCss(): Promise<string> {
  const compiler = createCompiler({ root });
  try {
    const file = resolve(root, "src/generated/web.css.ts");
    await compiler.processVanillaFile(file);
    return compiler.getCssForFile(file).css;
  } finally {
    await compiler.close();
  }
}

test("web theme compiles to light, dark and scale rules", async () => {
  const css = await compileCss();
  expect(css).toContain("--moonx-color-surface-canvas: #f5eedf");
  expect(css).toContain(':root[data-theme="dark"]');
  expect(css).toContain("(prefers-color-scheme: dark)");
  expect(css).toContain(':root[data-scale="large"]');
  expect(css).toContain("(pointer: coarse)");
  expect(css).toContain("--moonx-typography-body-fontSize: 1rem");
});

test("large scale carries bigger body text than medium", async () => {
  const css = await compileCss();
  const bodySize = (selector: string) => {
    for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      if (sel?.trim() !== selector) continue;
      const size = /--moonx-typography-body-fontSize: ([\d.]+)rem/.exec(body ?? "")?.[1];
      if (size) return Number(size);
    }
    throw new Error(`no body font size under ${selector}`);
  };
  expect(bodySize(":root")).toBe(1);
  expect(bodySize(':root[data-scale="large"]')).toBeGreaterThan(1);
});

test("web theme exposes the layout, z-index and loop variables", async () => {
  const css = await compileCss();
  expect(css).toContain("--moonx-layout-list-pane-width: 352px");
  expect(css).toContain("--moonx-layout-sheet-max-height-ratio: 0.85");
  expect(css).toContain("--moonx-layout-z-index-toast: 200");
  expect(css).toContain("--moonx-motion-loop-pulse: 1600ms");
  expect(css).toContain("--moonx-color-negative-strong-hover: #99232d");
});
