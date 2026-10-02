import { expect, test } from "vitest";
import { readNumberText, readPercentText } from "../src/lib/number-input";

test("commas, a currency symbol and a minus are read; digits typed so far stay partial", () => {
  expect(readNumberText("₱1,234.5")).toEqual({ kind: "value", value: 1234.5 });
  expect(readNumberText("")).toEqual({ kind: "empty" });
  expect(readNumberText("-")).toEqual({ kind: "partial" });
});

test("a number in scientific notation is not turned into other digits", () => {
  expect(readNumberText("1e5")).toEqual({ kind: "partial" });
});

test("a percent reads as the fraction typed, exactly", () => {
  expect(readPercentText("33.3%")).toEqual({ kind: "value", value: 0.333 });
  expect(readPercentText("35")).toEqual({ kind: "value", value: 0.35 });
  expect(readPercentText("0.0000001")).toEqual({ kind: "value", value: 1e-9 });
});
