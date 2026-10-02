import { expect, test } from "vitest";
import { diffText } from "../src/lib/text-diff";

const side = (segments: ReturnType<typeof diffText>, drop: "added" | "removed") =>
  segments
    .filter((s) => s.kind !== drop)
    .map((s) => s.text)
    .join("");

test("equal texts are one unchanged run", () => {
  expect(diffText("same", "same")).toEqual([{ kind: "same", text: "same" }]);
  expect(diffText("", "")).toEqual([]);
});

test("marks the changed characters only", () => {
  expect(diffText("Sell cakes daily", "Sell cake boxes daily")).toEqual([
    { kind: "same", text: "Sell cake" },
    { kind: "added", text: " boxe" },
    { kind: "same", text: "s daily" },
  ]);
});

test("an insertion into empty text and a deletion to empty text", () => {
  expect(diffText("", "new")).toEqual([{ kind: "added", text: "new" }]);
  expect(diffText("old", "")).toEqual([{ kind: "removed", text: "old" }]);
});

test("rebuilds both texts from the segments", () => {
  const pairs: [string, string][] = [
    ["kitten", "sitting"],
    ["abc", "xyz"],
    ["ミニマム", "ミニマル版"],
    ["a😀b", "a😃b"],
  ];
  for (const [before, after] of pairs) {
    const segments = diffText(before, after);
    expect(side(segments, "added")).toBe(before);
    expect(side(segments, "removed")).toBe(after);
  }
});

test("a very large change falls back to one removal and one addition", () => {
  const before = "a".repeat(3000);
  const after = "b".repeat(3000);
  expect(diffText(before, after)).toEqual([
    { kind: "removed", text: before },
    { kind: "added", text: after },
  ]);
});
