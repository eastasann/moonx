import { describe, expect, test } from "bun:test";
import type { TemplateKind } from "./common";
import { templateFileSchema } from "./template-file";

const question = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  title: "TITLE",
  prompt: "A question?",
  example: null,
  hint: null,
  answerType: "long_text",
  options: null,
  displayCondition: null,
  hasFau: false,
  copyFrom: null,
  reference: null,
  ...extra,
});

const thresholds = [
  { checkKey: "competitors", params: { min: 3 } },
  {
    checkKey: "local_price",
    params: { pricedCompetitors: 2, researchLogs: 1 },
  },
  { checkKey: "permits", params: { researchLogs: 1 } },
  { checkKey: "demand_signal", params: { researchLogs: 1 } },
];

const file = (
  kind: TemplateKind,
  questions: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  format: "moonx-template",
  formatVersion: 1,
  kind,
  name: "Sample",
  aiPrompt: "",
  sections: [
    {
      key: { self_analysis: "WHY", validation: "01", business_plan: "01" }[
        kind
      ],
      part: kind === "business_plan" ? "a" : null,
      title: "Section",
      subtitle: null,
      guidance: null,
      questions,
    },
  ],
  costDefaults: [],
  checkRules: kind === "validation" ? thresholds : [],
  executionPresets: [],
  ...extra,
});

/** `[path, code, rule]` of each issue, or `[]` when the file passes. */
const issues = (input: unknown) => {
  const result = templateFileSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.map((issue) => [
        issue.path.join("."),
        issue.code,
        "params" in issue ? (issue.params as { rule?: string }).rule : null,
      ]);
};
const paths = (input: unknown) => issues(input).map(([path]) => path);

