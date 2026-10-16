import { i18n } from "@moonx/i18n";
import type { CompareView } from "@moonx/ui-tokens";
import type { ReactNode } from "react";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "../components/SegmentedControl";
import { useIsNarrow } from "../internal/useIsNarrow";
import { MainActionBar, PageHeader } from "./PageHeader";
import * as styles from "./patterns.css";

export interface CardComparePatternProps {
  /** The title and the line under it (15: "4 competitors · aim for 3–5"). */
  header: ReactNode;
  /** The screen's main action ("+ Add competitor"): fixed to the bottom on a phone. */
  primaryAction?: ReactNode;
  /** Cards or the table (15's `?view=`). */
  view: CompareView;
  onViewChange: (view: CompareView) => void;
  /** The cards: a CardView, 2 to 3 across as the width allows (4.5). */
  cards: ReactNode;
  /** "Compare in a table": the items as columns, their fields as rows. */
  table: ReactNode;
  /** Under the cards or the table (15's Survivor and Failure Patterns). */
  children?: ReactNode;
}

/**
 * Pattern E, card comparison (design-spec 4.1): things set side by side to compare (15).
 * Desktop and tablet: the cards in 2 to 3 columns, or the table, by the Cards / Table
 * switch. Phone: the cards in one column and no table.
 */
export function CardComparePattern({
  header,
  primaryAction,
  view,
  onViewChange,
  cards,
  table,
  children,
}: CardComparePatternProps) {
  const isNarrow = useIsNarrow();
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "content", density: "regular" })}>
        <PageHeader
          header={header}
          actions={
            isNarrow ? undefined : (
              <SegmentedControl
                aria-label={i18n.t("components:cardComparePattern.view")}
                selectedKey={view}
                onSelectionChange={(key) => onViewChange(key as CompareView)}
              >
                <SegmentedControlItem id="cards">
                  {i18n.t("components:cardComparePattern.cards")}
                </SegmentedControlItem>
                <SegmentedControlItem id="table">
                  {i18n.t("components:cardComparePattern.table")}
                </SegmentedControlItem>
              </SegmentedControl>
            )
          }
          primaryAction={primaryAction}
          isNarrow={isNarrow}
        />
        {isNarrow || view === "cards" ? cards : table}
        {children}
      </div>
      <MainActionBar primaryAction={primaryAction} isNarrow={isNarrow} />
    </div>
  );
}
