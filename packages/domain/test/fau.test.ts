import { describe, expect, test } from "bun:test";
import { deriveFauState, emptyFauBreakdown, type FauItem, summarizeFau } from "../src";

describe("deriveFauState", () => {
  const d = deriveFauState;
  test("empty and unclassified", () => {
    expect(d({ hasValue: false, fau: null, activeEvidenceCount: 0 })).toBe("empty");
    expect(d({ hasValue: true, fau: null, activeEvidenceCount: 0 })).toBe("unclassified");
  });
  test("fact needs active evidence, otherwise it is a warning state", () => {
    expect(d({ hasValue: true, fau: "fact", activeEvidenceCount: 2 })).toBe("fact");
    expect(d({ hasValue: true, fau: "fact", activeEvidenceCount: 0 })).toBe("fact_no_evidence");
  });
  test("assumption needs a confidence", () => {
    expect(
      d({ hasValue: true, fau: "assumption", confidence: "low", activeEvidenceCount: 0 }),
    ).toBe("assumption");
    expect(d({ hasValue: true, fau: "assumption", activeEvidenceCount: 0 })).toBe("unclassified");
  });
  test("unknown wins with or without a value", () => {
    expect(d({ hasValue: false, fau: "unknown", activeEvidenceCount: 0 })).toBe("unknown");
    expect(d({ hasValue: true, fau: "unknown", activeEvidenceCount: 0 })).toBe("unknown");
  });
  test("a classification without a value falls back to empty", () => {
    expect(d({ hasValue: false, fau: "fact", activeEvidenceCount: 1 })).toBe("empty");
    expect(
      d({ hasValue: false, fau: "assumption", confidence: "high", activeEvidenceCount: 0 }),
    ).toBe("empty");
  });
});

describe("summarizeFau", () => {
  test("counts every state, with fact_no_evidence inside fact", () => {
    const items: Pick<FauItem, "state" | "confidence">[] = [
      { state: "fact" },
      { state: "fact_no_evidence" },
      { state: "assumption", confidence: "low" },
      { state: "assumption", confidence: "low" },
      { state: "assumption", confidence: "medium" },
      { state: "assumption", confidence: "high" },
      { state: "unknown" },
      { state: "unclassified" },
      { state: "unclassified" },
      { state: "empty" },
    ];
    expect(summarizeFau(items)).toEqual({
      fact: 2,
      factNoEvidence: 1,
      assumption: { total: 4, low: 2, medium: 1, high: 1 },
      unknown: 1,
      unclassified: 2,
      empty: 1,
    });
  });
  test("an assumption item without a confidence still counts in the total", () => {
    expect(summarizeFau([{ state: "assumption" }]).assumption).toEqual({
      total: 1,
      low: 0,
      medium: 0,
      high: 0,
    });
  });
  test("nothing gives zeros", () => {
    expect(summarizeFau([])).toEqual(emptyFauBreakdown());
  });
});
