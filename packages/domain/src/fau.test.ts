import { describe, expect, test } from "bun:test";
import { countFau, emptyFauBreakdown, fauState, hasText } from "./fau";

describe("fauState (design-spec 6.0.3)", () => {
  const base = {
    hasValue: true,
    fau: null,
    confidence: null,
    activeEvidenceCount: 0,
  };

  test("Empty: no value and no F/A/U", () => {
    expect(fauState({ ...base, hasValue: false })).toBe("empty");
  });

  test("Unclassified: a value without F/A/U", () => {
    expect(fauState(base)).toBe("unclassified");
  });

  test("Fact with evidence, and Fact whose evidence was deleted", () => {
    expect(fauState({ ...base, fau: "fact", activeEvidenceCount: 2 })).toBe(
      "fact",
    );
    expect(fauState({ ...base, fau: "fact" })).toBe("fact_no_evidence");
  });

  test("Assumption", () => {
    expect(fauState({ ...base, fau: "assumption", confidence: "medium" })).toBe(
      "assumption",
    );
  });

  test("Unknown with or without a value", () => {
    expect(fauState({ ...base, fau: "unknown", hasValue: false })).toBe(
      "unknown",
    );
    expect(fauState({ ...base, fau: "unknown" })).toBe("unknown");
  });

  test("Fact or Assumption without a value reads as Empty", () => {
    expect(fauState({ ...base, hasValue: false, fau: "fact" })).toBe("empty");
    expect(
      fauState({
        ...base,
        hasValue: false,
        fau: "assumption",
        confidence: "low",
      }),
    ).toBe("empty");
  });
});

test("hasText treats whitespace as empty", () => {
  expect(hasText(null)).toBe(false);
  expect(hasText(" \n\t")).toBe(false);
  expect(hasText(" x ")).toBe(true);
});

test("countFau counts a Fact without evidence as a Fact too", () => {
  const breakdown = countFau([
    { state: "fact", confidence: null },
    { state: "fact_no_evidence", confidence: null },
    { state: "assumption", confidence: "low" },
    { state: "assumption", confidence: "high" },
    { state: "assumption", confidence: "high" },
    { state: "unknown", confidence: null },
    { state: "unclassified", confidence: null },
    { state: "empty", confidence: null },
    { state: "empty", confidence: null },
  ]);
  expect(breakdown).toEqual({
    fact: 2,
    factNoEvidence: 1,
    assumption: { total: 3, low: 1, medium: 0, high: 2 },
    unknown: 1,
    unclassified: 1,
    empty: 2,
  });
  expect(countFau([])).toEqual(emptyFauBreakdown());
});
