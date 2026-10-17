import { describe, expect, test } from "bun:test";
import {
  flattenTokens,
  loadTokens,
  resolveToken,
  type TokenTree,
  validateTokens,
} from "./tokens";

const color = (hex: string) => ({
  $value: {
    colorSpace: "srgb",
    components: [1, 3, 5].map(
      (i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255,
    ),
    hex,
  },
});
const px = (value: number) => ({ $value: { value, unit: "px" } });

/** A small valid tree; each test breaks one rule. */
const base = (): TokenTree => ({
  primitive: {
    color: { $type: "color", ink: color("#151a2c"), paper: color("#f4f5f8") },
    size: { $type: "dimension", "14": px(14), "17": px(17) },
    family: { $type: "fontFamily", sans: { $value: ["IBM Plex Sans"] } },
    weight: { $type: "fontWeight", regular: { $value: 400 } },
    tracking: { $type: "dimension", normal: px(0) },
    leading: { $type: "number", normal: { $value: 1.5 } },
  },
  semantic: {
    color: {
      $type: "color",
      light: { text: { $value: "{primitive.color.ink}" } },
      dark: { text: { $value: "{primitive.color.paper}" } },
    },
    scale: {
      $type: "dimension",
      medium: { body: { $value: "{primitive.size.14}" } },
      large: { body: { $value: "{primitive.size.17}" } },
    },
    typography: {
      $type: "typography",
      body: {
        $value: {
          fontFamily: "{primitive.family.sans}",
          fontSize: "{semantic.scale.medium.body}",
          fontWeight: "{primitive.weight.regular}",
          letterSpacing: "{primitive.tracking.normal}",
          lineHeight: "{primitive.leading.normal}",
        },
      },
    },
  },
});

/** Sets `value` at the dotted `path` of a fresh base tree. */
const withValue = (path: string, value: unknown): TokenTree => {
  const tree = base();
  const keys = path.split(".");
  let node = tree as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    node[key] ??= {};
    node = node[key] as Record<string, unknown>;
  }
  node[keys.at(-1) ?? ""] = value;
  return tree;
};

