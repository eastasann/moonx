import type { DiffTextVariant } from "@moonx/ui-tokens";
import { useEffect, useState } from "react";
import { type DiffPart, diffNow, waitForDiff } from "../internal/diff";
import * as styles from "./DiffText.css";

export interface DiffTextProps {
  /** The text before the change ("" when there was none). */
  before: string;
  /** The text after the change ("" when it was removed). */
  after: string;
  /**
   * `before` shows the old text with what was removed struck through; `after` the new
   * text with what was added underlined.
   */
  variant: DiffTextVariant;
}

/**
 * One side of a change in PNL-2 (design-spec 4.5・6.0.5), the changed characters marked
 * by a line, not by colour alone: struck through when removed, underlined when added.
 */
export function DiffText({ before, after, variant }: DiffTextProps) {
  // A diff of a few changes is done at once; a long rewrite shows its text first and its
  // marks once the rest of the work, a frame at a time, is done. The parts it waited for
  // are kept here: the shared cache may have let them go by the next render.
  const [waited, setWaited] = useState<{
    before: string;
    after: string;
    parts: DiffPart[];
  } | null>(null);
  const parts =
    waited?.before === before && waited.after === after
      ? waited.parts
      : diffNow(before, after);
  useEffect(() => {
    if (parts !== null) return;
    return waitForDiff(before, after, (done) =>
      setWaited({ before, after, parts: done }),
    );
  }, [before, after, parts]);
  if (parts === null) {
    return (
      <span className={styles.text}>
        {variant === "before" ? before : after}
      </span>
    );
  }
  return (
    <span className={styles.text}>
      {parts.map((part, index) => {
        const key = `${index}:${part.kind}`;
        if (part.kind === "equal") return <span key={key}>{part.text}</span>;
        if (part.kind === "delete") {
          return variant === "before" ? (
            <del key={key} className={styles.removed}>
              {part.text}
            </del>
          ) : null;
        }
        return variant === "after" ? (
          <ins key={key} className={styles.added}>
            {part.text}
          </ins>
        ) : null;
      })}
    </span>
  );
}
