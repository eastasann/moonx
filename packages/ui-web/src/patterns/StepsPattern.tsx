import type { ReactNode } from "react";
import { Density } from "../internal/Density";
import { BottomBar } from "../internal/frame";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

/** One question of the diff check (25 ③): its head and its two sides. */
export interface StepsComparison {
  id: string;
  /** "Apply this change": the Checkbox at the start of the head. */
  select?: ReactNode;
  /** The section and the question's name, monospaced: "01 · WHO". */
  code: string;
  question: string;
  /** At the end of the head (on a phone, under it): "Updated by Kenji just now". */
  meta?: string;
  /** The current answer: its label line ("Current" and its F/A/U) and a DiffText. */
  before: ReactNode;
  /** The imported answer: its label line and a DiffTextArea, then its F/A/U. */
  after: ReactNode;
}

export interface StepsPatternProps {
  /** The procedure's title and what is above it ("Bacolod Health Bowl · validation questions"). */
  header?: ReactNode;
  /** The `Steps`: 1 → 2 → 3, above the step's content. */
  steps: ReactNode;
  /** The current step's content; in the diff check, its lead over the questions. */
  children?: ReactNode;
  /**
   * The diff check's questions (25 ③), each in its frame, the two sides beside each other
   * from the tablet breakpoint up and one above the other on a phone. The page widens to
   * `layout.comparison-max` for them.
   */
  comparisons?: StepsComparison[];
  /** After the questions ("3 unchanged answers"). */
  footer?: ReactNode;
  /**
   * The step's buttons (Back, Cancel, Apply n changes): in a bar kept at the bottom with a
   * line above it, at every width (s25-import.html .fixbar).
   */
  actions?: ReactNode;
  /**
   * At the start of the bar from the tablet breakpoint up ("Each change is saved in
   * history as an AI import."); on a phone, at the end of the content.
   */
  note?: ReactNode;
}

/**
 * Pattern G, steps (design-spec 4.1, s25-import.html): a fixed procedure, one step after
 * another (3, 24, 25). The steps on top, the current one's content in the column under
 * them; the diff check's questions each in a frame, their two sides stacked on a phone.
 */
export function StepsPattern({
  header,
  steps,
  children,
  comparisons,
  footer,
  actions,
  note,
}: StepsPatternProps) {
  const isNarrow = useIsNarrow();
  const isComparison = comparisons !== undefined;
  return (
    <Density density="spacious">
      <div className={styles.root}>
        <div className={styles.stepsPage({ isComparison })}>
          {header != null && <div className={styles.stepsHeader}>{header}</div>}
          <div className={styles.stepsBar}>{steps}</div>
          <div className={styles.stepsContent}>
            {children}
            {comparisons?.map((item) => (
              <section
                key={item.id}
                aria-label={`${item.code} ${item.question}`}
                className={styles.comparisonItem}
              >
                <div className={styles.comparisonHead}>
                  {item.select}
                  <span className={styles.comparisonCode}>{item.code}</span>
                  <p className={styles.comparisonQuestion}>{item.question}</p>
                  {item.meta !== undefined && (
                    <span className={styles.comparisonMeta}>{item.meta}</span>
                  )}
                </div>
                <div className={styles.comparison}>
                  <div className={styles.comparisonSide}>{item.before}</div>
                  <div className={styles.comparisonSide}>{item.after}</div>
                </div>
              </section>
            ))}
            {footer}
            {note != null && isNarrow && (
              <p className={styles.stepsNote}>{note}</p>
            )}
          </div>
        </div>
        {actions != null && (
          <BottomBar
            column={isComparison ? "comparison" : "reading"}
            note={note}
          >
            {actions}
          </BottomBar>
        )}
      </div>
    </Density>
  );
}
