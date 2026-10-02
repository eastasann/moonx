import { expect, test } from "vitest";
import { safeReturnTo } from "../src/lib/ai-exchange";
import { evaluate } from "../src/lib/ai-review";
import { contextQuestion } from "./support-ai";

test("a returnTo stays a path of the app", () => {
  expect(safeReturnTo("/w/1/ideas")).toBe("/w/1/ideas");
  expect(safeReturnTo("//evil.example")).toBeUndefined();
  expect(safeReturnTo("https://evil.example")).toBeUndefined();
  expect(safeReturnTo("/\\evil.example")).toBeUndefined();
  expect(safeReturnTo("/\t/evil.example")).toBeUndefined();
  expect(safeReturnTo(undefined)).toBeUndefined();
});

test("an imported amount above the largest the API takes is an error, not a change to apply", () => {
  const question = contextQuestion("P.05.1", "Budget", "05", { answerType: "amount_with_reason" });
  const draft = { text: "", amount: "5000000000000", fau: null, include: true };
  expect(evaluate(question, draft).error).toBe("amount");
  expect(evaluate(question, { ...draft, amount: "1000000000000" }).error).toBeNull();
});
