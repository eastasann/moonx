import type { CheckResult, LinkTarget, NextStep } from "@moonx/schemas";
import { CHECK_SCREENS } from "./checks";
import type { FauItem } from "./fau";

export type SectionKey = "01" | "02" | "03" | "04" | "05" | "06-08" | "09" | "10";

export const SECTION_KEYS: SectionKey[] = ["01", "02", "03", "04", "05", "06-08", "09", "10"];

export interface SectionInput {
  key: SectionKey;
  /** Any answer, row, entry or number exists in the section. */
  hasInput: boolean;
}

export interface NextStepsInput {
  workspaceId: string;
  ideaId: string;
  /** F/A/U items in screen order, so the first matching item is the one to open. */
  fauItems: FauItem[];
  sections: SectionInput[];
  checks: CheckResult[];
  maxSteps?: number;
}

/** Where the section opens (design-spec 6.1 "操作"). */
export function sectionLink(workspaceId: string, ideaId: string, key: SectionKey): LinkTarget {
  const base = { workspaceId, ideaId };
  switch (key) {
    case "03":
      return { ...base, screen: CHECK_SCREENS.researchLog };
    case "04":
      return { ...base, screen: CHECK_SCREENS.competitors };
    case "05":
      return { ...base, screen: CHECK_SCREENS.costs };
    case "06-08":
      return { ...base, screen: CHECK_SCREENS.economics };
    case "09":
      return { ...base, screen: CHECK_SCREENS.assumptionsRisks };
    default:
      return { ...base, screen: CHECK_SCREENS.questions, sectionKey: key };
  }
}

/**
 * Picks what to fill next, top priority first, at most three (design-spec 6.1). It only says what
 * is missing, never whether the idea is good. For `check` steps `count` is the number of empty
 * cost rows (check 3, null when no row is Empty) or the template's minimum (check 1); for the
 * others it is null.
 */
export function computeNextSteps(input: NextStepsInput): NextStep[] {
  const { workspaceId, ideaId, fauItems, sections, checks } = input;
  const max = input.maxSteps ?? 3;
  const steps: NextStep[] = [];
  const countOf = (state: FauItem["state"]) => fauItems.filter((i) => i.state === state).length;
  const firstOf = (state: FauItem["state"]) => fauItems.find((i) => i.state === state);
  const step = (
    kind: NextStep["kind"],
    link: LinkTarget,
    extra: Partial<NextStep> = {},
  ): NextStep => ({ kind, count: null, checkKey: null, sectionKey: null, link, ...extra });

  const noEvidence = firstOf("fact_no_evidence");
  if (noEvidence) {
    steps.push(step("add_evidence", noEvidence.link, { count: countOf("fact_no_evidence") }));
  }
  const unclassified = firstOf("unclassified");
  if (unclassified) {
    steps.push(step("classify", unclassified.link, { count: countOf("unclassified") }));
  }
  if (sections.every((s) => !s.hasInput)) {
    steps.push(
      step("start_customer_problem", sectionLink(workspaceId, ideaId, "01"), { sectionKey: "01" }),
    );
  }
  for (const check of checks) {
    if (check.state === "done") continue;
    const count =
      check.key === "costs"
        ? check.detail?.emptyRows || null
        : check.key === "competitors"
          ? (check.params.min ?? null)
          : null;
    steps.push(step("check", check.link, { checkKey: check.key, count }));
  }
  for (const section of sections) {
    if (!section.hasInput) {
      steps.push(
        step("start_section", sectionLink(workspaceId, ideaId, section.key), {
          sectionKey: section.key,
        }),
      );
    }
  }
  const unknown = firstOf("unknown");
  if (unknown) steps.push(step("check_unknowns", unknown.link, { count: countOf("unknown") }));

  if (steps.length === 0) {
    steps.push(step("ready_to_decide", { workspaceId, ideaId, screen: CHECK_SCREENS.decision }));
  }
  return steps.slice(0, max);
}
