import { describe, expect, test } from "bun:test";
import type { TemplateQuestion, TemplateSection } from "@moonx/schemas";
import {
  isSelfAnalysisAnswered,
  type SelfAnalysisAnswerInput,
  selfAnalysisProgress,
} from "./self-analysis";

const question = (
  key: string,
  answerType: TemplateQuestion["answerType"] = "long_text",
  displayCondition: TemplateQuestion["displayCondition"] = null,
): TemplateQuestion => ({
  key,
  sectionKey: key.split(".")[1] as string,
  title: key,
  prompt: `${key}?`,
  example: null,
  hint: null,
  answerType,
  options:
    answerType === "choice" ? { kind: "choice", choices: ["Yes", "No"] } : null,
  displayCondition,
  hasFau: false,
});

const section = (key: string, questions: TemplateQuestion[]) =>
  ({
    key,
    part: null,
    title: `${key} title`,
    subtitle: null,
    guidance: null,
    questions,
  }) satisfies TemplateSection;

const answers = (entries: Record<string, Partial<SelfAnalysisAnswerInput>>) =>
  new Map(
    Object.entries(entries).map(([key, answer]) => [
      key,
      { text: answer.text ?? null, amount: answer.amount ?? null },
    ]),
  );

const SECTIONS = [
  section("WHY", [question("SA.WHY.1"), question("SA.WHY.2")]),
  section("INCOME", [
    question("SA.INCOME.1", "amount_with_reason"),
    question("SA.INCOME.2", "amount_with_reason"),
  ]),
];

describe("isSelfAnalysisAnswered", () => {
  test("a text that is not blank, or an amount", () => {
    expect(isSelfAnalysisAnswered(undefined)).toBe(false);
    expect(isSelfAnalysisAnswered({ text: " \n", amount: null })).toBe(false);
    expect(isSelfAnalysisAnswered({ text: "To stay", amount: null })).toBe(
      true,
    );
    expect(isSelfAnalysisAnswered({ text: null, amount: 0 })).toBe(true);
  });
});

describe("selfAnalysisProgress (SDD 5.8, design-spec 6.11)", () => {
  test("nothing answered: every question counts, the first one is next", () => {
    expect(selfAnalysisProgress(SECTIONS, new Map())).toEqual({
      answered: 0,
      total: 4,
      sections: [
        { key: "WHY", title: "WHY title", answered: 0, total: 2 },
        { key: "INCOME", title: "INCOME title", answered: 0, total: 2 },
      ],
      firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.1" },
    });
  });

  test("counts by section and finds the first gap in template order", () => {
    const progress = selfAnalysisProgress(
      SECTIONS,
      answers({
        "SA.WHY.1": { text: "Family" },
        "SA.WHY.2": { text: "Home" },
        "SA.INCOME.2": { amount: 50000 },
      }),
    );
    expect(progress.answered).toBe(3);
    expect(progress.sections.map((row) => row.answered)).toEqual([2, 1]);
    expect(progress.firstUnanswered).toEqual({
      sectionKey: "INCOME",
      questionKey: "SA.INCOME.1",
    });
  });

  test("all answered: no next question", () => {
    const progress = selfAnalysisProgress(
      SECTIONS,
      answers({
        "SA.WHY.1": { text: "a" },
        "SA.WHY.2": { text: "b" },
        "SA.INCOME.1": { text: "Rent" },
        "SA.INCOME.2": { amount: 1 },
      }),
    );
    expect(progress).toMatchObject({
      answered: 4,
      total: 4,
      firstUnanswered: null,
    });
  });

  test("leaves out answers to questions the pinned version lacks", () => {
    const progress = selfAnalysisProgress(
      SECTIONS,
      answers({ "SA.OLD.1": { text: "Kept from an older version" } }),
    );
    expect(progress).toMatchObject({ answered: 0, total: 4 });
  });

  test("a question its display condition hides counts nowhere", () => {
    const sections = [
      section("NOW", [
        question("SA.NOW.1", "choice"),
        question("SA.NOW.2", "long_text", { "SA.NOW.1": ["Yes"] }),
      ]),
    ];
    const hidden = selfAnalysisProgress(
      sections,
      answers({ "SA.NOW.1": { text: "No" }, "SA.NOW.2": { text: "Kept" } }),
    );
    expect(hidden).toMatchObject({
      answered: 1,
      total: 1,
      firstUnanswered: null,
    });
    const shown = selfAnalysisProgress(
      sections,
      answers({ "SA.NOW.1": { text: "Yes" } }),
    );
    expect(shown).toMatchObject({
      answered: 1,
      total: 2,
      firstUnanswered: { sectionKey: "NOW", questionKey: "SA.NOW.2" },
    });
  });
});
