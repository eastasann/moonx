import { LOCALE } from "@moonx/i18n";

/** A run of text the two sides share, or that only one side has. */
export interface DiffPart {
  kind: "equal" | "delete" | "insert";
  text: string;
}

const segmenter = new Intl.Segmenter(LOCALE, { granularity: "word" });

const space = /\s/u;
/**
 * Scripts written without spaces between words: their words are the segmenter's. Korean
 * is written with spaces, so it is not one of them.
 */
const unspaced =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}]/u;

const punctuation = /\p{P}/u;
/** Marks and joiners, which belong to the character before them ("‼️", "#️⃣"). */
const attached = /[\p{M}\u200D]/u;

/**
 * A word with the punctuation at its ends split off ("meals." is "meals" and "."), so a
 * word whose punctuation alone changed stays unmarked (s25-import.html). A punctuation
 * character goes with the marks after it ("‼️"); punctuation inside the word stays
 * ("25–40"), as does a run that is all punctuation ("#️⃣"), and words in scripts written
 * without spaces keep the punctuation after them. Scanned from each end rather than by one
 * pattern, which would backtrack across a long run of punctuation.
 */
function splitEdges(token: string): string[] {
  if (space.test(token[0] ?? " ") || unspaced.test(token)) return [token];
  let start = 0;
  while (start < token.length && punctuation.test(token[start] ?? "")) {
    start++;
    while (start < token.length && attached.test(token[start] ?? "")) start++;
  }
  let end = token.length;
  while (end > start) {
    let mark = end;
    while (mark > start && attached.test(token[mark - 1] ?? "")) mark--;
    if (mark > start && punctuation.test(token[mark - 1] ?? "")) end = mark - 1;
    else break;
  }
  if (start === end) return [token];
  return [
    token.slice(0, start),
    token.slice(start, end),
    token.slice(end),
  ].filter((part) => part !== "");
}

/**
 * The words of `text` as the diff compares them (design-spec 4.5 DiffText): each run of
 * letters and figures with the punctuation inside it ("25–40"), the punctuation at its
 * ends as words of their own ("meals" and "."; "(", "L9" and ")"), each run of spaces,
 * and in scripts written without spaces (Japanese) each word the segmenter finds, with
 * the punctuation after it ("です。"). Joined again, they are the text.
 */
export function words(text: string): string[] {
  const out: string[] = [];
  // What the token being built is, kept as it grows: reading its text back would copy
  // the whole of it for each segment joined, which is slow on a long run.
  let isSpace = true;
  let isUnspaced = false;
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    const segmentIsSpace = space.test(segment[0] ?? " ");
    const segmentIsUnspaced = unspaced.test(segment);
    const last = out.length - 1;
    const joins =
      last >= 0 &&
      !isSpace &&
      !segmentIsSpace &&
      (!isWordLike || !(segmentIsUnspaced || isUnspaced));
    if (joins) {
      out[last] += segment;
      isUnspaced ||= segmentIsUnspaced;
    } else {
      out.push(segment);
      isSpace = segmentIsSpace;
      isUnspaced = segmentIsUnspaced;
    }
  }
  return out.flatMap(splitEdges);
}

/**
 * A text as the diff compares it: its words, and the spaces before each word and at the
 * end (`gaps[i]` comes before `words[i]`; the last gap ends the text).
 */
interface Side {
  words: string[];
  gaps: string[];
}

function sideOf(text: string): Side {
  const side: Side = { words: [], gaps: [""] };
  for (const token of words(text)) {
    if (space.test(token[0] ?? "")) {
      side.gaps[side.gaps.length - 1] += token;
    } else {
      side.words.push(token);
      side.gaps.push("");
    }
  }
  return side;
}

type Run = { kind: DiffPart["kind"]; words: string[] };

/** The diff's work, in steps it can be paused between. */
type Work = Generator<void, void, void>;

/**
 * Work (diagonals tried and words compared) between two pauses: about a millisecond,
 * so a step never takes much of a frame, however long the texts.
 */
const WORK_PER_STEP = 100_000;

/** The work a job has done since its last pause. */
interface Pace {
  work: number;
}

/**
 * The middle snake of `a` and `b` (Myers 1986, "An O(ND) difference algorithm", 4b):
 * searching from both ends at once keeps the memory linear in the length, where the
 * one-way search keeps every round and needs the square of the edit distance. The time is
 * the length times the edit distance, in words: a few changes in a long answer take
 * milliseconds; a long answer rewritten whole (20,000 characters, design-spec 6.0.8) takes
 * far longer, so the work pauses every millisecond or so and is carried on a frame at a
 * time.
 */