describe("validateTokens", () => {
  test("accepts 06", async () => {
    expect(validateTokens(await loadTokens())).toEqual([]);
  });

  test("accepts the base tree", () => {
    expect(validateTokens(base())).toEqual([]);
  });

  test("reports a reference to a missing token", () => {
    expect(
      validateTokens(
        withValue("semantic.color.light.text", {
          $value: "{primitive.color.missing}",
        }),
      ),
    ).toContain(
      "semantic.color.light.text: {primitive.color.missing} does not exist",
    );
  });

  test("reports a missing reference inside a composite", () => {
    expect(
      validateTokens(
        withValue(
          "semantic.typography.body.$value.fontWeight",
          "{primitive.weight.bold}",
        ),
      ),
    ).toContain(
      "semantic.typography.body.fontWeight: {primitive.weight.bold} does not exist",
    );
  });

  test("reports a reference to a token of another type", () => {
    expect(
      validateTokens(
        withValue("semantic.color.light.text", {
          $value: "{primitive.size.14}",
        }),
      ),
    ).toContain(
      "semantic.color.light.text: {primitive.size.14} is a dimension, not a color",
    );
  });

  test("reports a cycle", () => {
    const tree = withValue("semantic.color.light.text", {
      $value: "{semantic.color.dark.text}",
    });
    const dark = (tree.semantic as Record<string, Record<string, unknown>>)
      .color as Record<string, Record<string, unknown>>;
    (dark.dark as Record<string, unknown>).text = {
      $value: "{semantic.color.light.text}",
    };
    expect(validateTokens(tree)).toContain(
      "semantic.color.light.text: reference cycle semantic.color.light.text → semantic.color.dark.text → semantic.color.light.text",
    );
  });

  test("reports a semantic literal", () => {
    expect(
      validateTokens(withValue("semantic.color.light.text", color("#000000"))),
    ).toContain(
      "semantic.color.light.text: a semantic value is a reference, or a composite of references, never a literal",
    );
  });

  test("reports a semantic composite with a literal field", () => {
    expect(
      validateTokens(
        withValue("semantic.typography.body.$value.lineHeight", 2),
      ),
    ).toContain(
      "semantic.typography.body: a semantic value is a reference, or a composite of references, never a literal",
    );
  });

  test("reports a primitive that refers to the semantic layer", () => {
    expect(
      validateTokens(
        withValue("primitive.color.copy", {
          $value: "{semantic.color.light.text}",
        }),
      ),
    ).toContain(
      "primitive.color.copy: a primitive cannot refer to the semantic layer",
    );
  });

  test("reports a layer other than primitive and semantic", () => {
    expect(validateTokens({ ...base(), component: {} })).toContain(
      "component: the only layers are primitive and semantic",
    );
  });

  test("reports an unknown type", () => {
    expect(
      validateTokens(
        withValue("primitive.gradient", { $type: "gradient", $value: [] }),
      ),
    ).toContain("primitive.gradient: unknown $type gradient");
  });

  test("reports a variant without its counterpart", () => {
    const problems = validateTokens(
      withValue("semantic.color.dark.link", {
        $value: "{primitive.color.paper}",
      }),
    );
    expect(problems).toContain("semantic.color.light.link is missing");
  });

  test("reports a child of a variant group that is not a variant", () => {
    expect(
      validateTokens(
        withValue("semantic.color.focus", { $value: "{primitive.color.ink}" }),
      ),
    ).toContain(
      "semantic.color.focus: semantic.color holds only light and dark",
    );
  });

  test("reports a print value that reaches a dark value", () => {
    expect(
      validateTokens(
        withValue("semantic.print.color", {
          $type: "color",
          text: { $value: "{semantic.color.dark.text}" },
        }),
      ),
    ).toContain(
      "semantic.print.color.text: semantic.print refers to the light values only",
    );
  });

  test("reports a cycle that only the swap to the large scale makes", () => {
    // As written, large.body → medium.body → a primitive. Built for the large scale,
    // medium.body is read as large.body, which points back at itself.
    expect(
      validateTokens(
        withValue("semantic.scale.large.body", {
          $value: "{semantic.scale.medium.body}",
        }),
      ),
    ).toContain(
      "semantic.scale.large.body (large, wide): semantic.scale.large.body: reference cycle",
    );
  });

  test("reports a cycle that only the swap to the narrow width makes", () => {
    const tree = withValue("semantic.font-size", {
      $type: "dimension",
      wide: { body: { $value: "{primitive.size.14}" } },
      narrow: { body: { $value: "{semantic.font-size.wide.body}" } },
    });
    expect(validateTokens(tree)).toContain(
      "semantic.font-size.narrow.body (medium, narrow): semantic.font-size.narrow.body: reference cycle",
    );
  });

  test.each([
    ["a hex in capitals", "primitive.color.ink", color("#151A2C"), "hex"],
    [
      "components that disagree with the hex",
      "primitive.color.ink",
      { $value: { colorSpace: "srgb", components: [1, 1, 1], hex: "#151a2c" } },
      "components do not match #151a2c",
    ],
    [
      "a rem dimension",
      "primitive.size.14",
      { $value: { value: 1, unit: "rem" } },
      "a dimension",
    ],
    [
      "an empty font list",
      "primitive.family.sans",
      { $value: [] },
      "fontFamily",
    ],
    [
      "a composite with an unknown field",
      "semantic.typography.body.$value.textCase",
      "{primitive.leading.normal}",
      "not a field of a typography",
    ],
    [
      "a colour in another space",
      "primitive.color.ink.$value.colorSpace",
      "display-p3",
      "colorSpace must be srgb",
    ],
    [
      "an alpha above 1",
      "primitive.color.ink.$value.alpha",
      2,
      "alpha must be a number from 0 to 1",
    ],
    [
      "a fontWeight out of range",
      "primitive.weight.regular",
      { $value: 1200 },
      "a fontWeight is a number from 1 to 1000",
    ],
    [
      "a number written as a string",
      "primitive.leading.normal",
      { $value: "1.5" },
      "not a number",
    ],
    [
      "a duration in seconds",
      "primitive.wait",
      { $type: "duration", $value: { value: 1, unit: "s" } },
      "a duration is",
    ],
    [
      "a cubicBezier with x2 above 1",
      "primitive.ease",
      { $type: "cubicBezier", $value: [0, 0, 2, 1] },
      "a cubicBezier is",
    ],
    [
      "a composite that is not an object",
      "primitive.style",
      { $type: "typography", $value: "bold" },
      "primitive.style: a typography is an object",
    ],
    [
      "a composite without one of its fields",
      "primitive.shadow",
      {
        $type: "shadow",
        $value: {
          color: "{primitive.color.ink}",
          offsetX: { value: 0, unit: "px" },
          offsetY: { value: 1, unit: "px" },
          blur: { value: 2, unit: "px" },
        },
      },
      "primitive.shadow.spread is missing",
    ],
    [
      "a variant of another type than its counterpart",
      "semantic.color.dark.text",
      { $type: "dimension", $value: "{primitive.size.14}" },
      "semantic.color.dark.text is a dimension, but its light counterpart is a color",
    ],
  ])("reports %s", (_, path, value, message) => {
    const problems = validateTokens(withValue(path, value));
    expect(problems.some((problem) => problem.includes(message))).toBe(true);
  });
});

