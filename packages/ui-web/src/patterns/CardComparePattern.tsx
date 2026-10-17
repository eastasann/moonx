import type { CompareView } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

export interface CardComparePatternProps {
  /** The title: its level 1 Heading ("04 Competitors"). */
  header: ReactNode;
  /**
   * Beside the title, on its baseline: the count and the aim ("● 4 competitors · aim for
   * 3–5", s15-competitors.html .count). A MoonGlyph and Text.
   */
  count?: ReactNode;
  /**
   * The new item ("+ Add competitor"): a secondary Button at the end of the title's line,
   * in place on a phone too (4.3). The last tile of the CardView adds as well.
   */
  primaryAction?: ReactNode;
  /** Cards or the table (15's `?view=`). */
  view: CompareView;
  onViewChange: (view: CompareView) => void;
  /** The cards: a CardView, 2 to 3 across as the width allows (4.5), its `addItem` last. */
  cards: ReactNode;
  /** "Compare in a table": the items as columns, their fields as rows. */
  table: ReactNode;
  /** Under the cards or the table (15's Survivor and Failure Patterns). */
  children?: ReactNode;
}

/**
 * Pattern E, card comparison (design-spec 4.1, s15-competitors.html): things set side by
 * side to compare (15). Desktop and tablet: the cards in 2 to 3 columns, or the table, by
 * the Cards / Table switch. Phone: the cards in one column and no table.
 */
export function CardComparePattern({
  header,
  count,
  primaryAction,
  view,
  onViewChange,
  cards,
  table,
  children,
}: CardComparePatternProps) {
  const { t } = useTranslation(["components"]);
  const isNarrow = useIsNarrow();
  return (
    <div className={styles.root}>
      <div className={styles.comparePage}>
        <div className={styles.compareHeader}>
          {header}
          {count != null && (
            <span className={styles.compareCount}>{count}</span>
          )}
          {(!isNarrow || primaryAction != null) && (
            <div className={styles.compareTools}>
              {!isNarrow && (
                <SegmentedControl
                  aria-label={t("components:cardComparePattern.view")}
                  selectedKey={view}
                  onSelectionChange={(key) => onViewChange(key as CompareView)}
                >
                  <SegmentedControlItem id="cards">
                    {t("components:cardComparePattern.cards")}
                  </SegmentedControlItem>
                  <SegmentedControlItem id="table">
                    {t("components:cardComparePattern.table")}
                  </SegmentedControlItem>
                </SegmentedControl>
              )}
              {primaryAction}
            </div>
          )}
        </div>
        <div className={styles.compareContent}>
          {isNarrow || view === "cards" ? cards : table}
          {children}
        </div>
      </div>
    </div>
  );
}
