// The vanilla-extract theme (ADR-018): every semantic token becomes one CSS variable,
// named by its path without the variant (`semantic.color.light.surface.canvas` →
// `--color-surface-canvas`). The light and dark modes and the medium and large scales
// assign different values to the same variables.

import {
  flattenTokens,
  isObject,
  type Resolved,
  resolveToken,
  type TokenTree,
  VARIANT_GROUPS,
} from "./tokens";

/** One CSS variable: where it sits in `vars`, its name, and its value in each context. */
export interface ThemeVariable {
  key: string[];
  name: string;
  values: Record<ContextName, string>;
}

/** The variant of each variant group a value is generated for. */
interface Context {
  mode: "light" | "dark";
  scale: "medium" | "large";
}

const CONTEXTS = {
  lightMedium: { mode: "light", scale: "medium" },
  darkMedium: { mode: "dark", scale: "medium" },
  lightLarge: { mode: "light", scale: "large" },
  darkLarge: { mode: "dark", scale: "large" },
} as const satisfies Record<string, Context>;
type ContextName = keyof typeof CONTEXTS;

/** `primary-hover` → `primaryHover`: the keys of `vars` and of the print constants. */
export const camelCase = (key: string): string =>
  key.replace(/-([a-z0-9])/gi, (_, c: string) => c.toUpperCase());

const kebabCase = (key: string): string =>
  key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// CSS generic families are keywords; quoting one would make it a font name.
const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

/** `#rrggbb`, or `rgb(r g b / a)` when the colour is translucent. */
export function colorValue(value: Record<string, unknown>): string {
  const hex = String(value.hex);
  if (value.alpha === undefined || value.alpha === 1) return hex;
  const [r, g, b] = [1, 3, 5].map((i) =>
    Number.parseInt(hex.slice(i, i + 2), 16),
  );
  return `rgb(${r} ${g} ${b} / ${String(value.alpha)})`;
}

/**
 * A literal as CSS. Font sizes are rem, as 06 says of `primitive.font.size`, except in
 * `semantic.print` (`remFonts` false), whose slide scales as one px box.
 */
function literalCss(
  resolved: Resolved & { kind: "literal" },
  remFonts: boolean,
): string {
  const { type, value, source } = resolved;
  const record = isObject(value) ? value : {};
  switch (type) {
    case "color":
      return colorValue(record);
    case "dimension":
      return remFonts && source.startsWith("primitive.font.size.")
        ? `${Number(record.value) / 16}rem`
        : `${Number(record.value)}px`;
    case "fontFamily":
      return (Array.isArray(value) ? value : [value])
        .map((name) =>
          GENERIC_FAMILIES.has(String(name))
            ? String(name)
            : JSON.stringify(String(name)),
        )
        .join(", ");
    case "duration":
      return `${Number(record.value)}ms`;
    case "cubicBezier":
      return `cubic-bezier(${(value as number[]).join(", ")})`;
    case "fontWeight":
    case "number":
      return String(value);
    case "shadow":
    case "typography":
    case "transition":
      throw new Error(`a ${type} is written field by field`);
    default: {
      const unwritten: never = type;
      throw new Error(`no CSS for ${String(unwritten)}`);
    }
  }
}

/**
 * The CSS of a resolved value: one entry for a single value or a shadow, one per field
 * (keyed by field name) for typography and transition.
 */
function cssEntries(
  resolved: Resolved,
  remFonts: boolean,
): [string | undefined, string][] {
  if (resolved.kind === "literal") {
    return [[undefined, literalCss(resolved, remFonts)]];
  }
  if (resolved.type === "shadow") {
    const parts = ["offsetX", "offsetY", "blur", "spread", "color"].map(
      (field) => {
        const part = resolved.fields[field];
        if (part?.kind !== "literal") throw new Error(`shadow ${field}`);
        return literalCss(part, remFonts);
      },
    );
    return [[undefined, parts.join(" ")]];
  }
  return Object.entries(resolved.fields).map(([field, part]) => {
    if (part.kind !== "literal") throw new Error(`nested ${field}`);
    return [field, literalCss(part, remFonts)];
  });
}