function* bisect(a: string[], b: string[], out: Run[], pace: Pace): Work {
  const n = a.length;
  const m = b.length;
  const maxD = Math.ceil((n + m) / 2);
  const offset = maxD + 1;
  const size = 2 * maxD + 3;
  const v1 = new Array<number>(size).fill(-1);
  const v2 = new Array<number>(size).fill(-1);
  v1[offset + 1] = 0;
  v2[offset + 1] = 0;
  const delta = n - m;
  // With an odd delta the forward path meets the reverse one; with an even one, the reverse.
  const front = delta % 2 !== 0;
  let k1start = 0;
  let k1end = 0;
  let k2start = 0;
  let k2end = 0;
  const at = (v: number[], index: number) => v[index] ?? -1;
  for (let d = 0; d < maxD; d++) {
    for (let k1 = -d + k1start; k1 <= d - k1end; k1 += 2) {
      if (++pace.work >= WORK_PER_STEP) {
        pace.work = 0;
        yield;
      }
      const i1 = offset + k1;
      let x1 =
        k1 === -d || (k1 !== d && at(v1, i1 - 1) < at(v1, i1 + 1))
          ? at(v1, i1 + 1)
          : at(v1, i1 - 1) + 1;
      let y1 = x1 - k1;
      while (x1 < n && y1 < m && a[x1] === b[y1]) {
        x1++;
        y1++;
        pace.work++;
      }
      v1[i1] = x1;
      if (x1 > n) k1end += 2;
      else if (y1 > m) k1start += 2;
      else if (front) {
        const i2 = offset + delta - k1;
        if (i2 >= 0 && i2 < size && at(v2, i2) !== -1) {
          if (x1 >= n - at(v2, i2))
            return yield* split(a, b, x1, y1, out, pace);
        }
      }
    }
    for (let k2 = -d + k2start; k2 <= d - k2end; k2 += 2) {
      if (++pace.work >= WORK_PER_STEP) {
        pace.work = 0;
        yield;
      }
      const i2 = offset + k2;
      let x2 =
        k2 === -d || (k2 !== d && at(v2, i2 - 1) < at(v2, i2 + 1))
          ? at(v2, i2 + 1)
          : at(v2, i2 - 1) + 1;
      let y2 = x2 - k2;
      while (x2 < n && y2 < m && a[n - x2 - 1] === b[m - y2 - 1]) {
        x2++;
        y2++;
        pace.work++;
      }
      v2[i2] = x2;
      if (x2 > n) k2end += 2;
      else if (y2 > m) k2start += 2;
      else if (!front) {
        const i1 = offset + delta - k2;
        if (i1 >= 0 && i1 < size && at(v1, i1) !== -1) {
          const x1 = at(v1, i1);
          const y1 = x1 - (i1 - offset);
          if (x1 >= n - x2) return yield* split(a, b, x1, y1, out, pace);
        }
      }
    }
  }
  // No common word at all.
  out.push({ kind: "delete", words: a }, { kind: "insert", words: b });
}

function* split(
  a: string[],
  b: string[],
  x: number,
  y: number,
  out: Run[],
  pace: Pace,
): Work {
  yield* diffRuns(a.slice(0, x), b.slice(0, y), out, pace);
  yield* diffRuns(a.slice(x), b.slice(y), out, pace);
}

function* diffRuns(a: string[], b: string[], out: Run[], pace: Pace): Work {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  if (prefix > 0) out.push({ kind: "equal", words: a.slice(0, prefix) });
  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);
  if (middleA.length === 0) {
    if (middleB.length > 0) out.push({ kind: "insert", words: middleB });
  } else if (middleB.length === 0) {
    out.push({ kind: "delete", words: middleA });
  } else {
    yield* bisect(middleA, middleB, out, pace);
  }
  if (suffix > 0)
    out.push({ kind: "equal", words: a.slice(a.length - suffix) });
}

/** The last few diffs: DiffText's two sides of one change ask for the same one. */
const recent = new Map<string, DiffPart[]>();
const RECENT_SIZE = 32;

/** A diff being worked out, and the DiffTexts waiting for it. */
interface Job {
  work: Work;
  runs: Run[];
  /** The two texts split, once the work has done it. */
  sides: { before?: Side; after?: Side };
  waiting: Set<(parts: DiffPart[]) => void>;
}

/**
 * Diffs being worked out, in the order `tick` steps them next: a stepped job goes to the
 * back, so each waited diff gets a step in turn and a short one asked for later is not
 * held behind long ones.
 */
const running = new Map<string, Job>();

/**
 * The work done on diffs per task: half of a 60 Hz frame, shared by every DiffText, so
 * the page keeps answering while long rewrites are worked out.
 */
const BUDGET_MS = 8;

/** Time spent this task on diffs asked for while rendering. */
let spentThisTask = 0;
let resetPending = false;

