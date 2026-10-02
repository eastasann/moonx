import { expect, test } from "vitest";
import {
  isAnswered,
  isQuestionVisible,
  sectionPath,
  withChoice,
  withText,
} from "../src/lib/questions";
import { emptyClassification } from "./question-fixtures";

test("sections open their own screens", () => {
  expect(sectionPath("01")).toBe("/questions/01");
  expect(["03", "04", "05", "06-08", "09"].map(sectionPath)).toEqual([
    "/research",
    "/competitors",
    "/costs",
    "/economics",
    "/assumptions",
  ]);
});

test("a question with a display condition follows the current answers, one without follows the server", () => {
  const red = { displayCondition: { "V.02.OCEAN": ["Red", "Mixed"] } };
  const answers: Record<string, string | null> = { "V.02.OCEAN": null };
  const visible = (hidden = false) => isQuestionVisible(red, hidden, (key) => answers[key] ?? null);
  expect(visible()).toBe(false);
  answers["V.02.OCEAN"] = "Red";
  expect(visible(true)).toBe(true);
  answers["V.02.OCEAN"] = "Blue";
  expect(visible()).toBe(false);
  expect(isQuestionVisible({ displayCondition: null }, true, () => null)).toBe(false);
  expect(isQuestionVisible({ displayCondition: null }, false, () => null)).toBe(true);
});

test("an answer counts with a text or with Unknown", () => {
  const unknown = { ...emptyClassification(), fau: "unknown" as const, state: "unknown" as const };
  expect(isAnswered("text", emptyClassification())).toBe(true);
  expect(isAnswered("  ", emptyClassification())).toBe(false);
  expect(isAnswered(null, unknown)).toBe(true);
});

test("clearing the text clears Fact and Assumption but keeps Unknown", () => {
  const assumption = withChoice(emptyClassification(), true, "assumption", "high");
  expect(assumption.state).toBe("assumption");
  expect(withText(assumption, "")).toMatchObject({ fau: null, confidence: null, state: "empty" });
  const unknown = withChoice(emptyClassification(), false, "unknown", null);
  expect(withText(unknown, "")).toMatchObject({ fau: "unknown", state: "unknown" });
  expect(withText(emptyClassification(), "x")).toMatchObject({ state: "unclassified" });
});

test("an Assumption keeps its confidence, any other choice drops it", () => {
  const assumption = withChoice(emptyClassification(), true, "assumption", "low");
  expect(assumption.confidence).toBe("low");
  expect(withChoice(assumption, true, "unknown", "low").confidence).toBeNull();
  expect(withChoice(assumption, true, null, null)).toMatchObject({
    fau: null,
    state: "unclassified",
  });
});