/**
 * The entry of VARIANT_GROUPS a semantic path falls in (`semantic.color.light.…` is in
 * `semantic.color`, whose variant is the third segment); `undefined` outside them.
 */
function variantGroup(path: string[]) {
  return VARIANT_GROUPS.find(
    ({ group }) => path.slice(0, 2).join(".") === group,
  );
}

/**
 * The CSS variables of the semantic layer, in 06's order.
 *
 * @throws when a token changes with both the mode and the scale: the theme assigns the
 *   two separately, so such a value has no place.
 */
export function themeVariables(tree: TokenTree): ThemeVariable[] {
  const tokens = flattenTokens(tree);
  const variables: ThemeVariable[] = [];
  for (const path of tokens.keys()) {
    const segments = path.split(".");
    if (segments[0] !== "semantic") continue;
    const variants = variantGroup(segments);
    if (variants !== undefined && segments[2] !== variants.variants[0]) {
      continue;
    }
    const key = segments
      .slice(1)
      .filter((_, i) => variants === undefined || i !== 1);
    const sourceFor = (context: Context) => {
      if (variants === undefined) return path;
      const variant =
        variants.group === "semantic.scale" ? context.scale : context.mode;
      return [...segments.slice(0, 2), variant, ...segments.slice(3)].join(".");
    };
    const perContext = Object.fromEntries(
      Object.entries(CONTEXTS).map(([name, context]) => [
        name,
        cssEntries(
          resolveToken(tokens, sourceFor(context), context.scale),
          !path.startsWith("semantic.print."),
        ),
      ]),
    ) as Record<ContextName, [string | undefined, string][]>;
    const fields = (name: ContextName) =>
      perContext[name].map(([field]) => field).join();
    if (
      Object.keys(CONTEXTS).some(
        (name) => fields(name as ContextName) !== fields("lightMedium"),
      )
    ) {
      throw new Error(`${path}: the variants do not have the same fields`);
    }

    perContext.lightMedium.forEach(([field], index) => {
      const fieldKey = field === undefined ? [] : [field];
      const values = Object.fromEntries(
        Object.entries(perContext).map(([name, entries]) => [
          name,
          String(entries[index]?.[1]),
        ]),
      ) as Record<ContextName, string>;
      const name = [...key, ...fieldKey.map(kebabCase)].join("-");
      const byMode = values.darkMedium !== values.lightMedium;
      const byScale = values.lightLarge !== values.lightMedium;
      const expectedDarkLarge = byMode
        ? values.darkMedium
        : byScale
          ? values.lightLarge
          : values.lightMedium;
      if ((byMode && byScale) || values.darkLarge !== expectedDarkLarge) {
        throw new Error(`--${name} changes with both the mode and the scale`);
      }
      variables.push({
        key: [...key.map(camelCase), ...fieldKey],
        name,
        values,
      });
    });
  }

  const names = new Set<string>();
  const keys = new Set<string>();
  for (const { name, key } of variables) {
    if (names.has(name)) throw new Error(`--${name} comes from two tokens`);
    if (keys.has(key.join("."))) {
      throw new Error(`vars.${key.join(".")} comes from two tokens`);
    }
    names.add(name);
    keys.add(key.join("."));
  }
  return variables;
}

/** The variables whose value differs from light medium in the dark mode and the large scale. */
export function themeOverrides(variables: ThemeVariable[]) {
  return {
    dark: variables.filter((v) => v.values.darkMedium !== v.values.lightMedium),
    large: variables.filter(
      (v) => v.values.lightLarge !== v.values.lightMedium,
    ),
  };
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** The TypeScript expression for a variable in `vars`. */
const accessor = (key: string[]) =>
  `vars${key.map((k) => (IDENTIFIER.test(k) ? `.${k}` : `[${JSON.stringify(k)}]`)).join("")}`;

/** A nested object from paths to leaves. */
export function nest(
  entries: Iterable<[string[], unknown]>,
): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, leaf] of entries) {
    let node = root;
    for (const part of key.slice(0, -1)) {
      if (!isObject(node[part])) node[part] = {};
      node = node[part] as Record<string, unknown>;
    }
    node[key.at(-1) ?? ""] = leaf;
  }
  return root;
}