const keyOf = (before: string, after: string) =>
  `${before.length}:${before}${after}`;

/** A word that is only punctuation, with the marks that belong to it. */
const punctuationWord = /^\p{P}[\p{P}\p{M}\u200D]*$/u;

/**
 * The runs with each rewrite marked whole: a run of changes, with the punctuation both
 * sides share between them ("Rice, eggs" to "Fish, milk, bread" share ","), becomes one
 * change when it both deletes and inserts, so a shared comma does not cut the rewritten
 * phrase's mark in two (design-spec 4.5). Punctuation between changes that only insert
 * (or only delete) stays unmarked, as the other side has it unchanged. Done on the words,
 * before the spaces are put back, so the space both sides share before a change still
 * stays unmarked.
 */
function joinRewrites(runs: Run[]): Run[] {
  const out: Run[] = [];
  let chain: Run[] = [];
  let deletes = false;
  let inserts = false;
  const close = () => {
    // Punctuation after the chain's last change is not between changes.
    let last = chain.length;
    while (last > 0 && chain[last - 1]?.kind === "equal") last--;
    chain.forEach((run, index) => {
      if (run.kind === "equal" && index < last && deletes && inserts) {
        out.push({ kind: "delete", words: run.words });
        out.push({ kind: "insert", words: run.words });
      } else {
        out.push(run);
      }
    });
    chain = [];
    deletes = false;
    inserts = false;
  };
  for (const run of runs) {
    if (run.kind === "delete") deletes = true;
    if (run.kind === "insert") inserts = true;
    if (run.kind !== "equal") {
      chain.push(run);
    } else if (
      chain.length > 0 &&
      run.words.every((word) => punctuationWord.test(word))
    ) {
      chain.push(run);
    } else {
      close();
      out.push(run);
    }
  }
  close();
  return out;
}

/**
 * The parts of a diff of words, with each side's spaces put back: an equal word keeps
 * the space before it as equal where both sides have the same, a changed word takes its
 * own. A change is one deletion and then one insertion, so a rewritten phrase is marked
 * whole ("Rice, eggs" to "Fish, milk, bread", with `joinRewrites`), and the space the
 * two sides share before it stays unmarked.
 */
function assemble(runs: Run[], before: Side, after: Side): DiffPart[] {
  const parts: DiffPart[] = [];
  let deleted = "";
  let inserted = "";
  const equal = (text: string) => {
    if (text === "") return;
    const last = parts[parts.length - 1];
    if (last?.kind === "equal") last.text += text;
    else parts.push({ kind: "equal", text });
  };
  const flush = () => {
    if (deleted !== "" && inserted !== "") {
      const shared = /^\s*/u.exec(deleted)?.[0] ?? "";
      let length = 0;
      while (length < shared.length && shared[length] === inserted[length]) {
        length++;
      }
      equal(deleted.slice(0, length));
      deleted = deleted.slice(length);
      inserted = inserted.slice(length);
    }
    if (deleted !== "") parts.push({ kind: "delete", text: deleted });
    if (inserted !== "") parts.push({ kind: "insert", text: inserted });
    deleted = "";
    inserted = "";
  };
  const gaps = (gapBefore: string, gapAfter: string) => {
    if (gapBefore === gapAfter) {
      flush();
      equal(gapBefore);
    } else {
      deleted += gapBefore;
      inserted += gapAfter;
    }
  };
  let i = 0;
  let j = 0;
  for (const run of joinRewrites(runs)) {
    for (const word of run.words) {
      if (run.kind === "equal") {
        gaps(before.gaps[i] ?? "", after.gaps[j] ?? "");
        flush();
        equal(word);
        i++;
        j++;
      } else if (run.kind === "delete") {
        deleted += (before.gaps[i] ?? "") + word;
        i++;
      } else {
        inserted += (after.gaps[j] ?? "") + word;
        j++;
      }
    }
  }
  gaps(before.gaps[i] ?? "", after.gaps[j] ?? "");
  flush();
  return parts;
}

function remember(key: string, job: Job): DiffPart[] {
  const { before, after } = job.sides;
  if (before === undefined || after === undefined) {
    throw new Error("diff: the texts were not split");
  }
  const parts = assemble(job.runs, before, after);
  recent.set(key, parts);
  if (recent.size > RECENT_SIZE) {
    const oldest = recent.keys().next().value;
    if (oldest !== undefined) recent.delete(oldest);
  }
  return parts;
}

function known(key: string): DiffPart[] | null {
  const parts = recent.get(key);
  if (parts === undefined) return null;
  recent.delete(key);
  recent.set(key, parts);
  return parts;
}

/**
 * The whole diff as work: splitting each text into words is a step of its own, as a long
 * text takes a few milliseconds to split. The words are compared without their spaces,
 * so a space never stands in for a word the two sides share.
 */
