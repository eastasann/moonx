import { added, diffText, removed } from "./DiffText.css";

/** One run of a character-level diff. */
export interface DiffSegment {
  kind: "same" | "added" | "removed";
  text: string;
}

export interface DiffTextProps {
  /** The diff to draw, in text order. */
  segments: readonly DiffSegment[];
  /** `before` draws the unchanged and removed runs, `after` the unchanged and added runs. */
  side: "before" | "after";
}

/** One side of a text change (PNL-2) with the changed characters marked by `ins` and `del`. */
export function DiffText({ segments, side }: DiffTextProps) {
  const hidden = side === "before" ? "added" : "removed";
  return (
    <p className={diffText}>
      {segments
        .filter((segment) => segment.kind !== hidden)
        .map((segment, index) => {
          const key = `${index}:${segment.kind}`;
          if (segment.kind === "added") {
            return (
              <ins key={key} className={added}>
                {segment.text}
              </ins>
            );
          }
          if (segment.kind === "removed") {
            return (
              <del key={key} className={removed}>
                {segment.text}
              </del>
            );
          }
          return <span key={key}>{segment.text}</span>;
        })}
    </p>
  );
}
