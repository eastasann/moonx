// Reads docs/06_design-tokens.json (DTCG) and checks the rules ADR-018 sets on it: every
// reference points at a token of the same type without a cycle, and the semantic layer,
// the only one the implementation reads, holds nothing but references, so following them
// always ends in the primitive layer.

import { fileURLToPath } from "node:url";

/** The source of every generated file. */
export const TOKENS_PATH = fileURLToPath(
  new URL("../../../docs/06_design-tokens.json", import.meta.url),
);

/** The DTCG types 06 uses. A token of any other type is reported. */
export const TOKEN_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "number",
  "duration",
  "cubicBezier",
  "shadow",
  "typography",
  "transition",
] as const;
/** A DTCG `$type` that 06 uses. */
export type TokenType = (typeof TOKEN_TYPES)[number];

/** The fields of the composite types, with the type each field holds. */
export const COMPOSITE_FIELDS: Partial<
  Record<TokenType, Record<string, TokenType>>
> = {
  typography: {
    fontFamily: "fontFamily",
    fontSize: "dimension",
    fontWeight: "fontWeight",
    letterSpacing: "dimension",
    lineHeight: "number",
  },
  transition: {
    duration: "duration",
    delay: "duration",
    timingFunction: "cubicBezier",
  },
  shadow: {
    color: "color",
    offsetX: "dimension",
    offsetY: "dimension",
    blur: "dimension",
    spread: "dimension",
  },
};

/** One token: its dotted path, its own or inherited `$type`, and its raw `$value`. */
export interface Token {
  path: string;
  type: string | undefined;
  value: unknown;
}

/** 06 as parsed JSON: groups and tokens, not yet checked. */
export type TokenTree = Record<string, unknown>;

/** A JSON object: not null, not an array. */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Parses 06 (or `path`). @throws when the file is not a JSON object. */
export async function loadTokens(path = TOKENS_PATH): Promise<TokenTree> {
  const tree: unknown = await Bun.file(path).json();
  if (!isObject(tree)) throw new Error(`${path} is not a JSON object`);
  return tree;
}

/**
 * Every token of the tree, by path, in the file's order. A token is an object with
 * `$value`; a group's `$type` applies to the tokens under it (DTCG).
 */