function nestedSource(leaves: [string[], string][]): string {
  const write = (node: Record<string, unknown>): string =>
    `{\n${Object.entries(node)
      .map(
        ([k, v]) =>
          `${JSON.stringify(k)}: ${isObject(v) ? write(v) : String(v)},`,
      )
      .join("\n")}\n}`;
  return write(nest(leaves));
}

/** The first lines of every generated TypeScript file. */
export const GENERATED_HEADER = `// Generated by make tokens from docs/06_design-tokens.json. Do not edit: change 06 or
// packages/ui-tokens/scripts/ and run make tokens (ADR-018, ADR-025).`;

/** `src/generated/vars.ts`: the contract of CSS variables, and the breakpoints. */
export function varsSource(tree: TokenTree): string {
  const variables = themeVariables(tree);
  const tokens = flattenTokens(tree);
  const breakpoints = [...tokens.keys()]
    .filter((path) => path.startsWith("semantic.breakpoint."))
    .map((path) => {
      const resolved = resolveToken(tokens, path, "medium");
      if (resolved.type !== "dimension" || resolved.kind !== "literal") {
        throw new Error(`${path} is not a dimension`);
      }
      return [
        [camelCase(path.slice("semantic.breakpoint.".length))],
        String((resolved.value as { value: number }).value),
      ] as [string[], string];
    });
  return `${GENERATED_HEADER}

import { createGlobalThemeContract } from "@vanilla-extract/css";

/**
 * The semantic tokens as CSS variables (\`var(--color-surface-canvas)\`). The light and
 * dark modes share the names under \`color\` and \`shadow\`, the medium and large scales
 * those under \`scale\` (and the font sizes and row heights that follow the scale);
 * theme.css.ts assigns the values.
 */
export const vars = createGlobalThemeContract(${nestedSource(
    variables.map(({ key, name }) => [key, JSON.stringify(name)]),
  )});

/** \`semantic.breakpoint\` in px, for media queries, which cannot read CSS variables. */
export const breakpoints = ${nestedSource(breakpoints)} as const;
`;
}

const assignments = (variables: ThemeVariable[], context: ContextName) =>
  `{\n${variables
    .map((v) => `[${accessor(v.key)}]: ${JSON.stringify(v.values[context])},`)
    .join("\n")}\n}`;

/**
 * `src/generated/theme.css.ts`: light and medium on `:root`; dark from the OS unless
 * `<html data-theme="light">`, or fixed by `data-theme="dark"`; large on touch screens
 * (`pointer: coarse`) unless `<html data-scale="medium">`, or fixed by
 * `data-scale="large"` (ADR-018).
 */
export function themeSource(tree: TokenTree): string {
  const variables = themeVariables(tree);
  const { dark, large } = themeOverrides(variables);
  return `${GENERATED_HEADER}

import { globalStyle } from "@vanilla-extract/css";
import { vars } from "./vars";

const dark = ${assignments(dark, "darkMedium")};

const large = ${assignments(large, "lightLarge")};

globalStyle(":root", {
  colorScheme: "light",
  vars: ${assignments(variables, "lightMedium")},
});

globalStyle(':root:not([data-theme="light"])', {
  "@media": {
    "(prefers-color-scheme: dark)": { colorScheme: "dark", vars: dark },
  },
});

globalStyle(':root[data-theme="dark"]', { colorScheme: "dark", vars: dark });

globalStyle(':root:not([data-scale="medium"])', {
  "@media": { "(pointer: coarse)": { vars: large } },
});

globalStyle(':root[data-scale="large"]', { vars: large });
`;
}
