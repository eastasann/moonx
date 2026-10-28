import { ChevronUp } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { Heading } from "../components/Heading";
import { ModalPanel } from "../components/Panel";
import { BottomBar, useTwoColumns } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import * as styles from "./patterns.css";

export interface WorksheetPatternProps {
  /** The title and what goes under it (the tabs of 17's three tables). */
  header?: ReactNode;
  /** The input table (a TableView; lined rows on a phone). */
  inputs: ReactNode;
  /** The results: totals and indicators (a MetricGroup `column`), and a link onward. */
  results: ReactNode;
  /**
   * The results' name: the small heading of their card (a level 2 heading) and the
   * drawer's title ("Totals", "Results").
   */
  resultsTitle: string;
  /**
   * The summary bar's few numbers, wherever the results have no column of their own (a
   * tablet, a phone, a desktop beside a docked panel): "Startup ₱450,000+ · Monthly
   * ₱49,000 · BE 13+/day", one line of pairs that do not break, wrapping between pairs
   * only where the bar is narrower than they are (a Flex with `wrap`). Pressing the bar
   * opens the results.
   */
  summary: ReactNode;
  /**
   * What goes under the inputs and the results, across the whole width, as one more of
   * the inputs' tables apart (18's scenario table, design-spec 6.4). Where the results
   * have no column of their own, it follows the inputs.
   */
  after?: ReactNode;
}

/**
 * Pattern F, worksheet (design-spec 4.1, s17-costs.html): numbers put in, results seen at
 * once (17, 18). Desktop: the inputs on the left, the results in a card on the right, in
 * view while the inputs scroll. Tablet, and a desktop whose docked panel leaves the body too narrow: the inputs
 * across the whole width (a table), a summary bar fixed to the bottom that opens the
 * results in a drawer from the right. Phone: the same, the inputs as lined rows and
 * the results in a tray.
 */
export function WorksheetPattern({
  header,
  inputs,
  results,
  resultsTitle,
  summary,
  after,
}: WorksheetPatternProps) {
  const isTwoColumns = useTwoColumns();
  const resultsTitleId = useId();
  const [isOpen, setOpen] = useState(false);
  // In two columns the results are on screen; a drawer left open would come back when
  // the body narrows again.
  useEffect(() => {
    if (isTwoColumns) setOpen(false);
  }, [isTwoColumns]);

  // Changing arrangement takes away the results' column or the summary bar, and focus
  // in it: the summary bar that now opens the results, or the results' column that now
  // shows them, takes it. Only focus lost from inside the pattern is moved: React reports
  // no blur from an element taken out of the page, so `hasFocus` still says focus was
  // here.
  const summaryButton = useRef<HTMLButtonElement>(null);
  const resultsColumn = useRef<HTMLElement>(null);
  // A column taller than the window scrolls on its own: the keyboard must reach it to
  // scroll it (WCAG 2.1.1), as it does any other scrolling region.
  const [isScrolling, setScrolling] = useState(false);
  useLayoutEffect(() => {
    const column = resultsColumn.current;
    if (
      !isTwoColumns ||
      column === null ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const measure = () =>
      setScrolling(column.scrollHeight > column.clientHeight);
    measure();
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(column);
    for (const child of column.children) observer.observe(child);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [isTwoColumns]);
  const hasFocus = useRef(false);
  const wasTwoColumns = useRef(isTwoColumns);
  useLayoutEffect(() => {
    if (wasTwoColumns.current === isTwoColumns) return;
    wasTwoColumns.current = isTwoColumns;
    if (
      !hasFocus.current ||
      (document.activeElement !== null &&
        document.activeElement !== document.body)
    ) {
      return;
    }
    (isTwoColumns ? resultsColumn : summaryButton).current?.focus();
  }, [isTwoColumns]);

  // The inputs keep their place in the tree in both arrangements, so a row being edited
  // is not drawn again when a tablet turns or a panel opens beside them.
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: it only follows focus among its children
    <div
      className={styles.root}
      onFocus={() => {
        hasFocus.current = true;
      }}
      onBlur={(event) => {
        hasFocus.current = event.currentTarget.contains(event.relatedTarget);
      }}
    >
      <div className={styles.worksheetPage}>
        {header != null && (
          <div className={styles.worksheetHeader}>{header}</div>
        )}
        <div className={styles.worksheet}>
          <div className={styles.inputs}>{inputs}</div>
          {isTwoColumns && (
            <aside
              ref={resultsColumn}
              tabIndex={isScrolling ? 0 : -1}
              aria-labelledby={resultsTitleId}
              className={styles.results}
            >
              <div className={styles.resultsTitle}>
                <Heading level={2} variant="label" id={resultsTitleId}>
                  {resultsTitle}
                </Heading>
              </div>
              {results}
            </aside>
          )}
        </div>
        {after != null && <div className={styles.worksheetAfter}>{after}</div>}
      </div>
      {!isTwoColumns && (
        <BottomBar variant="summary" column="worksheet">
          <AriaButton
            ref={summaryButton}
            aria-haspopup="dialog"
            aria-expanded={isOpen}
            onPress={() => setOpen(true)}
            className={styles.summaryButton}
          >
            <span className={styles.summaryContent}>{summary}</span>
            <IconSlot size="M">
              <ChevronUp />
            </IconSlot>
          </AriaButton>
        </BottomBar>
      )}
      {!isTwoColumns && (
        // Modal on a desktop too: the docked panel holds the column at the right.
        <ModalPanel title={resultsTitle} isOpen={isOpen} onOpenChange={setOpen}>
          {results}
        </ModalPanel>
      )}
    </div>
  );
}
