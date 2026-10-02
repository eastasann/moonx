import type { TemplateKind } from "@moonx/schemas";
import type { TFunction } from "i18next";
import type { ScopeSection } from "../../lib/ai-scope";

/** Validation sections the exchange covers; the catalog names them as design-spec 6.6 does. */
const VALIDATION_SECTION_KEYS: Record<string, string> = {
  "01": "ai:export.scope.validationSection.01",
  "02": "ai:export.scope.validationSection.02",
  "04": "ai:export.scope.validationSection.04",
  "08": "ai:export.scope.validationSection.08",
  "10": "ai:export.scope.validationSection.10",
};

/** How a section is named in the scope list: the template's own title, numbered for a plan. */
export function sectionLabel(t: TFunction, kind: TemplateKind, section: ScopeSection): string {
  if (kind === "self_analysis") return section.title;
  if (kind === "validation") {
    const key = VALIDATION_SECTION_KEYS[section.key];
    if (key) return t(key);
  }
  return `${section.key} ${section.title}`;
}

/** What the exchange works on, for the heading ("Validation: Piaya Gift Box Delivery"). */
export const SOURCE_KEYS: Record<TemplateKind, string> = {
  self_analysis: "ai:export.source.self_analysis",
  validation: "ai:export.source.validation",
  business_plan: "ai:export.source.business_plan",
};
