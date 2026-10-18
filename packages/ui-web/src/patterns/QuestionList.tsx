import type { ReactNode } from "react";
import * as styles from "./patterns.css";

export interface QuestionListProps {
  /** Its QuestionListItems, in the template's order. */
  children: ReactNode;
}

/**
 * Questions under a pattern's own content, between hairlines at every width (design-spec
 * 6.10, s15-competitors.html .qs): 15's Survivor and Failure Patterns under the cards.
 * Pattern C draws its own questions; this is the same list for the other patterns.
 */
export function QuestionList({ children }: QuestionListProps) {
  return <ol className={styles.questionList}>{children}</ol>;
}

export interface QuestionListItemProps {
  /** A QuestionCard. */
  children: ReactNode;
}

/** One question of a QuestionList, its hairline under it. */
export function QuestionListItem({ children }: QuestionListItemProps) {
  return <li className={styles.questionListItem}>{children}</li>;
}
