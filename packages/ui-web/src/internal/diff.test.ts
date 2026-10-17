import { describe, expect, test } from "vitest";
import { type DiffPart, diffNow, diffText, waitForDiff, words } from "./diff";

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

/** The words (not the spaces) the diff marks as changed. */
const changedWords = (parts: DiffPart[]) =>
  parts
    .filter((part) => part.kind !== "equal")
    .reduce((sum, part) => sum + wordsOnly(part.text).length, 0);

const wordsOnly = (text: string) =>
  words(text).filter((word) => !/^\s/u.test(word));

/** The fewest words a diff of the two texts can mark. */
const minimal = (before: string, after: string) => {
  const a = wordsOnly(before);
  const b = wordsOnly(after);
  return a.length + b.length - 2 * lcs(a, b);
};

/**
 * Each change is one deletion, then one insertion, never two equal parts in a row, and a
 * change does not begin with a space both sides share.
 */
function expectChangesWhole(parts: DiffPart[]) {
  parts.forEach((part, index) => {
    const next = parts[index + 1];
    if (part.kind === "equal") expect(next?.kind).not.toBe("equal");
    if (part.kind === "insert") expect(next?.kind ?? "equal").toBe("equal");
    if (part.kind === "delete") {
      expect(next?.kind ?? "equal").not.toBe("delete");
      if (next?.kind === "insert") {
        expect(/^\s/u.test(part.text) && part.text[0] === next.text[0]).toBe(
          false,
        );
      }
    }
  });
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

  test("a changed word is marked whole, with its punctuation (s25-import.html)", () => {
    const parts = diffText(
      "Working professionals aged 25–40 in Bacolod who pay for convenient meals.",
      "Working professionals aged 25–45 in Bacolod who pay for convenient meals, mostly in BPO offices on Lacson St.",
    );
    const changed = parts.filter((part) => part.kind !== "equal");
    expect(changed).toEqual(
      expect.arrayContaining([
        { kind: "delete", text: "25–40" },
        { kind: "insert", text: "25–45" },
        { kind: "delete", text: "meals." },
        { kind: "insert", text: "meals, mostly in BPO offices on Lacson St." },
      ]),
    );
    expect(changed).toHaveLength(4);
  });

  test("a space never stands in for a word the two sides share; a changed space is marked", () => {
    expect(diffText("foo bar", "foo\n\nbar baz")).toEqual([
      { kind: "equal", text: "foo" },
      { kind: "delete", text: " " },
      { kind: "insert", text: "\n\n" },
      { kind: "equal", text: "bar" },
      { kind: "insert", text: " baz" },
    ]);
  });

  test("words: spaces apart, punctuation kept with its word, Japanese by its words", () => {
    expect(words("aged (25–40) in Bacolod.")).toEqual([
      "aged",
      " ",
      "(25–40)",
      " ",
      "in",
      " ",
      "Bacolod.",
    ]);
    const japanese = words("毎日の昼食を作るのは大変です。");
    expect(japanese.join("")).toBe("毎日の昼食を作るのは大変です。");
    expect(japanese.length).toBeGreaterThan(3);
    expect(japanese.at(-1)).toMatch(/[^。]。$/);
    expect(words("Office 👍🏽 staff")).toEqual([
      "Office",
      " ",
      "👍🏽",
      " ",
      "staff",
    ]);
    // A long run of segments without spaces is split in time linear in its length
    // (joined one by one, a quadratic split takes most of a second here).
    const long = "a,".repeat(80_000);
    const started = performance.now();
    expect(words(long)).toEqual([long]);
    expect(performance.now() - started).toBeLessThan(200);
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
      expect(changedWords(parts)).toBe(minimal(before, after));
      expectChangesWhole(parts);
    }
  });

  test("long work is carried on a task at a time, shared by its waiters, and exact", async () => {
    const next = random(5);
    const text = (length: number) =>
      Array.from({ length }, () => "abcdefgh "[Math.floor(next() * 9)]).join(
        "",
      );
    // Long enough in words that the first task's budget does not finish it.
    const before = text(12000);
    const after = text(12000);
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
    expect(changedWords(parts)).toBe(minimal(before, after));
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
      wait(`long ${index}`, text(6000), text(6000)),
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
    const list = Array.from({ length: 400 }, (_, index) => `w${index}`);
    const before = list.join(" ");
    // w90 becomes "X"; "YZ" is a new word before w272.
    const after = list
      .map((word, index) =>
        index === 90 ? "X" : index === 272 ? `YZ ${word}` : word,
      )
      .join(" ");
    const parts = diffText(before, after);
    expect(side(parts, "delete")).toBe(before);
    expect(side(parts, "insert")).toBe(after);
    expect(parts.filter((part) => part.kind !== "equal")).toEqual([
      { kind: "delete", text: "w90" },
      { kind: "insert", text: "X" },
      { kind: "insert", text: expect.stringMatching(/^ ?YZ ?$/) },
    ]);
  });
});