function* diffWork(
  before: string,
  after: string,
  job: Pick<Job, "runs" | "sides">,
  pace: Pace,
): Work {
  const sideBefore = sideOf(before);
  job.sides.before = sideBefore;
  yield;
  const sideAfter = sideOf(after);
  job.sides.after = sideAfter;
  yield;
  yield* diffRuns(sideBefore.words, sideAfter.words, job.runs, pace);
}

function jobFor(key: string, before: string, after: string): Job {
  let job = running.get(key);
  if (job === undefined) {
    const state: Pick<Job, "runs" | "sides"> = { runs: [], sides: {} };
    job = {
      ...state,
      work: diffWork(before, after, state, { work: 0 }),
      waiting: new Set(),
    };
    running.set(key, job);
    // A job no DiffText waits for (its render was thrown away) goes once there are many;
    // the ones waited for stay until they finish.
    if (running.size > RECENT_SIZE) {
      for (const [other, each] of running) {
        if (each.waiting.size === 0 && other !== key) {
          running.delete(other);
          break;
        }
      }
    }
  }
  return job;
}

/**
 * Takes one step of `job`; done: its parts, handed to all who wait once the current
 * render (or task) is over, as a DiffText may be rendering another one now.
 */
function step(key: string, job: Job): DiffPart[] | null {
  if (!job.work.next().done) return null;
  running.delete(key);
  const parts = remember(key, job);
  const waiting = [...job.waiting];
  queueMicrotask(() => {
    for (const notify of waiting) notify(parts);
  });
  return parts;
}

/** Works on `job` until it is done or `until` passes. */
function advance(key: string, job: Job, until: number): DiffPart[] | null {
  while (performance.now() < until) {
    const parts = step(key, job);
    if (parts !== null) return parts;
  }
  return null;
}

let tickPending = false;

/**
 * Carries the waited-for diffs on within one budget per task, a step of each in turn:
 * a few changes finish in a step, even behind a long rewrite. A job stepped goes to the
 * back of `running`, so the round goes on in the next task where this one's budget
 * stopped it: on a slow device, where a budget reaches only some of the jobs, the ones
 * at the front would otherwise take every budget.
 */
function tick() {
  tickPending = false;
  const until = performance.now() + BUDGET_MS;
  // A Map's iteration reaches the entries set again during it: the round goes on until
  // the budget ends or no job waited for is left.
  for (const [key, job] of running) {
    if (performance.now() >= until) break;
    if (job.waiting.size === 0) continue;
    if (step(key, job) === null) {
      running.delete(key);
      running.set(key, job);
    }
  }
  if ([...running.values()].some((job) => job.waiting.size > 0)) {
    tickPending = true;
    setTimeout(tick, 0);
  }
}

/**
 * The diff of `before` and `after` if it is known or can be worked out in what is left of
 * this task's budget; null otherwise (`waitForDiff` carries it on).
 */
export function diffNow(before: string, after: string): DiffPart[] | null {
  const key = keyOf(before, after);
  const parts = known(key);
  if (parts !== null) return parts;
  if (!resetPending) {
    resetPending = true;
    setTimeout(() => {
      spentThisTask = 0;
      resetPending = false;
    }, 0);
  }
  if (spentThisTask >= BUDGET_MS) return null;
  const started = performance.now();
  const done = advance(
    key,
    jobFor(key, before, after),
    started + BUDGET_MS - spentThisTask,
  );
  spentThisTask += performance.now() - started;
  return done;
}

/**
 * Carries the diff of `before` and `after` on a task at a time and hands it to `onDone`
 * when it is known. Returns the function that stops waiting.
 */
export function waitForDiff(
  before: string,
  after: string,
  onDone: (parts: DiffPart[]) => void,
): () => void {
  const key = keyOf(before, after);
  const parts = known(key);
  if (parts !== null) {
    onDone(parts);
    return () => {};
  }
  const job = jobFor(key, before, after);
  job.waiting.add(onDone);
  if (!tickPending) {
    tickPending = true;
    setTimeout(tick, 0);
  }
  return () => job.waiting.delete(onDone);
}

/**
 * What changed from `before` to `after`, word by word (`words`; PNL-2 and 25 ③,
 * design-spec 4.5), worked out to the end: the fewest words changed, except the shared
 * punctuation a rewrite takes in (`joinRewrites`), in reading order, a change's deletion
 * before its insertion (`assemble`).
 */
export function diffText(before: string, after: string): DiffPart[] {
  const key = keyOf(before, after);
  const parts =
    known(key) ??
    advance(key, jobFor(key, before, after), Number.POSITIVE_INFINITY);
  if (parts === null) throw new Error("diffText: the diff did not finish");
  return parts;
}