export function flattenTokens(tree: TokenTree): Map<string, Token> {
  const tokens = new Map<string, Token>();
  const walk = (node: unknown, path: string[], type: string | undefined) => {
    if (!isObject(node)) return;
    const ownType = typeof node.$type === "string" ? node.$type : type;
    if ("$value" in node) {
      tokens.set(path.join("."), {
        path: path.join("."),
        type: ownType,
        value: node.$value,
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (!key.startsWith("$")) walk(child, [...path, key], ownType);
    }
  };
  walk(tree, [], undefined);
  return tokens;
}

const ALIAS = /^\{([^{}]+)\}$/;

/** The path a `{group.token}` reference points at; `undefined` for any other value. */
export function aliasTarget(value: unknown): string | undefined {
  return typeof value === "string" ? ALIAS.exec(value)?.[1] : undefined;
}

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const HEX = /^#[0-9a-f]{6}$/;

/** What is wrong with a literal value of `type`; `undefined` when it has the right shape. */
function literalProblem(type: TokenType, value: unknown): string | undefined {
  switch (type) {
    case "color": {
      if (!isObject(value)) return "a color is an object";
      const { colorSpace, components, alpha, hex } = value;
      if (colorSpace !== "srgb") return "colorSpace must be srgb";
      if (typeof hex !== "string" || !HEX.test(hex)) {
        return "hex must be #rrggbb in lowercase";
      }
      if (
        !Array.isArray(components) ||
        components.length !== 3 ||
        !components.every((c) => isNumber(c) && c >= 0 && c <= 1)
      ) {
        return "components must be three numbers from 0 to 1";
      }
      if (
        alpha !== undefined &&
        !(isNumber(alpha) && alpha >= 0 && alpha <= 1)
      ) {
        return "alpha must be a number from 0 to 1";
      }
      // The generator writes the hex; the components must say the same colour.
      const differs = components.some(
        (c, i) =>
          Math.round((c as number) * 255) !==
          Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16),
      );
      return differs ? `components do not match ${hex}` : undefined;
    }
    case "dimension":
      return isObject(value) && isNumber(value.value) && value.unit === "px"
        ? undefined
        : 'a dimension is { value: number, unit: "px" }';
    case "fontFamily":
      return (typeof value === "string" && value !== "") ||
        (Array.isArray(value) &&
          value.length > 0 &&
          value.every((name) => typeof name === "string" && name !== ""))
        ? undefined
        : "a fontFamily is a name or a list of names";
    case "fontWeight":
      return isNumber(value) && value >= 1 && value <= 1000
        ? undefined
        : "a fontWeight is a number from 1 to 1000";
    case "number":
      return isNumber(value) ? undefined : "not a number";
    case "duration":
      return isObject(value) &&
        isNumber(value.value) &&
        value.value >= 0 &&
        value.unit === "ms"
        ? undefined
        : 'a duration is { value: number, unit: "ms" }';
    case "cubicBezier":
      return Array.isArray(value) &&
        value.length === 4 &&
        value.every(isNumber) &&
        [value[0], value[2]].every((x) => x !== undefined && x >= 0 && x <= 1)
        ? undefined
        : "a cubicBezier is [x1, y1, x2, y2] with x1 and x2 from 0 to 1";
    case "shadow":
    case "typography":
    case "transition":
      throw new Error(`a ${type} is checked field by field`);
    default: {
      // A type added to TOKEN_TYPES must get its shape check here.
      const unchecked: never = type;
      return `no shape check for ${String(unchecked)}`;
    }
  }
}

/** A reference a token makes, with the type the referenced token must have. */
interface Reference {
  at: string;
  target: string;
  type: TokenType;
}

/**
 * The references in a token's value (the whole value, or fields of a composite), and
 * what is wrong with the literals in it.
 */
function inspectValue(token: Token): {
  references: Reference[];
  problems: string[];
} {
  const type = token.type as TokenType;
  const whole = aliasTarget(token.value);
  if (whole !== undefined) {
    return {
      references: [{ at: token.path, target: whole, type }],
      problems: [],
    };
  }
  const fields = COMPOSITE_FIELDS[type];
  if (fields === undefined) {
    const problem = literalProblem(type, token.value);
    return {
      references: [],
      problems: problem === undefined ? [] : [`${token.path}: ${problem}`],
    };
  }
  if (!isObject(token.value)) {
    return {
      references: [],
      problems: [`${token.path}: a ${type} is an object`],
    };
  }
  const references: Reference[] = [];
  const problems: string[] = [];
  const names = Object.keys(fields);
  for (const name of Object.keys(token.value)) {
    if (!names.includes(name)) {
      problems.push(`${token.path}.${name}: not a field of a ${type}`);
    }
  }
  for (const [name, fieldType] of Object.entries(fields)) {
    const at = `${token.path}.${name}`;
    const value = token.value[name];
    const target = aliasTarget(value);
    if (value === undefined) {
      problems.push(`${at} is missing`);
    } else if (target !== undefined) {
      references.push({ at, target, type: fieldType });
    } else {
      const problem = literalProblem(fieldType, value);
      if (problem !== undefined) problems.push(`${at}: ${problem}`);
    }
  }
  return { references, problems };
}

/** The whole value, or every field of a composite value, is a reference. */
function isReferenceOnly(token: Token): boolean {
  if (aliasTarget(token.value) !== undefined) return true;
  const fields = COMPOSITE_FIELDS[token.type as TokenType];
  const value = token.value;
  return (
    fields !== undefined &&
    isObject(value) &&
    Object.keys(fields).every((name) => aliasTarget(value[name]) !== undefined)
  );
}

/**
 * The semantic groups whose children come in variants with the same keys and types: the
 * generator keeps one variant's keys and switches the values by mode or scale (ADR-018).
 */
export const VARIANT_GROUPS = [
  { group: "semantic.color", variants: ["light", "dark"] },
  { group: "semantic.shadow", variants: ["light", "dark"] },
  { group: "semantic.scale", variants: ["medium", "large"] },
] as const;

function keysUnder(tokens: Map<string, Token>, prefix: string): Set<string> {
  const keys = new Set<string>();
  for (const path of tokens.keys()) {
    if (path.startsWith(`${prefix}.`)) keys.add(path.slice(prefix.length + 1));
  }
  return keys;
}

/**
 * The rules of ADR-018 the tree breaks, one message each; empty when it keeps them all.
 */
export function validateTokens(tree: TokenTree): string[] {
  const problems: string[] = [];
  for (const key of Object.keys(tree)) {
    if (!key.startsWith("$") && key !== "primitive" && key !== "semantic") {
      problems.push(`${key}: the only layers are primitive and semantic`);
    }
  }
  const tokens = flattenTokens(tree);
  const referencesOf = new Map<string, Reference[]>();

  for (const token of tokens.values()) {
    if (!TOKEN_TYPES.includes(token.type as TokenType)) {
      problems.push(`${token.path}: unknown $type ${String(token.type)}`);
      continue;
    }
    const inspected = inspectValue(token);
    referencesOf.set(token.path, inspected.references);
    problems.push(...inspected.problems);
    for (const ref of inspected.references) {
      const target = tokens.get(ref.target);
      if (target === undefined) {
        problems.push(`${ref.at}: {${ref.target}} does not exist`);
      } else if (target.type !== ref.type) {
        problems.push(
          `${ref.at}: {${ref.target}} is a ${String(target.type)}, not a ${ref.type}`,
        );
      }
      if (
        token.path.startsWith("primitive.") &&
        ref.target.startsWith("semantic.")
      ) {
        problems.push(
          `${ref.at}: a primitive cannot refer to the semantic layer`,
        );
      }
    }
    if (token.path.startsWith("semantic.") && !isReferenceOnly(token)) {
      problems.push(
        `${token.path}: a semantic value is a reference, or a composite of references, never a literal`,
      );
    }
  }

  // A cycle never reaches a literal, so a value on it could never be generated.
  const state = new Map<string, "visiting" | "done">();
  const visit = (path: string, trail: string[]) => {
    if (state.get(path) === "done" || !tokens.has(path)) return;
    if (state.get(path) === "visiting") {
      const loop = [...trail.slice(trail.indexOf(path)), path];
      problems.push(`${path}: reference cycle ${loop.join(" → ")}`);
      return;
    }
    state.set(path, "visiting");
    for (const ref of referencesOf.get(path) ?? []) {
      visit(ref.target, [...trail, path]);
    }
    state.set(path, "done");
  };
  for (const path of tokens.keys()) visit(path, []);

  for (const { group, variants } of VARIANT_GROUPS) {
    const [first, second] = variants;
    const firstKeys = keysUnder(tokens, `${group}.${first}`);
    const secondKeys = keysUnder(tokens, `${group}.${second}`);
    for (const key of firstKeys) {
      if (!secondKeys.has(key)) {
        problems.push(`${group}.${second}.${key} is missing`);
        continue;
      }
      const firstType = tokens.get(`${group}.${first}.${key}`)?.type;
      const secondType = tokens.get(`${group}.${second}.${key}`)?.type;
      if (firstType !== secondType) {
        problems.push(
          `${group}.${second}.${key} is a ${String(secondType)}, but its ${first} counterpart is a ${String(firstType)}`,
        );
      }
    }
    for (const key of secondKeys) {
      if (!firstKeys.has(key)) {
        problems.push(`${group}.${first}.${key} is missing`);
      }
    }
    // Anything else in the group would have no place in the theme.
    for (const path of tokens.keys()) {
      const variant = path.startsWith(`${group}.`)
        ? path.slice(group.length + 1).split(".")[0]
        : undefined;
      if (
        variant !== undefined &&
        !(variants as readonly string[]).includes(variant)
      ) {
        problems.push(`${path}: ${group} holds only ${variants.join(" and ")}`);
      }
    }
  }

  // The PDF and the screen slide are always light (06 semantic.print, ADR-018).
  const reachesDark = (path: string, seen = new Set<string>()): boolean => {
    if (seen.has(path)) return false;
    seen.add(path);
    return (referencesOf.get(path) ?? []).some(
      ({ target }) =>
        /^semantic\.(color|shadow)\.dark\./.test(target) ||
        reachesDark(target, seen),
    );
  };
  for (const path of tokens.keys()) {
    if (path.startsWith("semantic.print.") && reachesDark(path)) {
      problems.push(`${path}: semantic.print refers to the light values only`);
    }
  }

  // The checks above follow references as written. The generator also reads references
  // into the medium scale in the large one, which can reach a cycle the written graph
  // does not have; resolving every token on both scales finds it.
  if (problems.length === 0) {
    for (const scale of ["medium", "large"] as const) {
      for (const path of tokens.keys()) {
        try {
          resolveToken(tokens, path, scale);
        } catch (error) {
          problems.push(`${path} (${scale}): ${(error as Error).message}`);
        }
      }
    }
  }
  return [...new Set(problems)];
}

/** A value with every reference followed. */
export type Resolved =
  | { kind: "literal"; type: TokenType; value: unknown; source: string }
  | { kind: "composite"; type: TokenType; fields: Record<string, Resolved> };

const MEDIUM = "semantic.scale.medium.";

/**
 * Follows the references of the token at `path` to literal values. References into
 * `semantic.scale.medium` are read in `scale` instead: typography and density name the
 * medium scale, and the generator swaps in the scale it builds for (ADR-018). The mode
 * is not swapped: the caller picks the light or dark path. Each literal keeps the path
 * of the primitive it came from (`source`).
 *
 * @throws on a broken tree; run validateTokens first.
 */
export function resolveToken(
  tokens: Map<string, Token>,
  path: string,
  scale: "medium" | "large",
  seen: string[] = [],
): Resolved {
  const token = tokens.get(path);
  if (token === undefined) throw new Error(`{${path}} does not exist`);
  if (seen.includes(path)) throw new Error(`${path}: reference cycle`);
  const follow = (target: string) =>
    resolveToken(
      tokens,
      target.startsWith(MEDIUM)
        ? `semantic.scale.${scale}.${target.slice(MEDIUM.length)}`
        : target,
      scale,
      [...seen, path],
    );
  const type = token.type as TokenType;
  const whole = aliasTarget(token.value);
  if (whole !== undefined) return follow(whole);
  const fields = COMPOSITE_FIELDS[type];
  if (fields === undefined || !isObject(token.value)) {
    return { kind: "literal", type, value: token.value, source: path };
  }
  const resolved: Record<string, Resolved> = {};
  for (const [name, fieldType] of Object.entries(fields)) {
    const value = token.value[name];
    const target = aliasTarget(value);
    resolved[name] =
      target === undefined
        ? { kind: "literal", type: fieldType, value, source: `${path}.${name}` }
        : follow(target);
  }
  return { kind: "composite", type, fields: resolved };
}
