import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import { type Compiler, createCompiler } from "@vanilla-extract/compiler";
import { flattenTokens, loadTokens, type TokenTree } from "./tokens";
import {
  camelCase,
  type ThemeVariable,
  themeOverrides,
  themeVariables,
  varsSource,
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
        !path.startsWith("semantic.scale.large.") &&
        !path.startsWith("semantic.font-size.narrow."),
    );
    const fields = { typography: 5, transition: 3 } as Record<string, number>;
    const expected = tokens.reduce(
      (sum, { type }) => sum + (fields[String(type)] ?? 1),
      0,
    );
    expect(variables).toHaveLength(expected);
  });

  test("writes font sizes in rem, print sizes and other dimensions in px", () => {
    expect(value("font-size-body")).toMatchObject({
      lightMedium: "0.9375rem",
      lightNarrow: "1rem",
    });
    expect(value("scale-component-button-font-size-M")?.lightMedium).toBe(
      "0.875rem",
    );
    expect(value("print-font-size-footer")?.lightMedium).toBe("10px");
    expect(value("print-typography-title-font-size")?.lightMedium).toBe("44px");
    expect(value("space-300")?.lightMedium).toBe("16px");
    expect(value("typography-display-letter-spacing")?.lightMedium).toBe(
      "-1.62px",
    );
    expect(value("fluid-type-display-viewport")?.lightMedium).toBe("4.2");
  });

  test("swaps the medium scale for large in density, and the wide sizes for narrow in typography", () => {
    expect(value("density-regular-row-height")).toMatchObject({
      lightMedium: "40px",
      lightLarge: "50px",
      lightNarrow: "40px",
    });
    expect(value("typography-body-font-size")).toMatchObject({
      lightMedium: "0.9375rem",
      lightLarge: "0.9375rem",
      lightNarrow: "1rem",
    });
    expect(value("scale-component-field-font-size-M")).toMatchObject({
      lightMedium: "0.875rem",
      lightLarge: "0.875rem",
      lightNarrow: "1rem",
    });
    // tab-label names a primitive size, so it keeps it on every scale and width.
    expect(value("typography-tab-label-font-size")).toMatchObject({
      lightMedium: "0.65625rem",
      lightLarge: "0.65625rem",
      lightNarrow: "0.65625rem",
    });
  });

  test("the large scale changes only the target, the heights of what is pressed and the fields' text floor (design-spec 4.3・4.4)", () => {
    const heights =
      /^scale-component-(button-height|action-button-height|segmented-control-item-height|tag-height|menu-item-height|field-height|field-font-size-min|tabs-item-height|disclosure-title-height|breadcrumbs-height|table-row-height|table-view-row-height|target-min)/;
    const scaled = variables
      .filter((v) => v.key[0] === "scale")
      .filter((v) => v.values.lightLarge !== v.values.lightMedium)
      .map((v) => v.name);
    expect(scaled.length).toBeGreaterThan(0);
    expect(scaled.filter((name) => !heights.test(name))).toEqual([]);
  });

  test("writes the other types as CSS", () => {
    expect(value("color-surface-scrim")?.lightMedium).toBe(
      "rgb(14 17 32 / 0.4)",
    );
    expect(value("font-family-mono")?.lightMedium).toBe(
      '"IBM Plex Mono", "IBM Plex Sans JP", ui-monospace, "Menlo", "Consolas", monospace',
    );
    expect(value("typography-heading-1-font-weight")?.lightMedium).toBe("600");
    expect(value("typography-body-line-height")?.lightMedium).toBe("1.55");
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
      lightMedium: "#ffffff",
      darkMedium: "#ffffff",
    });
  });

  test("rejects a token that changes with more than one of the mode, the scale and the width", () => {
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
      "--color-gap changes with more than one of the mode, the scale and the width",
    );
    const byWidth: TokenTree = {
      primitive: { size: { $type: "dimension", a: px(1), b: px(2) } },
      semantic: {
        "font-size": {
          $type: "dimension",
          wide: { gap: { $value: "{primitive.size.a}" } },
          narrow: { gap: { $value: "{primitive.size.b}" } },
        },
        scale: {
          $type: "dimension",
          medium: { gap: { $value: "{semantic.font-size.wide.gap}" } },
          large: { gap: { $value: "{primitive.size.b}" } },
        },
      },
    };
    expect(() => themeVariables(byWidth)).toThrow(
      "--scale-gap changes with more than one of the mode, the scale and the width",
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
  const { dark, large, narrow } = themeOverrides(variables);
  const keys = (list: ThemeVariable[]) => list.map((v) => v.key[0]);

  test("switches only the colours and shadows with the mode", () => {
    expect(new Set(keys(dark))).toEqual(new Set(["color", "shadow"]));
  });

  test("switches the scale, and the row heights that follow it, with the scale", () => {
    expect(new Set(keys(large))).toEqual(new Set(["scale", "density"]));
  });

  test("switches the font sizes, and the styles and fields that follow them, with the width", () => {
    expect(new Set(keys(narrow))).toEqual(
      new Set(["fontSize", "typography", "scale"]),
    );
    expect(
      narrow
        .filter((v) => v.key[0] === "scale")
        .every((v) =>
          v.key.join(".").startsWith("scale.component.field.fontSize"),
        ),
    ).toBe(true);
  });
});