describe("resolveToken", () => {
  test("follows references to the primitive, keeping where the value came from", () => {
    const tokens = flattenTokens(base());
    expect(
      resolveToken(tokens, "semantic.color.dark.text", "medium"),
    ).toMatchObject({
      kind: "literal",
      type: "color",
      source: "primitive.color.paper",
    });
  });

  test("reads references into the medium scale in the scale it builds for", () => {
    const tokens = flattenTokens(base());
    const fontSize = (scale: "medium" | "large") => {
      const resolved = resolveToken(tokens, "semantic.typography.body", scale);
      return resolved.kind === "composite"
        ? resolved.fields.fontSize
        : undefined;
    };
    expect(fontSize("medium")).toMatchObject({ value: { value: 14 } });
    expect(fontSize("large")).toMatchObject({
      value: { value: 17 },
      source: "primitive.size.17",
    });
  });

  test("reads references into the wide font sizes in the width it builds for", () => {
    const tokens = flattenTokens(
      withValue("semantic.font-size", {
        $type: "dimension",
        wide: { body: { $value: "{primitive.size.14}" } },
        narrow: { body: { $value: "{primitive.size.17}" } },
      }),
    );
    const resolve = (width: "wide" | "narrow") =>
      resolveToken(tokens, "semantic.font-size.wide.body", "medium", width);
    expect(resolve("wide")).toMatchObject({ source: "primitive.size.14" });
    // The token itself is the wide one; only references to it are swapped.
    expect(resolve("narrow")).toMatchObject({ source: "primitive.size.14" });
    // A token outside the group that names the wide one is read in the width built for.
    tokens.set("semantic.x", {
      path: "semantic.x",
      type: "dimension",
      value: "{semantic.font-size.wide.body}",
    });
    expect(resolveToken(tokens, "semantic.x", "large", "narrow")).toMatchObject(
      { source: "primitive.size.17" },
    );
  });

  test("throws on a missing token or a cycle, which validateTokens reports first", () => {
    const tokens = flattenTokens(
      withValue("semantic.color.light.text", {
        $value: "{semantic.color.light.text}",
      }),
    );
    expect(() => resolveToken(tokens, "semantic.missing", "medium")).toThrow(
      "{semantic.missing} does not exist",
    );
    expect(() =>
      resolveToken(tokens, "semantic.color.light.text", "medium"),
    ).toThrow("semantic.color.light.text: reference cycle");
  });
});
