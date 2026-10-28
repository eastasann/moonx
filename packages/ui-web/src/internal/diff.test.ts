import { describe, expect, test, vi } from "vitest";
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

  test("a changed word is marked whole; punctuation at its ends is not part of it (s25-import.html)", () => {
    const parts = diffText(
      "Working professionals aged 25–40 in Bacolod who pay for convenient meals.",
      "Working professionals aged 25–45 in Bacolod who pay for convenient meals, mostly in BPO offices on Lacson St.",
    );
    expect(parts.filter((part) => part.kind !== "equal")).toEqual([
      { kind: "delete", text: "25–40" },
      { kind: "insert", text: "25–45" },
      { kind: "insert", text: ", mostly in BPO offices on Lacson St" },
    ]);
  });

  test("punctuation inside a word stays with it; at its ends it is a word of its own", () => {
    expect(words("aged 25–40 (L9) meals. ₱150 14.4+ ... です。")).toEqual([
      "aged",
      " ",
      "25–40",
      " ",
      "(",
      "L9",
      ")",
      " ",
      "meals",
      ".",
      " ",
      "₱150",
      " ",
      "14.4+",
      " ",
      "...",
      " ",
      "です。",
    ]);
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

  test("words: spaces apart, punctuation at a word's ends apart, Japanese by its words", () => {
    expect(words("aged (25–40) in Bacolod.")).toEqual([
      "aged",
      " ",
      "(",
      "25–40",
      ")",
      " ",
      "in",
      " ",
      "Bacolod",
      ".",
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
    expect(words(long)).toEqual([long.slice(0, -1), ","]);
    expect(performance.now() - started).toBeLessThan(200);
    // Punctuation at a word's end is split off in time linear in its length too.
    const trailing = `a${",".repeat(160_000)}`;
    const startedTrailing = performance.now();
    expect(words(trailing)).toEqual(["a", ",".repeat(160_000)]);
    expect(performance.now() - startedTrailing).toBeLessThan(200);
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

  test("a rewritten phrase is marked whole across the punctuation both sides share", () => {
    expect(diffText("Rice, eggs.", "Fish, milk, bread.")).toEqual([
      { kind: "delete", text: "Rice, eggs" },
      { kind: "insert", text: "Fish, milk, bread" },
      { kind: "equal", text: "." },
    ]);
    // Between two insertions the shared comma is the old text's, so it stays unmarked.
    expect(diffText("a, b", "x a, b y")).toEqual([
      { kind: "insert", text: "x " },
      { kind: "equal", text: "a, b" },
      { kind: "insert", text: " y" },
    ]);
  });

  test("a rewrite keeps the space both sides share before it unmarked", () => {
    expect(diffText("We sell rice — and fish", "We sell — fresh fish")).toEqual(
      [
        { kind: "equal", text: "We sell " },
        { kind: "delete", text: "rice — and" },
        { kind: "insert", text: "— fresh" },
        { kind: "equal", text: " fish" },
      ],
    );
  });

  test("punctuation between changes that only insert stays unmarked; punctuation before the first change stays", () => {
    expect(diffText("Rice: eggs", "Rice, fish: bread, eggs")).toEqual([
      { kind: "equal", text: "Rice" },
      { kind: "insert", text: ", fish" },
      { kind: "equal", text: ":" },
      { kind: "insert", text: " bread," },
      { kind: "equal", text: " eggs" },
    ]);
    expect(diffText("(rice, eggs)", "(fish, milk)")).toEqual([
      { kind: "equal", text: "(" },
      { kind: "delete", text: "rice, eggs" },
      { kind: "insert", text: "fish, milk" },
      { kind: "equal", text: ")" },
    ]);
  });

  test("punctuation with its marks joins a rewrite like other punctuation; Korean words keep their spaces", () => {
    expect(diffText("Wow‼️ great", "Yay‼️ fine")).toEqual([
      { kind: "delete", text: "Wow‼️ great" },
      { kind: "insert", text: "Yay‼️ fine" },
    ]);
    expect(words("ok‼\u200D")).toEqual(["ok", "‼\u200D"]);
    expect(diffText("회사원.", "회사원,")).toEqual([
      { kind: "equal", text: "회사원" },
      { kind: "delete", text: "." },
      { kind: "insert", text: "," },
    ]);
  });

  test("on random texts with punctuation each side is rebuilt and no shared punctuation cuts a rewrite", () => {
    const alphabet = ["a", "b", "c", " ", ",", ".", "(", ")"];
    const isPunctuation = (part: DiffPart | undefined) =>
      part?.kind === "equal" && /^[\p{P}\s]+$/u.test(part.text);
    for (let seed = 1; seed <= 30; seed++) {
      const next = random(seed);
      const text = () =>
        Array.from(
          { length: Math.floor(next() * 16) },
          () => alphabet[Math.floor(next() * alphabet.length)],
        ).join("");
      for (let round = 0; round < 300; round++) {
        const before = text();
        const after = text();
        const parts = diffText(before, after);
        expect(side(parts, "delete")).toBe(before);
        expect(side(parts, "insert")).toBe(after);
        expectChangesWhole(parts);
        // A chain of changes joined by shared punctuation that both deletes and inserts
        // is one change: no punctuation-only equal part is left inside it.
        parts.forEach((part, index) => {
          const changed = (other: DiffPart | undefined) =>
            other !== undefined &&
            other.kind !== "equal" &&
            /\S/u.test(other.text);
          if (
            !isPunctuation(part) ||
            !changed(parts[index - 1]) ||
            !changed(parts[index + 1])
          ) {
            return;
          }
          let first = index;
          while (changed(parts[first - 1]) || isPunctuation(parts[first - 1]))
            first--;
          let last = index;
          while (changed(parts[last + 1]) || isPunctuation(parts[last + 1]))
            last++;
          const chain = parts.slice(first, last + 1);
          const rewrites =
            chain.some(
              (other) => other.kind === "delete" && /\S/u.test(other.text),
            ) &&
            chain.some(
              (other) => other.kind === "insert" && /\S/u.test(other.text),
            );
          expect({ seed, round, before, after, rewrites }).toEqual({
            seed,
            round,
            before,
            after,
            rewrites: false,
          });
        });
      }
    }
  });

  test("punctuation goes with the marks after it; a symbol of punctuation and marks stays whole", () => {
    expect(words("#️⃣ ok ‼️wow Great‼️")).toEqual([
      "#️⃣",
      " ",
      "ok",
      " ",
      "‼️",
      "wow",
      " ",
      "Great",
      "‼️",
    ]);
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

  test("each task's round starts where the last one's budget stopped: a short diff is not starved by long ones on a slow device", async () => {
    // Every reading of the clock takes 1 ms: a budget reaches a few diffs per task.
    let now = 0;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => {
      now += 1;
      return now;
    });
    try {
      const next = random(11);
      const text = (length: number) =>
        Array.from({ length }, () => "ijklmnop "[Math.floor(next() * 9)]).join(
          "",
        );
      const finished: string[] = [];
      const wait = (name: string, before: string, after: string) =>
        new Promise<void>((resolve) => {
          waitForDiff(before, after, () => {
            finished.push(name);
            resolve();
          });
        });
      const long = Array.from({ length: 12 }, (_, index) =>
        wait(`long ${index}`, text(3000), text(3000)),
      );
      const small = wait("small", "Night market", "Night stall");
      await Promise.all([...long, small]);
      expect(finished).toHaveLength(13);
      expect(finished.indexOf("small")).toBeLessThan(12);
    } finally {
      clock.mockRestore();
    }
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
