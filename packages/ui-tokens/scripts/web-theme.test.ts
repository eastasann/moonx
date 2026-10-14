import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Compiler, createCompiler } from "@vanilla-extract/compiler";
import { flattenTokens, loadTokens, type TokenTree } from "./tokens";
import {
  camelCase,
  type ThemeVariable,
  themeOverrides,
  themeVariables,
} from "./web-theme";

const tree = await loadTokens();
const variables = themeVariables(tree);
const byName = new Map(variables.map((v) => [v.name, v]));
const value = (name: string) => byName.get(name)?.values;

describe("themeVariables", () => {
  test("names each variable by its semantic path without the variant", () => {
    expect(byName.get("color-surface-canvas")).toMatchObject({
      key: ["color", "surface", "canvas"],
      values: { lightMedium: "#f4f5f8", darkMedium: "#0e1120" },
    });
    expect(byName.get("scale-component-button-height-M")?.key).toEqual([
      "scale",
      "component",
      "button",
      "height",
      "M",
    ]);
    expect(byName.get("color-control-primary-hover")?.key).toEqual([
      "color",
      "control",
      "primaryHover",
    ]);
  });

  test("covers every semantic token: each variant once, composites by field", () => {
    const tokens = [...flattenTokens(tree).values()].filter(
      ({ path }) =>
        path.startsWith("semantic.") &&
        !/^semantic\.(color|shadow)\.dark\./.test(path) &&
        !path.startsWith("semantic.scale.large."),
    );
    const fields = { typography: 5, transition: 3 } as Record<string, number>;
    const expected = tokens.reduce(
      (sum, { type }) => sum + (fields[String(type)] ?? 1),
      0,
    );
    expect(variables).toHaveLength(expected);
  });

  test("writes font sizes in rem, print sizes and other dimensions in px", () => {
    expect(value("scale-font-size-100")).toMatchObject({
      lightMedium: "0.875rem",
      lightLarge: "1.0625rem",
    });
    expect(value("typography-body-font-size")).toMatchObject({
      lightMedium: "1rem",
      lightLarge: "1.1875rem",
    });
    expect(value("print-font-size-footer")?.lightMedium).toBe("10px");
    expect(value("print-typography-title-font-size")?.lightMedium).toBe("44px");
    expect(value("space-300")?.lightMedium).toBe("16px");
    expect(value("typography-display-letter-spacing")?.lightMedium).toBe(
      "-0.75px",
    );
  });

  test("swaps the medium scale for large in typography and density", () => {
    expect(value("density-regular-row-height")).toMatchObject({
      lightMedium: "40px",
      lightLarge: "50px",
    });
    // tab-label names a primitive size, so it keeps it on every scale.
    expect(value("typography-tab-label-font-size")).toMatchObject({
      lightMedium: "0.6875rem",
      lightLarge: "0.6875rem",
    });
  });

  test("writes the other types as CSS", () => {
    expect(value("color-surface-scrim")?.lightMedium).toBe(
      "rgb(14 17 32 / 0.4)",
    );
    expect(value("font-family-mono")?.lightMedium).toBe(
      '"IBM Plex Mono", "IBM Plex Sans JP", ui-monospace, "Menlo", "Consolas", monospace',
    );
    expect(value("typography-heading-1-font-weight")?.lightMedium).toBe("600");
    expect(value("typography-body-line-height")?.lightMedium).toBe("1.65");
    expect(value("shadow-overlay")).toMatchObject({
      lightMedium: "0px 12px 32px -12px rgb(14 17 32 / 0.16)",
      darkMedium: "0px 12px 32px -8px rgb(0 0 0 / 0.55)",
    });
    expect(value("motion-transition-enter-duration")?.lightMedium).toBe(
      "300ms",
    );
    expect(value("motion-transition-enter-timing-function")?.lightMedium).toBe(
      "cubic-bezier(0, 0, 0, 1)",
    );
    expect(value("layout-z-index-toast")?.lightMedium).toBe("200");
  });

  test("keeps the print colours light in the dark mode", () => {
    expect(value("print-color-page")).toMatchObject({
      lightMedium: "#f4f5f8",
      darkMedium: "#f4f5f8",
    });
  });

  test("rejects a token that changes with both the mode and the scale", () => {
    const px = (n: number) => ({ $value: { value: n, unit: "px" } });
    const broken: TokenTree = {
      primitive: { size: { $type: "dimension", a: px(1), b: px(2) } },
      semantic: {
        shadow: { $type: "dimension", light: {}, dark: {} },
        scale: {
          $type: "dimension",
          medium: { gap: { $value: "{primitive.size.a}" } },
          large: { gap: { $value: "{primitive.size.b}" } },
        },
        color: {
          $type: "dimension",
          light: { gap: { $value: "{semantic.scale.medium.gap}" } },
          dark: { gap: { $value: "{primitive.size.b}" } },
        },
      },
    };
    expect(() => themeVariables(broken)).toThrow(
      "--color-gap changes with both the mode and the scale",
    );
  });

  const one = { $value: "{primitive.n.one}" };
  const withSemantic = (semantic: Record<string, unknown>): TokenTree => ({
    primitive: { n: { $type: "number", one: { $value: 1 } } },
    semantic,
  });

  test("rejects two tokens that would share a CSS variable", () => {
    const tree = withSemantic({
      "a-b": { $type: "number", c: one },
      a: { $type: "number", "b-c": one },
    });
    expect(() => themeVariables(tree)).toThrow("--a-b-c comes from two tokens");
  });

  test("rejects two tokens that would share a key in vars", () => {
    const tree = withSemantic({
      "a-b": { $type: "number", x: one },
      aB: { $type: "number", x: one },
    });
    expect(() => themeVariables(tree)).toThrow(
      "vars.aB.x comes from two tokens",
    );
  });

  test("rejects variants with different fields", () => {
    const tree: TokenTree = {
      primitive: {
        n: { $type: "number", one: { $value: 1 } },
        family: { $type: "fontFamily", sans: { $value: "IBM Plex Sans" } },
        weight: { $type: "fontWeight", regular: { $value: 400 } },
        size: { $type: "dimension", m: { $value: { value: 14, unit: "px" } } },
      },
      semantic: {
        color: {
          light: {
            x: {
              $type: "typography",
              $value: {
                fontFamily: "{primitive.family.sans}",
                fontSize: "{primitive.size.m}",
                fontWeight: "{primitive.weight.regular}",
                letterSpacing: "{primitive.size.m}",
                lineHeight: "{primitive.n.one}",
              },
            },
          },
          dark: { x: { $type: "number", $value: "{primitive.n.one}" } },
        },
      },
    };
    expect(() => themeVariables(tree)).toThrow(
      "semantic.color.light.x: the variants do not have the same fields",
    );
  });
});

