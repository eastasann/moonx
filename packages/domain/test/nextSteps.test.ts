import { describe, expect, test } from "bun:test";
import {
  type CheckInputs,
  computeNextSteps,
  DEFAULT_CHECK_RULES,
  EMPTY_ECONOMICS_INPUTS,
  evaluateChecks,
  type FauItem,
  type NextStepsInput,
  SECTION_KEYS,
  sectionLink,
} from "../src";
import { piayaInputs, piayaRows, row } from "./fixtures";

const checkBase: CheckInputs = {
  workspaceId: "w",
  ideaId: "i",
  competitors: [],
  researchLogs: [],
  costRows: [],
  economics: EMPTY_ECONOMICS_INPUTS,
  rules: DEFAULT_CHECK_RULES,
};

const doneChecks = evaluateChecks({
  ...checkBase,
  competitors: [{ typicalPrice: 1 }, { typicalPrice: 2 }, { typicalPrice: 3 }],
  researchLogs: [{ supportsChecks: ["demand_signal"] }],
  costRows: piayaRows,
  economics: piayaInputs,
});

const allInput = SECTION_KEYS.map((key) => ({ key, hasInput: true }));
const item = (state: FauItem["state"], id: string): FauItem => ({
  state,
  link: { screen: 11, questionKey: id },
});

const input = (over: Partial<NextStepsInput> = {}): NextStepsInput => ({
  workspaceId: "w",
  ideaId: "i",
  fauItems: [],
  sections: allInput,
  checks: doneChecks,
  ...over,
});

describe("computeNextSteps priority", () => {
  test("a new idea starts with 01, then the first unmet checks", () => {
    const steps = computeNextSteps(
      input({
        sections: SECTION_KEYS.map((key) => ({ key, hasInput: false })),
        checks: evaluateChecks(checkBase),
      }),
    );
    expect(steps.map((s) => s.kind)).toEqual(["start_customer_problem", "check", "check"]);
    expect(steps[0]?.sectionKey).toBe("01");
    expect(steps[1]).toMatchObject({ checkKey: "competitors", count: 3 });
    expect(steps[2]).toMatchObject({ checkKey: "local_price", count: null });
  });

  test("evidence, then classification, then checks; the link is the first matching item", () => {
    const steps = computeNextSteps(
      input({
        fauItems: [
          item("fact", "a"),
          item("unclassified", "b"),
          item("fact_no_evidence", "c"),
          item("fact_no_evidence", "d"),
          item("unclassified", "e"),
          item("unknown", "f"),
        ],
        checks: evaluateChecks(checkBase),
      }),
    );
    expect(steps.map((s) => s.kind)).toEqual(["add_evidence", "classify", "check"]);
    expect(steps[0]).toMatchObject({ count: 2, link: { questionKey: "c" } });
    expect(steps[1]).toMatchObject({ count: 2, link: { questionKey: "b" } });
  });

  test("unmet checks use the check links and counts", () => {
    const checks = evaluateChecks({
      ...checkBase,
      costRows: [
        ...piayaRows.filter((r) => r.category !== "initial"),
        row("initial", "x", null, "empty"),
        row("initial", "y", null, "empty"),
        row("initial", "z", 5, "fact"),
      ],
      economics: piayaInputs,
    });
    const steps = computeNextSteps(input({ checks }));
    const costs = steps.find((s) => s.checkKey === "costs");
    expect(costs).toMatchObject({ kind: "check", count: 2, link: { screen: 17 } });
  });

  test("costs without an Empty row have no count (only Unknown or missing rows)", () => {
    const checks = evaluateChecks({
      ...checkBase,
      costRows: [
        ...piayaRows.filter((r) => r.category !== "initial"),
        row("initial", "x", null, "unknown"),
      ],
      economics: piayaInputs,
    });
    const costs = computeNextSteps(input({ checks })).find((s) => s.checkKey === "costs");
    expect(costs).toMatchObject({ kind: "check", count: null });
  });

  test("not-started sections come after the checks, in section order", () => {
    const sections = allInput.map((s) =>
      s.key === "02" || s.key === "04" ? { ...s, hasInput: false } : s,
    );
    const steps = computeNextSteps(input({ sections }));
    expect(steps.map((s) => [s.kind, s.sectionKey])).toEqual([
      ["start_section", "02"],
      ["start_section", "04"],
    ]);
    expect(steps[0]?.link).toMatchObject({ screen: 11, sectionKey: "02" });
    expect(steps[1]?.link.screen).toBe(15);
  });

  test("unknowns come after sections", () => {
    const steps = computeNextSteps(
      input({
        fauItems: [item("unknown", "u1"), item("unknown", "u2")],
        sections: allInput.map((s) => (s.key === "03" ? { ...s, hasInput: false } : s)),
      }),
    );
    expect(steps.map((s) => s.kind)).toEqual(["start_section", "check_unknowns"]);
    expect(steps[1]).toMatchObject({ count: 2, link: { questionKey: "u1" } });
  });

  test("nothing left means ready to decide", () => {
    const steps = computeNextSteps(input());
    expect(steps).toEqual([
      {
        kind: "ready_to_decide",
        count: null,
        checkKey: null,
        sectionKey: null,
        link: { workspaceId: "w", ideaId: "i", screen: 19 },
      },
    ]);
  });

  test("at most three, or the given maximum", () => {
    const checks = evaluateChecks(checkBase);
    expect(computeNextSteps(input({ checks })).length).toBe(3);
    expect(computeNextSteps(input({ checks, maxSteps: 5 })).length).toBe(5);
  });
});

describe("sectionLink", () => {
  test("opens the screen that holds the section", () => {
    const screens = SECTION_KEYS.map((k) => sectionLink("w", "i", k).screen);
    expect(screens).toEqual([11, 11, 14, 15, 17, 18, 16, 11]);
    expect(sectionLink("w", "i", "10").sectionKey).toBe("10");
  });
});
