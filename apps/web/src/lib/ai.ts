import type { AiScope } from "@moonx/domain";
import type { TemplateKind } from "@moonx/schemas";

/**
 * 24's and 25's search parameters (SDD 4章): what is exported or imported into
 * (`source` of 24, `target` of 25), its id, the scope and the screen to return to.
 */
export interface AiSearch {
  kind: TemplateKind;
  /** The validation or plan; none for the user's own self-analysis. */
  id?: string;
  /** As {@link scopeParam} writes it. */
  scope?: string;
  /** The screen 24 or 25 was opened from, where 25 returns once applied. */
  returnTo?: string;
}

/**
 * A scope as 24's and 25's URL holds it: as the export's header writes it (design-spec
 * 6.6 規則), `all`, `part:a`, `part:b`, or the section keys joined by `,`, a plan's items
 * by their two-digit keys (`01,11`).
 */
export function scopeParam(scope: AiScope): string {
  switch (scope.kind) {
    case "all":
      return "all";
    case "part":
      return `part:${scope.part}`;
    case "sections":
      return scope.keys.join(",");
    case "items":
      return scope.itemNos
        .map((itemNo) => String(itemNo).padStart(2, "0"))
        .join(",");
  }
}

const PARTS: Record<string, "a" | "b"> = { "part:a": "a", "part:b": "b" };

/**
 * The scope `param` names among `sections` of a template of `kind`, in template order.
 * Keys the sections lack are dropped; the whole is what is left when nothing is named, or
 * nothing named is there (a link from an older template version).
 */
export function parseScope(
  kind: TemplateKind,
  param: string | undefined,
  sections: readonly { key: string }[],
): AiScope {
  if (param === undefined || param === "all") return { kind: "all" };
  const part = PARTS[param];
  if (part !== undefined) {
    return kind === "business_plan" ? { kind: "part", part } : { kind: "all" };
  }
  const named = new Set(param.split(","));
  const keys = sections
    .map((section) => section.key)
    .filter((key) => named.has(key));
  if (keys.length === 0) return { kind: "all" };
  return kind === "business_plan"
    ? { kind: "items", itemNos: keys.map(Number) }
    : { kind: "sections", keys };
}

/**
 * `returnTo` when it is a screen of `workspaceId` in this app, else undefined: only a
 * path of the workspace is followed, so a link cannot send the user elsewhere.
 */
export function safeReturnTo(
  workspaceId: string,
  value: string | undefined,
): string | undefined {
  if (value === undefined) return undefined;
  const base = `/w/${workspaceId}`;
  const inWorkspace =
    value === base ||
    value.startsWith(`${base}/`) ||
    value.startsWith(`${base}?`);
  // `//`, a backslash or a dot segment could step out of the path once resolved.
  if (!inWorkspace || /\/\/|\\|\/\.\.?(?:[/?#]|$)/u.test(value)) {
    return undefined;
  }
  return value;
}

/**
 * A search parameter as text. The router reads a value that parses as JSON as that value
 * (`scope=10` as the number 10), so a number is taken back as the text it was written as.
 */
export const searchText = (value: unknown): string | undefined =>
  typeof value === "string"
    ? value
    : typeof value === "number"
      ? String(value)
      : undefined;

const aiHref = (
  workspaceId: string,
  screen: "export" | "import",
  { kind, id, scope, returnTo }: AiSearch,
) => {
  const query = new URLSearchParams({
    [screen === "export" ? "source" : "target"]: kind,
  });
  if (id !== undefined) query.set("id", id);
  if (scope !== undefined) query.set("scope", scope);
  if (returnTo !== undefined) query.set("returnTo", returnTo);
  return `/w/${workspaceId}/ai/${screen}?${query}`;
};

/** 24 Export for AI (SDD 4章). */
export const aiExportHref = (workspaceId: string, search: AiSearch) =>
  aiHref(workspaceId, "export", search);

/** 25 Import from AI (SDD 4章). */
export const aiImportHref = (workspaceId: string, search: AiSearch) =>
  aiHref(workspaceId, "import", search);
