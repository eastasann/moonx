/** One run of a character-level diff; the shape `DiffText` of `@moonx/ui-web` draws. */
export interface DiffSegment {
  kind: "same" | "added" | "removed";
  text: string;
}

/** Above this many cells the table of the longest common subsequence is not built. */
const MAX_CELLS = 4_000_000;

function push(segments: DiffSegment[], kind: DiffSegment["kind"], chars: string[]) {
  if (chars.length === 0) return;
  const text = chars.join("");
  const last = segments.at(-1);
  if (last?.kind === kind) last.text += text;
  else segments.push({ kind, text });
}

/**
 * Character-level diff of two texts, by code point so a surrogate pair is never split. The
 * unchanged head and tail are peeled off first, then the middle is diffed by its longest common
 * subsequence. A middle too large for that table is shown as one removal and one addition, which
 * is correct but marks more than changed.
 */
export function diffText(before: string, after: string): DiffSegment[] {
  const a = Array.from(before);
  const b = Array.from(after);
  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head++;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  ) {
    tail++;
  }
  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);

  const segments: DiffSegment[] = [];
  push(segments, "same", a.slice(0, head));

  if (midA.length === 0 || midB.length === 0 || (midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    push(segments, "removed", midA);
    push(segments, "added", midB);
  } else {
    const width = midB.length + 1;
    // lcs[i * width + j] is the common length of midA[i..] and midB[j..].
    const lcs = new Uint32Array((midA.length + 1) * width);
    for (let i = midA.length - 1; i >= 0; i--) {
      for (let j = midB.length - 1; j >= 0; j--) {
        lcs[i * width + j] =
          midA[i] === midB[j]
            ? (lcs[(i + 1) * width + j + 1] as number) + 1
            : Math.max(lcs[(i + 1) * width + j] as number, lcs[i * width + j + 1] as number);
      }
    }
    let i = 0;
    let j = 0;
    while (i < midA.length && j < midB.length) {
      if (midA[i] === midB[j]) {
        push(segments, "same", [midA[i] as string]);
        i++;
        j++;
      } else if ((lcs[(i + 1) * width + j] as number) >= (lcs[i * width + j + 1] as number)) {
        push(segments, "removed", [midA[i] as string]);
        i++;
      } else {
        push(segments, "added", [midB[j] as string]);
        j++;
      }
    }
    push(segments, "removed", midA.slice(i));
    push(segments, "added", midB.slice(j));
  }

  push(segments, "same", a.slice(a.length - tail));
  return segments;
}
