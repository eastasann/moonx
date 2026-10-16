import { describe, expect, test } from "vitest";
import { type DiffPart, diffNow, diffText, waitForDiff } from "./diff";

const side = (parts: DiffPart[], kind: "delete" | "insert") =>
  parts
    .filter((part) => part.kind === "equal" || part.kind === kind)
    .map((part) => part.text)
    .join("");

/** The length of the longest common subsequence, by the table: the minimal diff's measure. */
function lcs(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j] ?? 0;
      row[j] = x === b[j - 1] ? diagonal + 1 : Math.max(above, row[j - 1] ?? 0);
      diagonal = above;
    }
  }
  return row[b.length] ?? 0;
}

/** A small deterministic generator (mulberry32), so a failing case can be found again. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("diffText", () => {
  test("the same text is one equal run; one side empty is all inserted or deleted", () => {
    expect(diffText("abc", "abc")).toEqual([{ kind: "equal", text: "abc" }]);
    expect(diffText("", "abc")).toEqual([{ kind: "insert", text: "abc" }]);
    expect(diffText("abc", "")).toEqual([{ kind: "delete", text: "abc" }]);
    expect(diffText("", "")).toEqual([]);
  });

  test("a word changed in the middle", () => {
    expect(diffText("Office workers buy", "Office staff buy")).toEqual(
      expect.arrayContaining([
        { kind: "equal", text: "Office " },
        { kind: "equal", text: " buy" },
      ]),
    );
  });

  test("an emoji or a CJK character is one character", () => {
    const parts = diffText("田中👍🏽", "田村👍🏽");
    expect(parts).toEqual([
      { kind: "equal", text: "田" },
      { kind: "delete", text: "中" },
      { kind: "insert", text: "村" },
      { kind: "equal", text: "👍🏽" },
    ]);
  });

  test("on random texts each side is rebuilt and the diff is minimal", () => {
    const next = random(7);
    const alphabet = ["a", "b", "c", " "];
    const text = () =>
      Array.from(
        { length: Math.floor(next() * 14) },
        () => alphabet[Math.floor(next() * alphabet.length)],
      ).join("");
    for (let round = 0; round < 400; round++) {
      const before = text();
      const after = text();
      const parts = diffText(before, after);
      expect(side(parts, "delete")).toBe(before);
      expect(side(parts, "insert")).toBe(after);
      const changed = parts
        .filter((part) => part.kind !== "equal")
        .reduce((sum, part) => sum + [...part.text].length, 0);
      expect(changed).toBe(
        before.length + after.length - 2 * lcs([...before], [...after]),
      );
    }
  });

  test("long work is carried on a task at a time, shared by its waiters, and exact", async () => {
    const next = random(5);
    const text = (length: number) =>
      Array.from({ length }, () => "abcdefgh "[Math.floor(next() * 9)]).join(
        "",
      );
    const before = text(3000);
    const after = text(3000);
    expect(diffNow(before, after)).toBeNull();
    const handed: DiffPart[][] = [];
    const parts = await new Promise<DiffPart[]>((resolve) => {
      waitForDiff(before, after, (done) => handed.push(done));
      waitForDiff(before, after, (done) => {
        handed.push(done);
        resolve(done);
      });
    });
    // Both waiters get the one diff, worked out once.
    expect(handed).toHaveLength(2);
    expect(handed[0]).toBe(handed[1]);
    expect(side(parts, "delete")).toBe(before);
    expect(side(parts, "insert")).toBe(after);
    const changed = parts
      .filter((part) => part.kind !== "equal")
      .reduce((sum, part) => sum + [...part.text].length, 0);
    expect(changed).toBe(
      before.length + after.length - 2 * lcs([...before], [...after]),
    );
  });

  test("many long diffs at once all finish, and a few changes are not held behind them", async () => {
    const next = random(9);
    const text = (length: number) =>
      Array.from({ length }, () => "abcdefgh "[Math.floor(next() * 9)]).join(
        "",
      );
    const finished: string[] = [];
    const wait = (name: string, before: string, after: string) =>
      new Promise<void>((resolve) => {
        if (diffNow(before, after) !== null) {
          finished.push(name);
          resolve();
        } else {
          waitForDiff(before, after, () => {
            finished.push(name);
            resolve();
          });
        }
      });
    const long = Array.from({ length: 40 }, (_, index) =>
      wait(`long ${index}`, text(1500), text(1500)),
    );
    const small = wait("small", "Office workers", "Office staff");
    await Promise.all([...long, small]);
    expect(finished).toHaveLength(41);
    // A step of each in turn: the small one is not the last.
    expect(finished.indexOf("small")).toBeLessThan(40);
  });

  test("the same pair again (DiffText's other side) is not worked out twice", () => {
    const parts = diffText("Office workers", "Office staff");
    expect(diffText("Office workers", "Office staff")).toBe(parts);
  });

  test("a long text changed in a few places stays quick and exact", () => {
    const before = "pasalubong ".repeat(400);
    const after = `${before.slice(0, 1000)}X${before.slice(1001, 3000)}YZ${before.slice(3000)}`;
    const parts = diffText(before, after);
    expect(side(parts, "delete")).toBe(before);
    expect(side(parts, "insert")).toBe(after);
    expect(parts.filter((part) => part.kind !== "equal")).toEqual([
      { kind: "delete", text: before[1000] },
      { kind: "insert", text: "X" },
      { kind: "insert", text: "YZ" },
    ]);
  });
});
