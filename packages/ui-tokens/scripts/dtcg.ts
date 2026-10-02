/**
 * Reader for docs/06_design-tokens.json (DTCG). Collects the tokens, checks the alias graph and
 * resolves aliases down to primitive values (ADR-018).
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export type Scale = "medium" | "large";

export interface TokenEntry {
  path: string;
  type: string | undefined;
  value: Json;
  extensions: Record<string, Json>;
}

export type TokenMap = Map<string, TokenEntry>;

export type Leaf =
  | { kind: "color"; hex: string; alpha: number }
  | { kind: "dimension"; px: number; fontSize: boolean }
  | { kind: "duration"; ms: number }
  | { kind: "number"; value: number }
  | { kind: "fontFamily"; names: string[]; source: string }
  | { kind: "string"; value: string }
  | { kind: "cubicBezier"; points: [number, number, number, number] };

export type Resolved = Leaf | { kind: "composite"; type: string; fields: Record<string, Leaf> };

const COMPOSITE_TYPES = new Set(["typography", "shadow", "transition"]);
const ALIAS = /^\{([^{}]+)\}$/;
const EXTENSION_NAMESPACE = "app.moonx";

function isObject(value: Json | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function aliasTarget(value: Json): string | undefined {
  return typeof value === "string" ? ALIAS.exec(value)?.[1] : undefined;
}

/** Walks the document and returns every token keyed by its dot path, inheriting `$type` from the nearest group. */
export function collectTokens(doc: JsonObject): TokenMap {
  const tokens: TokenMap = new Map();
  const walk = (node: JsonObject, path: string[], inheritedType: string | undefined) => {
    const type = typeof node.$type === "string" ? node.$type : inheritedType;
    if ("$value" in node) {
      const extensions = node.$extensions;
      const namespaced = isObject(extensions) ? extensions[EXTENSION_NAMESPACE] : undefined;
      tokens.set(path.join("."), {
        path: path.join("."),
        type,
        value: node.$value as Json,
        extensions: isObject(namespaced) ? namespaced : {},
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      if (key.includes(".") || key.includes("{") || key.includes("}")) {
        throw new Error(`Token name "${[...path, key].join(".")}" contains a reserved character`);
      }
      if (isObject(child)) walk(child, [...path, key], type);
    }
  };
  walk(doc, [], undefined);
  return tokens;
}

function* scalarsOf(value: Json): Generator<string | number | boolean | null> {
  if (Array.isArray(value)) {
    for (const item of value) yield* scalarsOf(item);
  } else if (isObject(value)) {
    for (const item of Object.values(value)) yield* scalarsOf(item);
  } else {
    yield value;
  }
}

/**
 * Checks that every alias points at an existing token, that the graph has no cycle, that
 * `semantic` holds aliases only (so every chain ends in `primitive`).
 * Returns one message per violation.
 */
export function checkAliases(tokens: TokenMap): string[] {
  const errors: string[] = [];
  const refsOf = (value: Json): string[] =>
    [...scalarsOf(value)].flatMap((s) => {
      const target = aliasTarget(s as Json);
      return target ? [target] : [];
    });

  for (const token of tokens.values()) {
    const sources: Json[] = [token.value, ...Object.values(token.extensions)];
    for (const source of sources) {
      for (const ref of refsOf(source)) {
        if (!tokens.has(ref)) errors.push(`${token.path}: alias {${ref}} does not exist`);
      }
    }
    if (token.path.startsWith("semantic.")) {
      for (const source of sources) {
        for (const scalar of scalarsOf(source)) {
          if (aliasTarget(scalar as Json) === undefined) {
            errors.push(
              `${token.path}: semantic tokens must be aliases (found ${JSON.stringify(scalar)})`,
            );
          }
        }
      }
    }
  }

  const visiting = new Set<string>();
  const done = new Set<string>();
  const visit = (path: string, trail: string[]) => {
    if (done.has(path)) return;
    if (visiting.has(path)) {
      errors.push(`alias cycle: ${[...trail, path].join(" -> ")}`);
      return;
    }
    const token = tokens.get(path);
    if (!token) return;
    visiting.add(path);
    for (const source of [token.value, ...Object.values(token.extensions)]) {
      for (const ref of refsOf(source)) visit(ref, [...trail, path]);
    }
    visiting.delete(path);
    done.add(path);
  };
  for (const path of tokens.keys()) visit(path, []);

  return errors;
}

function leafFromShape(value: Json, path: string): Leaf {
  if (typeof value === "number") return { kind: "number", value };
  if (typeof value === "string") return { kind: "string", value };
  if (Array.isArray(value)) {
    if (value.length === 4 && value.every((v) => typeof v === "number")) {
      return { kind: "cubicBezier", points: value as [number, number, number, number] };
    }
    throw new Error(`${path}: unsupported array value`);
  }
  if (isObject(value)) {
    if (typeof value.hex === "string") {
      if (!/^#[0-9a-f]{6}$/i.test(value.hex)) throw new Error(`${path}: color hex must be #rrggbb`);
      return {
        kind: "color",
        hex: value.hex,
        alpha: typeof value.alpha === "number" ? value.alpha : 1,
      };
    }
    if (typeof value.value === "number" && value.unit === "px") {
      return { kind: "dimension", px: value.value, fontSize: false };
    }
    if (typeof value.value === "number" && value.unit === "ms") {
      return { kind: "duration", ms: value.value };
    }
  }
  throw new Error(`${path}: unsupported value ${JSON.stringify(value)}`);
}

/**
 * Resolves one token to primitive values. With `scale: "large"`, aliases that point into
 * `semantic.scale.medium` are redirected to `semantic.scale.large`: typography and density
 * are written against medium and take the large values when generated.
 */
export function resolveToken(tokens: TokenMap, path: string, scale: Scale): Resolved {
  const redirect = (target: string) =>
    scale === "large" && target.startsWith("semantic.scale.medium.")
      ? target.replace("semantic.scale.medium.", "semantic.scale.large.")
      : target;

  const resolveLeaf = (value: Json, origin: string): Leaf => {
    const target = aliasTarget(value);
    if (target === undefined) return leafFromShape(value, origin);
    const resolved = resolveToken(tokens, redirect(target), scale);
    if (resolved.kind === "composite")
      throw new Error(`${origin}: alias {${target}} resolves to a composite token`);
    return resolved;
  };

  const token = tokens.get(path);
  if (!token) throw new Error(`token ${path} does not exist`);

  const target = aliasTarget(token.value);
  if (target !== undefined) return resolveToken(tokens, redirect(target), scale);

  if (token.type !== undefined && COMPOSITE_TYPES.has(token.type)) {
    if (!isObject(token.value)) throw new Error(`${path}: composite token needs an object value`);
    const fields: Record<string, Leaf> = {};
    for (const [name, value] of Object.entries(token.value))
      fields[name] = resolveLeaf(value, `${path}.${name}`);
    for (const [name, value] of Object.entries(token.extensions))
      fields[name] = resolveLeaf(value, `${path}.${name}`);
    return { kind: "composite", type: token.type, fields };
  }

  switch (token.type) {
    case "fontFamily": {
      const names = Array.isArray(token.value) ? token.value : [token.value];
      if (!names.every((n): n is string => typeof n === "string"))
        throw new Error(`${path}: bad fontFamily`);
      return { kind: "fontFamily", names, source: path };
    }
    case "dimension": {
      const leaf = leafFromShape(token.value, path);
      if (leaf.kind !== "dimension") throw new Error(`${path}: dimension must use px`);
      return { ...leaf, fontSize: path.startsWith("primitive.font.size.") };
    }
    default:
      return leafFromShape(token.value, path);
  }
}

export type TreeNode = Resolved | { [key: string]: TreeNode };
export type Tree = { [key: string]: TreeNode };

/** Resolves every token under `prefix` into a nested object whose keys drop the prefix. */
export function resolveSubtree(tokens: TokenMap, prefix: string, scale: Scale): Tree {
  const root: Tree = {};
  for (const path of tokens.keys()) {
    if (!path.startsWith(`${prefix}.`)) continue;
    const segments = path.slice(prefix.length + 1).split(".");
    let node = root;
    for (const segment of segments.slice(0, -1)) {
      const next = node[segment] ?? {};
      if ("kind" in next && typeof next.kind === "string")
        throw new Error(`${path}: token nested under a token`);
      node[segment] = next;
      node = next as Tree;
    }
    node[segments[segments.length - 1] as string] = resolveToken(tokens, path, scale);
  }
  return root;
}

export function isResolved(node: TreeNode): node is Resolved {
  return typeof node.kind === "string";
}
