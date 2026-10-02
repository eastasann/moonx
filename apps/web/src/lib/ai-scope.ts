import type { TemplateKind } from "@moonx/schemas";

/** A template section as X2 lists it. */
export interface ScopeSection {
  key: string;
  title: string;
  part: "a" | "b" | null;
  importable: boolean;
}

/**
 * The scope of an AI exchange as it travels in `?scope=` (SDD 4): `all`, `part:a`, `part:b`, or
 * the section keys separated by commas (the item numbers of a plan). It is the label the export
 * writes into its header, so a person can read it back.
 */
export type ScopeParam = string;

const PART = /^part:([ab])$/i;

/**
 * The sections a `?scope=` names, in template order. Nothing given, `all`, or text that names no
 * section of the template means every section in `sections`.
 */
export function sectionsOfScope(
  scope: ScopeParam | undefined,
  sections: readonly ScopeSection[],
): string[] {
  const keys = sections.map((s) => s.key);
  const text = scope?.trim();
  if (!text || text.toLowerCase() === "all") return keys;
  const part = PART.exec(text)?.[1]?.toLowerCase();
  const wanted = part
    ? new Set(sections.filter((s) => s.part === part).map((s) => s.key))
    : new Set(text.split(",").map((s) => s.trim()));
  const named = keys.filter((key) => wanted.has(key));
  return named.length > 0 ? named : keys;
}

/** The inverse of {@link sectionsOfScope}: the shortest `?scope=` that names `selected`. */
export function scopeOfSections(
  selected: readonly string[],
  sections: readonly ScopeSection[],
): ScopeParam {
  const chosen = new Set(selected);
  const all = sections.map((s) => s.key);
  if (all.length > 0 && all.every((key) => chosen.has(key))) return "all";
  for (const part of ["a", "b"] as const) {
    const inPart = sections.filter((s) => s.part === part).map((s) => s.key);
    if (inPart.length > 0 && inPart.length === chosen.size && inPart.every((k) => chosen.has(k))) {
      return `part:${part}`;
    }
  }
  return all.filter((key) => chosen.has(key)).join(",");
}

/** The query of X1 for a scope the person chose (SDD 5.10). */
export function exportScopeQuery(
  kind: TemplateKind,
  selected: readonly string[],
  sections: readonly ScopeSection[],
): { sections?: string; items?: string; part?: "a" | "b" } {
  const scope = scopeOfSections(selected, sections);
  if (scope === "all") return {};
  const part = PART.exec(scope)?.[1]?.toLowerCase();
  if (part === "a" || part === "b") return { part };
  return kind === "business_plan" ? { items: scope } : { sections: scope };
}

/**
 * The sections an import accepts answers for (design-spec 6.7 "取り込み先"). Without a scope that
 * is the whole of a self analysis or a plan, and the question sections of a validation (its
 * tables have their own screens).
 */
export function importScopeSections(
  kind: TemplateKind,
  scope: ScopeParam | undefined,
  sections: readonly ScopeSection[],
): Set<string> {
  const pool = kind === "validation" ? sections.filter((s) => s.importable) : sections;
  return new Set(sectionsOfScope(scope, pool));
}
