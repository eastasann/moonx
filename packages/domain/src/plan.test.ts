import { describe, expect, test } from "bun:test";
import {
  PLAN_LIST_COLUMNS,
  type QuestionOptions,
  type TemplateQuestion,
} from "@moonx/schemas";
import {
  assumptionEvidenceText,
  type DraftSource,
  draftAnswer,
  type PlanQuestion,
  planItemMarks,
  planItemProgress,
  tableTotals,
} from "./plan";

const question = (
  key: string,
  answerType: TemplateQuestion["answerType"] = "long_text",
  options: QuestionOptions | null = null,
): PlanQuestion => ({
  key,
  sectionKey: key.split(".")[1] ?? "",
  title: key,
  prompt: key,
  example: null,
  hint: null,
  answerType,
  options,
  displayCondition: null,
  hasFau: false,
  copyFrom: null,
  reference: null,
});

const source = (overrides: Partial<DraftSource> = {}): DraftSource => ({
  oneLineConcept: "Gift boxes for offices",
  proposedSolution: null,
  answerText: (key) =>
    ({ "V.01.WHO": "HR officers", "V.01.WHY_THEM": "They buy monthly" })[key] ??
    null,
  assumptions: [],
  risks: [],
  ...overrides,
});

describe("draftAnswer", () => {
  test("joins the texts in order with a blank line, skipping empty ones", () => {
    expect(
      draftAnswer(
        ["V.01.WHO", "IDEA.PROPOSED_SOLUTION", "V.01.WHY_THEM"],
        source(),
      ),
    ).toEqual({ text: "HR officers\n\nThey buy monthly", rows: null });
    expect(draftAnswer(["IDEA.ONE_LINE_CONCEPT"], source())).toEqual({
      text: "Gift boxes for offices",
      rows: null,
    });
    expect(
      draftAnswer(
        ["IDEA.PROPOSED_SOLUTION", "V.01.PROBLEM"],
        source({ proposedSolution: "  " }),
      ),
    ).toBeNull();
  });

  test("copies 16's lists into the columns the template's tables have", () => {
    const lists = source({
      assumptions: [
        {
          statement: "Offices reorder",
          whyBelieve: null,
          evidence: [],
          evidenceNote: null,
          disproveCondition: "No reorder",
        },
      ],
      risks: [
        {
          statement: "Stale piaya",
          probability: "medium",
          impact: null,
          mitigation: null,
        },
      ],
    });
    const assumptions = draftAnswer(["LIST.ASSUMPTIONS"], lists);
    expect(Object.keys(assumptions?.rows?.[0] ?? {})).toEqual([
      ...PLAN_LIST_COLUMNS["LIST.ASSUMPTIONS"],
    ]);
    const risks = draftAnswer(["LIST.RISKS"], lists);
    expect(risks?.rows).toEqual([
      {
        risk: "Stale piaya",
        probability: "Medium",
        impact: null,
        mitigation: null,
        trigger_indicator: null,
      },
    ]);
    expect(Object.keys(risks?.rows?.[0] ?? {})).toEqual([
      ...PLAN_LIST_COLUMNS["LIST.RISKS"],
    ]);
    expect(draftAnswer(["LIST.RISKS"], source())).toBeNull();
  });

  test("writes the evidence as URLs with their notes and dated logs, then the free text", () => {
    expect(
      assumptionEvidenceText(
        [
          {
            url: null,
            note: null,
            log: { observedOn: "2026-09-01", topic: "Price check" },
          },
          { url: null, note: null, log: { observedOn: null, topic: "Visit" } },
          { url: "https://example.com", note: "Survey", log: null },
          { url: "https://example.org", note: null, log: null },
          { url: null, note: null, log: null },
        ],
        "Ask the pilot",
      ),
    ).toBe(
      "2026-09-01 Price check; Visit; https://example.com (Survey); https://example.org; Ask the pilot",
    );
    expect(assumptionEvidenceText([], "  ")).toBeNull();
  });
});

describe("plan items", () => {
  const milestones: QuestionOptions = {
    kind: "execution_view",
    executionType: "milestone",
  };
  const founders: QuestionOptions = {
    kind: "table",
    columns: [
      { key: "name", label: "Name", type: "text" },
      { key: "share", label: "Share", type: "percent" },
      { key: "capital", label: "Capital", type: "money" },
    ],
  };

  test("counts filled sub-items, leaving the numbers out", () => {
    const questions = [
      question("P.01.1"),
      question("P.01.2"),
      question("P.01.3", "linked_metric", {
        kind: "linked_metric",
        metricKeys: ["selling_price"],
      }),
      question("P.01.4", "table", founders),
      question("P.01.5", "execution_view", milestones),
    ];
    const progress = (rows: number, items: number) =>
      planItemProgress(questions, {
        answers: new Map([
          ["P.01.1", { text: "A business", rows: null }],
          ["P.01.2", { text: " ", rows: null }],
          ["P.01.4", { text: null, rows: Array(rows).fill({ name: "Ana" }) }],
        ]),
        executionCounts: new Map([["milestone", items]]),
      });
    expect(progress(0, 0)).toEqual({ filled: 1, total: 4 });
    expect(progress(1, 6)).toEqual({ filled: 3, total: 4 });
  });

  test("marks V for copies and numbers, S for self-analyses, nothing for starting rows", () => {
    expect(
      planItemMarks([{ ...question("P.01.1"), copyFrom: ["V.01.WHO"] }]),
    ).toEqual(["V"]);
    expect(
      planItemMarks([
        question("P.08.3", "linked_metric", {
          kind: "linked_metric",
          metricKeys: ["selling_price"],
        }),
        {
          ...question("P.08.4"),
          reference: [{ kind: "self_analysis", sections: ["WHY"] }],
        },
      ]),
    ).toEqual(["V", "S"]);
    expect(
      planItemMarks([question("P.23.1", "execution_view", milestones)]),
    ).toEqual([]);
  });

  test("totals the % and money columns exactly", () => {
    expect(
      tableTotals(founders, [
        { name: "Ana", share: 0.6, capital: 120000.1 },
        { name: "Kenji", share: 0.2, capital: 0.2 },
        { name: "Paolo", share: 0.2, capital: null },
        { name: "Grace", share: null, capital: "n/a" },
      ]),
    ).toEqual({ ownership: 1, capital: 120000.3 });
    expect(tableTotals(founders, null)).toEqual({ ownership: 0, capital: 0 });
  });
});
