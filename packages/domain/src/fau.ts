import type { Confidence, Fau, FauBreakdown, FauState, LinkTarget } from "@moonx/schemas";

/** What decides the F/A/U state of one answer or number (design-spec 6.0.3). */
export interface FauStateInput {
  hasValue: boolean;
  fau: Fau | null;
  confidence?: Confidence | null;
  /** Evidence links that do not point at a deleted research log. */
  activeEvidenceCount: number;
}

/**
 * Derives the displayed state. Unknown wins over the value (numbers keep none, text may keep an
 * explanation). Without a value only Unknown survives, and an Assumption without a confidence has
 * not been classified yet.
 */
export function deriveFauState(input: FauStateInput): FauState {
  if (input.fau === "unknown") return "unknown";
  if (!input.hasValue) return "empty";
  if (input.fau === "fact") return input.activeEvidenceCount > 0 ? "fact" : "fact_no_evidence";
  if (input.fau === "assumption" && input.confidence != null) return "assumption";
  return "unclassified";
}

/** One classifiable item as the breakdown and the next steps see it. */
export interface FauItem {
  state: FauState;
  confidence?: Confidence | null;
  /** Where to open the item. Items must be passed in screen order (01, 02, 04, 05, 06-08, 10). */
  link: LinkTarget;
}

export function emptyFauBreakdown(): FauBreakdown {
  return {
    fact: 0,
    factNoEvidence: 0,
    assumption: { total: 0, low: 0, medium: 0, high: 0 },
    unknown: 0,
    unclassified: 0,
    empty: 0,
  };
}

/** Counts items by state. `factNoEvidence` is part of `fact`. */
export function summarizeFau(items: Pick<FauItem, "state" | "confidence">[]): FauBreakdown {
  const out = emptyFauBreakdown();
  for (const item of items) {
    switch (item.state) {
      case "fact":
        out.fact += 1;
        break;
      case "fact_no_evidence":
        out.fact += 1;
        out.factNoEvidence += 1;
        break;
      case "assumption":
        out.assumption.total += 1;
        if (item.confidence != null) out.assumption[item.confidence] += 1;
        break;
      case "unknown":
        out.unknown += 1;
        break;
      case "unclassified":
        out.unclassified += 1;
        break;
      case "empty":
        out.empty += 1;
        break;
    }
  }
  return out;
}