describe("templateFileSchema", () => {
  test("passes a sound file of each kind", () => {
    expect(issues(file("self_analysis", [question("SA.WHY.1")]))).toEqual([]);
    expect(
      issues(file("validation", [question("V.01.WHO", { hasFau: true })])),
    ).toEqual([]);
    expect(issues(file("business_plan", [question("P.01.1")]))).toEqual([]);
  });

  test("applies the 27 rows of design-spec 6.0.8", () => {
    const at = (extra: Record<string, unknown>) =>
      paths(file("self_analysis", [question("SA.WHY.1", extra)]));
    expect(at({ title: "x".repeat(200) })).toEqual([]);
    expect(at({ title: "x".repeat(201) })).toEqual([
      "sections.0.questions.0.title",
    ]);
    expect(at({ title: "  " })).toEqual(["sections.0.questions.0.title"]);
    expect(at({ prompt: "x".repeat(20000) })).toEqual([]);
    expect(at({ prompt: "x".repeat(20001) })).toEqual([
      "sections.0.questions.0.prompt",
    ]);
    expect(at({ hint: "x".repeat(5001) })).toEqual([
      "sections.0.questions.0.hint",
    ]);
    expect(at({ example: "a\u0000b" })).toEqual([
      "sections.0.questions.0.example",
    ]);
    expect(at({ key: "SA.why.1" })).toEqual(["sections.0.questions.0.key"]);
    expect(
      paths(file("self_analysis", [question("SA.WHY.1")], { name: " " })),
    ).toEqual(["name"]);
  });

  test("checks a display condition's keys and values as texts", () => {
    const at = (displayCondition: unknown) =>
      paths(file("validation", [question("V.02.RED_1", { displayCondition })]));
    expect(at({ "V.02.OCEAN": ["Red", "Mixed"] })).toEqual([]);
    expect(at({ "V.02.OCEAN": ["Red\u0000"] })).toEqual([
      "sections.0.questions.0.displayCondition.V.02.OCEAN.0",
    ]);
    expect(at({ "V.02.OCEAN": ["Red\ud800"] })).toEqual([
      "sections.0.questions.0.displayCondition.V.02.OCEAN.0",
    ]);
    for (const key of ["V.02.\u0000", " ", "SA.WHY.1"])
      expect(
        issues(
          file("validation", [
            question("V.02.RED_1", { displayCondition: { [key]: ["Red"] } }),
          ]),
        ),
      ).toEqual([
        ["sections.0.questions.0.displayCondition", "invalid_format", null],
      ]);
    expect(at({ "V.02.OCEAN": [" "] })).toEqual([
      "sections.0.questions.0.displayCondition.V.02.OCEAN.0",
    ]);
  });

  test("keeps optional texts as typed and turns blank ones into null", () => {
    const parsed = templateFileSchema.parse(
      file("self_analysis", [
        question("SA.WHY.1", { example: "  ", hint: " Keep  this " }),
      ]),
    );
    expect(parsed.sections[0]?.questions[0]).toMatchObject({
      example: null,
      hint: " Keep  this ",
    });
  });

  test("checks the question ID format of the file's kind", () => {
    expect(
      paths(file("validation", [question("V.03.WHO", { hasFau: true })])),
    ).toEqual(["sections.0.questions.0.key"]);
    expect(paths(file("business_plan", [question("P.31.1")]))).toEqual([
      "sections.0.questions.0.key",
    ]);
    expect(issues(file("business_plan", [question("SA.WHY.1")]))[0]).toEqual([
      "sections.0.questions.0.key",
      "invalid_format",
      null,
    ]);
  });

  test("refuses what only another kind holds", () => {
    expect(
      paths(file("validation", [question("V.01.WHO")], { aiPrompt: "Talk" })),
    ).toEqual(["aiPrompt"]);
    // A blank prompt counts as none.
    expect(
      paths(file("business_plan", [question("P.01.1")], { aiPrompt: " \n" })),
    ).toEqual([]);
    expect(
      paths(file("self_analysis", [question("SA.WHY.1", { hasFau: true })])),
    ).toEqual(["sections.0.questions.0.hasFau"]);
    expect(
      paths(
        file("validation", [question("V.01.WHO", { copyFrom: ["V.01.WHO"] })]),
      ),
    ).toEqual(["sections.0.questions.0.copyFrom"]);
    expect(
      paths(
        file("self_analysis", [question("SA.WHY.1")], {
          costDefaults: [{ category: "initial", key: "initial.x", name: "X" }],
        }),
      ),
    ).toEqual(["costDefaults"]);
    expect(
      paths(
        file("validation", [question("V.01.WHO")], {
          executionPresets: [
            { type: "milestone", title: "M", area: null, launchTiming: null },
          ],
        }),
      ),
    ).toEqual(["executionPresets"]);
    expect(
      paths(
        file("business_plan", [question("P.01.1")], { checkRules: thresholds }),
      ),
    ).toEqual(["checkRules"]);
  });

  test("refuses keys the database keeps unique per version", () => {
    const twice = file("self_analysis", [
      question("SA.WHY.1"),
      question("SA.WHY.1"),
    ]);
    expect(issues(twice)).toEqual([
      ["sections.0.questions.1.key", "custom", "unique"],
    ]);
    const sections = file("self_analysis", [question("SA.WHY.1")]);
    sections.sections.push({
      ...(sections.sections[0] as (typeof sections.sections)[number]),
      questions: [question("SA.WHY.2")],
    });
    expect(issues(sections)).toEqual([["sections.1.key", "custom", "unique"]]);
    expect(
      issues(
        file("validation", [question("V.01.WHO")], {
          costDefaults: [
            { category: "initial", key: "initial.permits", name: "Permits" },
            { category: "initial", key: "initial.permits", name: "" },
          ],
          checkRules: [...thresholds, thresholds[0]],
        }),
      ),
    ).toEqual([
      ["costDefaults.1.key", "custom", "unique"],
      ["checkRules.4.checkKey", "custom", "unique"],
    ]);
  });

  test("refuses repeated choices and column keys", () => {
    expect(
      issues(
        file("validation", [
          question("V.02.OCEAN", {
            answerType: "choice",
            options: { kind: "choice", choices: ["Red", "Red"] },
          }),
        ]),
      ),
    ).toEqual([
      ["sections.0.questions.0.options.choices.1", "custom", "unique"],
    ]);
    expect(
      issues(
        file("business_plan", [
          question("P.01.1", {
            answerType: "table",
            options: {
              kind: "table",
              columns: [
                { key: "name", label: "Name", type: "text" },
                { key: "name", label: "Other", type: "money" },
              ],
            },
          }),
        ]),
      ),
    ).toEqual([
      ["sections.0.questions.0.options.columns.1.key", "custom", "unique"],
    ]);
  });

  test("checks the thresholds a validation file gives (design-spec 6.0.8)", () => {
    const withRule = (rule: unknown) =>
      paths(
        file("validation", [question("V.01.WHO")], {
          checkRules: [rule, ...thresholds.slice(1)],
        }),
      );
    expect(withRule({ checkKey: "competitors", params: { min: 1 } })).toEqual(
      [],
    );
    expect(withRule({ checkKey: "competitors", params: { min: 99 } })).toEqual(
      [],
    );
    for (const min of [0, 100, 2.5, "3"])
      expect(withRule({ checkKey: "competitors", params: { min } })).toEqual([
        "checkRules.0.params.min",
      ]);
    expect(
      withRule({ checkKey: "competitors", params: { min: 3, max: 5 } }),
    ).toEqual(["checkRules.0.params"]);
    expect(
      issues(
        file("validation", [question("V.01.WHO")], {
          checkRules: thresholds.slice(1),
        }),
      ),
    ).toEqual([["checkRules", "custom", "required"]]);
    expect(
      paths(
        file("validation", [question("V.01.WHO")], {
          checkRules: [...thresholds, { checkKey: "costs", params: {} }],
        }),
      ),
    ).toEqual([]);
  });

  test("checks each execution preset by its type", () => {
    const withPreset = (preset: unknown) =>
      paths(
        file("business_plan", [question("P.01.1")], {
          executionPresets: [preset],
        }),
      );
    expect(
      withPreset({
        type: "kpi",
        title: "Revenue",
        area: "Financial",
        launchTiming: null,
      }),
    ).toEqual([]);
    expect(
      withPreset({
        type: "launch",
        title: "Day",
        area: null,
        launchTiming: null,
      }),
    ).toEqual(["executionPresets.0.launchTiming"]);
    expect(
      withPreset({
        type: "milestone",
        title: "M",
        area: "Financial",
        launchTiming: null,
      }),
    ).toEqual(["executionPresets.0.area"]);
    expect(
      withPreset({ type: "kpi", title: " ", area: null, launchTiming: null }),
    ).toEqual(["executionPresets.0.title"]);
  });

  test("checks a plan sub-item's copy sources and references (SDD 6.3)", () => {
    const at = (extra: Record<string, unknown>) =>
      paths(file("business_plan", [question("P.01.1", extra)]));
    expect(
      at({
        copyFrom: ["IDEA.ONE_LINE_CONCEPT", "V.01.WHO", "LIST.RISKS"],
        reference: [
          { kind: "validation_answers", section: "01" },
          { kind: "validation_answers", keys: ["V.02.OCEAN"] },
          { kind: "competitors", limit: 5 },
          { kind: "cost_rows", keys: ["initial.permits"] },
          { kind: "research_log", tag: "permits" },
          { kind: "self_analysis", sections: ["WHY"] },
          { kind: "metrics", keys: ["capacity_units_day"] },
          { kind: "totals" },
        ],
      }),
    ).toEqual([]);
    expect(at({ copyFrom: ["IDEA.NAME"] })).toEqual([
      "sections.0.questions.0.copyFrom.0",
    ]);
    for (const spec of [
      // Answers are named by a section or by keys, never both.
      { kind: "validation_answers", section: "01", keys: ["V.01.WHO"] },
      { kind: "validation_answers", section: "03" },
      { kind: "competitors", limit: 0 },
      { kind: "research_log", tag: "costs" },
      { kind: "cost_rows", keys: [] },
      { kind: "plans" },
    ]) {
      const refused = at({ reference: [spec] });
      expect(refused).toHaveLength(1);
      expect(refused[0]).toStartWith("sections.0.questions.0.reference.0");
    }
  });

  test("refuses unknown fields instead of dropping them", () => {
    expect(
      paths(file("self_analysis", [question("SA.WHY.1", { exmple: "typo" })])),
    ).toEqual(["sections.0.questions.0"]);
  });
});
