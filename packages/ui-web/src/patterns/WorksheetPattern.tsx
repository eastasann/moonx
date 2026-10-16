import { ChevronUp } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button as AriaButton } from "react-aria-components";
import { Panel } from "../components/Panel";
import { BottomBar } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import { useIsDesktop } from "../internal/useIsDesktop";
import * as styles from "./patterns.css";

export interface WorksheetPatternProps {
  /** The title and what goes under it (the tabs of 17's three tables). */
  header?: ReactNode;
  /** The input table (a TableView; a card per row on a phone). */
  inputs: ReactNode;
  /** The results: totals and indicators. */
  results: ReactNode;
  /** The results' name: the side column's and the drawer's ("Totals", "Results"). */
  resultsTitle: string;
  /**
   * The summary bar's few numbers, on a tablet and a phone ("Startup ₱450,000+ · Monthly
   * ₱49,000 · BE 13+/day"). Pressing the bar opens the results.
   */
  summary: ReactNode;
}

/**
 * Pattern F, worksheet (design-spec 4.1): numbers put in, results seen at once (17, 18).
 * Desktop: the inputs on the left, the results on the right, in view while the inputs
 * scroll. Tablet: the inputs across the whole width (a table), a summary bar fixed to the
 * bottom that opens the results in a drawer from the right. Phone: the same, the inputs
 * as a card per row and the results in a tray.
 */
export function WorksheetPattern({
  header,
  inputs,
  results,
  resultsTitle,
  summary,
}: WorksheetPatternProps) {
  const isDesktop = useIsDesktop();
  const [isOpen, setOpen] = useState(false);
  // On a desktop the results are on screen; a drawer left open would come back when the
  // window narrows again.
  useEffect(() => {
    if (isDesktop) setOpen(false);
  }, [isDesktop]);

  // The inputs keep their place in the tree at every width, so a row being edited is
  // not drawn again when a tablet turns.
  return (
    <div className={styles.root}>
      <div className={styles.page({ width: "content", density: "regular" })}>
        {header}
        <div className={styles.worksheet}>
          <div className={styles.inputs}>{inputs}</div>
          {isDesktop && (
            <aside aria-label={resultsTitle} className={styles.results}>
              {results}
            </aside>
          )}
        </div>
      </div>
      {!isDesktop && (
        <BottomBar>
          <AriaButton
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            onPress={() => setOpen(true)}
            className={styles.summaryButton}
          >
            {summary}
            <IconSlot size="M">
              <ChevronUp />
            </IconSlot>
          </AriaButton>
        </BottomBar>
      )}
      {!isDesktop && (
        <Panel title={resultsTitle} isOpen={isOpen} onOpenChange={setOpen}>
          {results}
        </Panel>
      )}
    </div>
  );
}
