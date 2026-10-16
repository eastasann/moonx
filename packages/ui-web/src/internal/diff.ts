import { LOCALE } from "@moonx/i18n";

/** A run of text the two sides share, or that only one side has. */
export interface DiffPart {
  kind: "equal" | "delete" | "insert";
  text: string;
}

const segmenter = new Intl.Segmenter(LOCALE, { granularity: "grapheme" });

/** The characters of `text` as a reader sees them: an emoji of several code points is one. */
const graphemes = (text: string) =>
  Array.from(segmenter.segment(text), (part) => part.segment);

type Run = { kind: DiffPart["kind"]; chars: string[] };

/** The diff's work, in steps it can be paused between. */
type Work = Generator<void, void, void>;

/**
 * Work (diagonals tried and characters compared) between two pauses: about a millisecond,
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
 * the length times the edit distance: a few changes in a long answer take milliseconds; a
 * long answer rewritten whole (20,000 characters, design-spec 6.0.8) takes seconds, so
 * the work pauses every millisecond or so and is carried on a frame at a time.
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
  // No common character at all.
  out.push({ kind: "delete", chars: a }, { kind: "insert", chars: b });
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
  if (prefix > 0) out.push({ kind: "equal", chars: a.slice(0, prefix) });
  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);
  if (middleA.length === 0) {
    if (middleB.length > 0) out.push({ kind: "insert", chars: middleB });
  } else if (middleB.length === 0) {
    out.push({ kind: "delete", chars: middleA });
  } else {
    yield* bisect(middleA, middleB, out, pace);
  }
  if (suffix > 0)
    out.push({ kind: "equal", chars: a.slice(a.length - suffix) });
}

/** The last few diffs: DiffText's two sides of one change ask for the same one. */
const recent = new Map<string, DiffPart[]>();
const RECENT_SIZE = 32;

/** A diff being worked out, and the DiffTexts waiting for it. */
interface Job {
  work: Work;
  runs: Run[];
  waiting: Set<(parts: DiffPart[]) => void>;
}

/** Diffs being worked out, oldest first: the one asked for first is finished first. */
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

function remember(key: string, runs: Run[]): DiffPart[] {
  const parts: DiffPart[] = [];
  for (const run of runs) {
    if (run.chars.length === 0) continue;
    const last = parts[parts.length - 1];
    if (last?.kind === run.kind) last.text += run.chars.join("");
    else parts.push({ kind: run.kind, text: run.chars.join("") });
  }
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

/** The whole diff as work: splitting the texts into characters is its first step too. */
function* diffWork(
  before: string,
  after: string,
  runs: Run[],
  pace: Pace,
): Work {
  yield* diffRuns(graphemes(before), graphemes(after), runs, pace);
}

function jobFor(key: string, before: string, after: string): Job {
  let job = running.get(key);
  if (job === undefined) {
    const runs: Run[] = [];
    job = {
      work: diffWork(before, after, runs, { work: 0 }),
      runs,
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
  const parts = remember(key, job.runs);
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
 * a few changes finish in a step, even behind a long rewrite.
 */
function tick() {
  tickPending = false;
  const until = performance.now() + BUDGET_MS;
  let stepped = true;
  while (stepped && performance.now() < until) {
    stepped = false;
    for (const [key, job] of running) {
      if (performance.now() >= until) break;
      if (job.waiting.size === 0) continue;
      stepped = true;
      step(key, job);
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
 * What changed from `before` to `after`, character by character (PNL-2, design-spec
 * 6.0.5), worked out to the end: runs in reading order, where a deletion and an
 * insertion at the same place may come in either order.
 */
export function diffText(before: string, after: string): DiffPart[] {
  const key = keyOf(before, after);
  const parts =
    known(key) ??
    advance(key, jobFor(key, before, after), Number.POSITIVE_INFINITY);
  if (parts === null) throw new Error("diffText: the diff did not finish");
  return parts;
}
