import { describe, expect, test } from "bun:test";
import { applyClassification } from "../src/lib/fau-rules";

const none = { fau: null, confidence: null } as const;
const base = { current: none, hasValue: true, input: undefined, activeEvidenceCount: 0 };

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return (error as { code: string }).code;
  }
  return null;
};

describe("applyClassification", () => {
  test("a request without classification keeps the current one", () => {
    const current = { fau: "assumption", confidence: "low" } as const;
    expect(applyClassification({ ...base, current }, false)).toEqual({
      fau: "assumption",
      confidence: "low",
      clearValue: false,
    });
  });

  test("Fact needs a value and evidence", () => {
    const fact = { fau: "fact" as const };
    expect(code(() => applyClassification({ ...base, input: fact }, false))).toBe(
      "FACT_REQUIRES_EVIDENCE",
    );
    expect(
      code(() =>
        applyClassification(
          { ...base, input: fact, hasValue: false, activeEvidenceCount: 1 },
          false,
        ),
      ),
    ).toBe("FACT_REQUIRES_EVIDENCE");
    expect(applyClassification({ ...base, input: fact, activeEvidenceCount: 2 }, false).fau).toBe(
      "fact",
    );
  });

  test("an existing Fact survives losing its evidence while the text changes", () => {
    const current = { fau: "fact", confidence: null } as const;
    expect(applyClassification({ ...base, current }, false).fau).toBe("fact");
    expect(applyClassification({ ...base, current, input: { fau: "fact" } }, false).fau).toBe(
      "fact",
    );
  });

  test("Assumption needs a confidence and the others refuse one", () => {
    expect(code(() => applyClassification({ ...base, input: { fau: "assumption" } }, false))).toBe(
      "CONFIDENCE_REQUIRED",
    );
    expect(
      applyClassification({ ...base, input: { fau: "assumption", confidence: "high" } }, false),
    ).toEqual({ fau: "assumption", confidence: "high", clearValue: false });
    expect(
      code(() =>
        applyClassification({ ...base, input: { fau: "unknown", confidence: "low" } }, false),
      ),
    ).toBe("VALIDATION_FAILED");
  });

  test("Unknown clears a number's value but keeps a text", () => {
    expect(applyClassification({ ...base, input: { fau: "unknown" } }, true).clearValue).toBe(true);
    expect(applyClassification({ ...base, input: { fau: "unknown" } }, false).clearValue).toBe(
      false,
    );
  });

  test("without a value only Unknown survives; fau null removes the classification", () => {
    const current = { fau: "assumption", confidence: "medium" } as const;
    expect(applyClassification({ ...base, current, hasValue: false }, false)).toEqual({
      fau: null,
      confidence: null,
      clearValue: false,
    });
    expect(
      applyClassification(
        { ...base, current: { fau: "unknown", confidence: null }, hasValue: false },
        false,
      ).fau,
    ).toBe("unknown");
    expect(applyClassification({ ...base, current, input: { fau: null } }, false).fau).toBeNull();
  });
});
