import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkContrast, contrastRatio } from "../scripts/contrast";
import { checkAliases, collectTokens, type JsonObject, resolveToken } from "../scripts/dtcg";

const source = resolve(import.meta.dir, "../../../docs/06_design-tokens.json");
const load = (): JsonObject => JSON.parse(readFileSync(source, "utf8")) as JsonObject;

type Node = Record<string, unknown>;
function setValue(doc: JsonObject, path: string, value: unknown) {
  let node = doc as Node;
  for (const key of path.split(".")) node = node[key] as Node;
  node.$value = value;
}

describe("06_design-tokens.json", () => {
  test("passes the alias and contrast checks as committed", () => {
    const tokens = collectTokens(load());
    expect(checkAliases(tokens)).toEqual([]);
    expect(checkContrast(tokens)).toEqual([]);
  });

  test("reports an alias that points nowhere", () => {
    const doc = load();
    setValue(doc, "semantic.color.light.text.primary", "{primitive.color.teal.9999}");
    const errors = checkAliases(collectTokens(doc));
    expect(errors).toContain(
      "semantic.color.light.text.primary: alias {primitive.color.teal.9999} does not exist",
    );
  });

  test("reports an alias cycle", () => {
    const doc = load();
    setValue(doc, "primitive.radius.sm", "{primitive.radius.md}");
    setValue(doc, "primitive.radius.md", "{primitive.radius.sm}");
    expect(checkAliases(collectTokens(doc)).some((e) => e.startsWith("alias cycle:"))).toBe(true);
  });

  test("rejects a literal value in the semantic layer", () => {
    const doc = load();
    setValue(doc, "semantic.radius.control", { value: 6, unit: "px" });
    const errors = checkAliases(collectTokens(doc));
    expect(
      errors.some((e) => e.startsWith("semantic.radius.control: semantic tokens must be aliases")),
    ).toBe(true);
  });

  test("reports a text color below 4.5:1", () => {
    const doc = load();
    // text.primary on canvas becomes cream on cream
    setValue(doc, "semantic.color.light.text.primary", "{primitive.color.cream.200}");
    const errors = checkContrast(collectTokens(doc));
    expect(errors.some((e) => e.startsWith("light: text.primary on surface.canvas"))).toBe(true);
  });

  test("reports a focus ring below 3:1", () => {
    const doc = load();
    setValue(doc, "semantic.color.dark.border.focus", "{primitive.color.teal.900}");
    const errors = checkContrast(collectTokens(doc));
    expect(errors.some((e) => e.startsWith("dark: border.focus on surface.canvas"))).toBe(true);
  });

  test("computes WCAG ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
  });
});

describe("scale redirect", () => {
  const tokens = collectTokens(load());
  const px = (path: string, scale: "medium" | "large") => {
    const resolved = resolveToken(tokens, path, scale);
    if (resolved.kind !== "composite") throw new Error("expected composite");
    const size = resolved.fields.fontSize;
    if (size?.kind !== "dimension") throw new Error("expected dimension");
    return size.px;
  };

  test("typography takes the large font size when generated for large", () => {
    expect(px("semantic.typography.body", "large")).toBeGreaterThan(
      px("semantic.typography.body", "medium"),
    );
  });

  test("density row height follows the scale", () => {
    const height = (scale: "medium" | "large") => {
      const r = resolveToken(tokens, "semantic.density.regular.row-height", scale);
      if (r.kind !== "dimension") throw new Error("expected dimension");
      return r.px;
    };
    expect(height("large")).toBeGreaterThan(height("medium"));
  });
});