describe("themeOverrides", () => {
  const { dark, large } = themeOverrides(variables);
  const keys = (list: ThemeVariable[]) => list.map((v) => v.key[0]);

  test("switches only the colours and shadows with the mode", () => {
    expect(new Set(keys(dark))).toEqual(new Set(["color", "shadow"]));
  });

  test("switches the scale, and the sizes that follow it, with the scale", () => {
    expect(new Set(keys(large))).toEqual(
      new Set(["scale", "density", "typography"]),
    );
  });
});

test("camelCase", () => {
  expect(camelCase("sidebar-width-collapsed")).toBe("sidebarWidthCollapsed");
  expect(camelCase("heading-1")).toBe("heading1");
  expect(camelCase("XL")).toBe("XL");
});

/** The rules of a flat stylesheet: media query (if any), selector, declarations. */
function parseCss(css: string) {
  const rules: {
    media?: string;
    selector: string;
    decls: Map<string, string>;
  }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}|(@media[^{]+)\{|\}/g;
  let media: string | undefined;
  for (const match of css.matchAll(pattern)) {
    if (match[3] !== undefined) {
      media = match[3].trim();
    } else if (match[1] !== undefined) {
      const decls = new Map<string, string>();
      for (const line of (match[2] ?? "").split(";")) {
        const at = line.indexOf(":");
        if (at > 0)
          decls.set(line.slice(0, at).trim(), line.slice(at + 1).trim());
      }
      rules.push({ media, selector: match[1].trim(), decls });
    } else {
      media = undefined;
    }
  }
  return rules;
}

describe("the generated theme compiles with vanilla-extract", () => {
  let compiler: Compiler;
  let rules: ReturnType<typeof parseCss>;

  beforeAll(async () => {
    compiler = createCompiler({
      root: fileURLToPath(new URL("..", import.meta.url)),
      enableFileWatcher: false,
    });
    await compiler.processVanillaFile(
      fileURLToPath(new URL("../src/generated/theme.css.ts", import.meta.url)),
      { outputCss: true },
    );
    rules = parseCss(compiler.getAllCss());
  });
  afterAll(() => compiler.close());

  const declarations = (
    list: ThemeVariable[],
    context: keyof ThemeVariable["values"],
  ) => new Map(list.map((v) => [`--${v.name}`, v.values[context]]));
  const rule = (selector: string, media?: string) =>
    rules.find((r) => r.selector === selector && r.media === media)?.decls;
  const { dark, large } = themeOverrides(variables);

  test(":root holds every variable at light and medium", () => {
    expect(rule(":root")).toEqual(
      new Map([
        ...declarations(variables, "lightMedium"),
        ["color-scheme", "light"],
      ]),
    );
  });

  test("the dark mode follows the OS unless data-theme fixes it", () => {
    const expected = new Map([
      ...declarations(dark, "darkMedium"),
      ["color-scheme", "dark"],
    ]);
    expect(
      rule(
        ':root:not([data-theme="light"])',
        "@media (prefers-color-scheme: dark)",
      ),
    ).toEqual(expected);
    expect(rule(':root[data-theme="dark"]')).toEqual(expected);
  });

  test("the large scale follows a coarse pointer unless data-scale fixes it", () => {
    const expected = declarations(large, "lightLarge");
    expect(
      rule(':root:not([data-scale="medium"])', "@media (pointer: coarse)"),
    ).toEqual(expected);
    expect(rule(':root[data-scale="large"]')).toEqual(expected);
  });

  test("has no other rules", () => {
    expect(rules).toHaveLength(5);
  });
});
