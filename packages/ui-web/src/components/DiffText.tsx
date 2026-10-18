import type { DiffTextVariant } from "@moonx/ui-tokens";
import { useDiff } from "../internal/useDiff";
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
 * One side of a change in PNL-2 and 25 ③ (design-spec 4.5・6.0.5・6.7), the changed words
 * marked by a line, not by colour alone: struck through when removed, underlined when
 * added.
 */
export function DiffText({ before, after, variant }: DiffTextProps) {
  // A long rewrite shows its text first and its marks once the work is done.
  const parts = useDiff(before, after);
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
