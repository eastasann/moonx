import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectTokens, type JsonObject } from "../scripts/dtcg";
import {
  AVATAR_SIZES,
  COMPONENT_SIZES,
  DENSITIES,
  DIVIDER_SIZES,
  SPACE_STEPS,
  STATUS_VARIANTS,
} from "../src/types";

const tokens = collectTokens(
  JSON.parse(
    readFileSync(resolve(import.meta.dir, "../../../docs/06_design-tokens.json"), "utf8"),
  ) as JsonObject,
);

/** Child names directly under `prefix`, in document order. */
function keysUnder(prefix: string): string[] {
  const keys = new Set<string>();
  for (const path of tokens.keys()) {
    if (path.startsWith(`${prefix}.`))
      keys.add(path.slice(prefix.length + 1).split(".")[0] as string);
  }
  return [...keys];
}

test("space steps match semantic.space", () => {
  expect([...(SPACE_STEPS as readonly string[])]).toEqual(keysUnder("semantic.space"));
});

test("densities match semantic.density", () => {
  expect([...(DENSITIES as readonly string[])]).toEqual(keysUnder("semantic.density"));
});

test("component sizes match the sized components", () => {
  expect([...(COMPONENT_SIZES as readonly string[])]).toEqual(
    keysUnder("semantic.scale.medium.component.button.height"),
  );
  expect([...(COMPONENT_SIZES as readonly string[])]).toEqual(
    keysUnder("semantic.scale.large.component.button.height"),
  );
});

test("divider and avatar sizes match their tokens", () => {
  expect([...(DIVIDER_SIZES as readonly string[])]).toEqual(
    keysUnder("semantic.border-width.divider"),
  );
  expect([...(AVATAR_SIZES as readonly string[])]).toEqual(
    keysUnder("semantic.scale.medium.component.avatar.size"),
  );
});

test("status variants are color families of semantic.color", () => {
  const families = new Set(keysUnder("semantic.color.light"));
  for (const variant of STATUS_VARIANTS) {
    expect(families.has(variant)).toBe(true);
    expect(tokens.has(`semantic.color.light.${variant}.strong`)).toBe(true);
  }
});

test("every sized component offers the shared sizes", () => {
  for (const component of ["action-button", "field", "checkbox", "radio-button", "switch"]) {
    const sizes = keysUnder(`semantic.scale.medium.component.${component}`)
      .flatMap((property) => keysUnder(`semantic.scale.medium.component.${component}.${property}`))
      .filter((key) => (COMPONENT_SIZES as readonly string[]).includes(key));
    expect(sizes.length).toBeGreaterThan(0);
  }
});
