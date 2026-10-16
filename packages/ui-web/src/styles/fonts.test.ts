import { expect, test } from "vitest";
import tokens from "../../../../docs/06_design-tokens.json";
import source from "./fonts.ts?raw";

test("fonts.ts loads exactly the 06 weights of every self-hosted family", () => {
  const weights = Object.entries(tokens.primitive.font.weight)
    .filter(([key]) => !key.startsWith("$"))
    .map(([, token]) => (token as { $value: number }).$value)
    .sort();
  const imports = [
    ...source.matchAll(/import "@fontsource\/([^/]+)\/(\d+)\.css";/g),
  ].map(([, family, weight]) => ({ family, weight: Number(weight) }));
  const families = [...new Set(imports.map((entry) => entry.family))].sort();

  // Each served family is one 06 names (the rest of the lists are OS fonts).
  const named = [
    ...tokens.primitive.font.family.sans.$value,
    ...tokens.primitive.font.family.mono.$value,
  ].map((name) => name.toLowerCase().replaceAll(" ", "-"));
  expect(families).toEqual([
    "ibm-plex-mono",
    "ibm-plex-sans",
    "ibm-plex-sans-jp",
  ]);
  for (const family of families) {
    expect(named).toContain(family);
    expect(
      imports
        .filter((entry) => entry.family === family)
        .map((entry) => entry.weight)
        .sort(),
    ).toEqual(weights);
  }
});