test("vars.ts gives the sizes code reads as numbers in px", () => {
  const source = varsSource(tree);
  expect(source).toContain(`"tablet": 768,`);
  expect(source).toContain("export const popoverMaxHeight = 384;");
  expect(source).toContain("export const twoColumnMinWidth = 788;");
  expect(source).toContain("export const presentationTwoColumnMinWidth = 704;");
  expect(source).toContain("export const publicStackMaxWidth = 900;");
  expect(value("layout-popover-max-height")?.lightMedium).toBe("384px");
});

test("the landing's fluid titles still reach 200% with browser zoom (WCAG 1.4.4)", () => {
  // Zoom shrinks the viewport, so the vw term stops growing; the rem bounds keep growing.
  // With max at most 2.5 × min, zooming to 500% (every browser's limit or less) lifts the
  // minimum to at least twice the largest size (Adrian Roselli, "Responsive Type and Zoom").
  for (const name of ["display", "display-2"]) {
    const rem = (field: string) =>
      Number.parseFloat(
        value(`fluid-type-${name}-${field}`)?.lightMedium ?? "",
      );
    expect(value(`fluid-type-${name}-min`)?.lightMedium).toMatch(/rem$/);
    expect(value(`fluid-type-${name}-max`)?.lightMedium).toMatch(/rem$/);
    expect(rem("max")).toBeLessThanOrEqual(2.5 * rem("min"));
  }
});

test("on touch, field text is 16px at least: iOS zooms into smaller fields (design-spec 4.3)", () => {
  expect(value("scale-component-field-font-size-min")).toMatchObject({
    lightMedium: "0px",
    lightLarge: "1rem",
  });
});

test("two-column-min-width stays the body of a desktop at its breakpoint (06 $description)", () => {
  const px = (name: string) =>
    Number.parseFloat(value(name)?.lightMedium ?? "");
  const body = px("layout-two-column-min-width");
  expect(body).toBe(px("breakpoint-desktop") - px("layout-sidebar-width"));
  // At that width D's list takes its minimum, not its 5 : 6 share, as the $description
  // counts it.
  const list = Number(value("layout-list-detail-list-ratio")?.lightMedium);
  const detail = Number(value("layout-list-detail-detail-ratio")?.lightMedium);
  expect((body * list) / (list + detail)).toBeLessThan(
    px("layout-list-detail-list-min-width"),
  );
});

test("I's two-column-min-width stays the body of a tablet at its breakpoint (06 $description)", () => {
  const px = (name: string) =>
    Number.parseFloat(value(name)?.lightMedium ?? "");
  // I draws its thumbnails beside the slide on a tablet too (design-spec 4.1), so its
  // narrowest two columns are a tablet's at its breakpoint, with the icons-only SideNav.
  expect(px("layout-presentation-two-column-min-width")).toBe(
    px("breakpoint-tablet") - px("layout-sidebar-width-collapsed"),
  );
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
  const { dark, large, narrow } = themeOverrides(variables);

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

  test("the narrow font sizes follow the width below the tablet breakpoint", () => {
    expect(rule(":root", "@media not all and (min-width: 768px)")).toEqual(
      declarations(narrow, "lightNarrow"),
    );
  });

  test("has no other rules", () => {
    expect(rules).toHaveLength(6);
  });
});
