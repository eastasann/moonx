import type { Confidence, Fau, FauBreakdown, FauState } from "@moonx/schemas";

/** What decides the F/A/U state of one answer or number (design-spec 6.0.3). */
export interface FauSubject {
  hasValue: boolean;
  fau: Fau | null;
  confidence: Confidence | null;
  /** Evidence links whose research log is not deleted. URL evidence always counts. */
  activeEvidenceCount: number;
}

/** A text answer has a value when it is not blank (design-spec 6.0.8). */
export const hasText = (text: string | null) =>
  text !== null && text.trim().length > 0;

/**
 * The F/A/U state of design-spec 6.0.3.
 *
 * Unknown needs no value. Fact and Assumption without a value cannot be saved (clearing
 * the value clears them, SDD 5.7 V3); if one is passed anyway it reads as Empty, the state
 * a cleared value goes back to.
 */
export const fauState = (subject: FauSubject): FauState => {
  if (subject.fau === "unknown") return "unknown";
  if (!subject.hasValue) return "empty";
  switch (subject.fau) {
    case null:
      return "unclassified";
    case "assumption":
      return "assumption";
    case "fact":
      return subject.activeEvidenceCount > 0 ? "fact" : "fact_no_evidence";
  }
};

/** A breakdown with every count at 0. Each call returns a new object to count into. */
export const emptyFauBreakdown = (): FauBreakdown => ({
  fact: 0,
  factNoEvidence: 0,
  assumption: { total: 0, low: 0, medium: 0, high: 0 },
  unknown: 0,
  unclassified: 0,
  empty: 0,
});

/** What `countFau` reads of one item. */
export interface FauCount {
  state: FauState;
  confidence: Confidence | null;
}

/**
 * Counts states into the breakdown of design-spec 6.1. A Fact without evidence counts as a
 * Fact and also in `factNoEvidence`.
 */
export const countFau = (items: Iterable<FauCount>): FauBreakdown => {
  const breakdown = emptyFauBreakdown();
  for (const item of items) {
    switch (item.state) {
      case "fact":
        breakdown.fact += 1;
        break;
      case "fact_no_evidence":
        breakdown.fact += 1;
        breakdown.factNoEvidence += 1;
        break;
      case "assumption":
        breakdown.assumption.total += 1;
        if (item.confidence !== null)
          breakdown.assumption[item.confidence] += 1;
        break;
      case "unknown":
        breakdown.unknown += 1;
        break;
      case "unclassified":
        breakdown.unclassified += 1;
        break;
      case "empty":
        breakdown.empty += 1;
        break;
    }
  }
  return breakdown;
};
