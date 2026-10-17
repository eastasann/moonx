import { ArrowLeft, Plus } from "lucide-react";
import {
  type FocusEvent,
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { Button } from "../components/Button";
import {
  BackOverrideContext,
  FloatingAction,
  ListPaneContext,
  useTwoColumns,
} from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

interface ListDetailBase {
  /**
   * The title at the top of the list's pane (s06-ideas.html .lhead): its level 1 Heading,
   * `heading-1-list`. Shown with the list.
   */
  header?: ReactNode;
  /**
   * Under the title, with a hairline under them (s06-ideas.html .filters): the filters
   * (Pickers with their label inside) and the search. On a phone they stay on one line,
   * which scrolls sideways.
   */
  filters?: ReactNode;
  /** The list: a ListView, a Tree (27), a TableView (28). Its rows reach the pane's edges. */
  list: ReactNode;
  /**
   * Under the list, at its rows' insets (s06-ideas.html .hidden-note): what the filters
   * leave out and the link to show it ("1 dropped idea hidden · Show").
   */
  listNote?: ReactNode;
  /**
   * The new item ("New idea"): a primary Button at the end of the title's line from the
   * tablet breakpoint up, a floating "+" at the bottom right on a phone (4.1 D).
   */
  newItem?: { label: string; onPress: () => void };
}

interface WithDetail extends ListDetailBase {
  /** @default true */
  hasDetail?: true;
  /**
   * The selected item's detail, or null while none is selected. In one pane (below the
   * desktop breakpoint, or beside a docked panel that leaves no room) it takes the whole
   * width in place of the list.
   */
  detail: ReactNode;
  /** The list's name, for ← back to it from a detail in one pane. */
  listLabel: string;
  /** ← pressed: the screen clears the selection. */
  onBack: () => void;
}

interface ListOnly extends ListDetailBase {
  /**
   * A list whose items move to another screen (8 Notifications): the list alone, in the
   * reading column, with no detail area (4.1 D).
   */
  hasDetail: false;
}

export type ListDetailPatternProps = WithDetail | ListOnly;

/**
 * The selected rows of the list's collection (ListView, TableView, Tree), by the key
 * React Aria writes on each: in the list pane itself, not its popovers, tabs or tags.
 */
function selectedRows(pane: HTMLElement | null): string {
  return [
    ...(pane?.querySelectorAll('[role="row"][aria-selected="true"]') ?? []),
  ]
    .map((row) => row.getAttribute("data-key"))
    .join(" ");
}

/**
 * Pattern D, list and detail (design-spec 4.1, s06-ideas.html): many things to find, open
 * and manage (6, 7, 8, 12, 14, 16, 22, 26–28). Desktop: the list's pane on the left (its
 * title, new item, filters and list) and the selected item on the right, to the frame's
 * edges. Tablet and phone, and a desktop whose docked panel leaves the body too narrow:
 * one pane at a time across the whole width, the list, then the detail with ← back to
 * the list (in the header on a phone, inside AppFrame).
 */
export function ListDetailPattern(props: ListDetailPatternProps) {
  const { t } = useTranslation(["components"]);
  const { header, filters, list, listNote, newItem } = props;
  const hasDetail = props.hasDetail !== false;
  const detail = props.hasDetail === false ? null : props.detail;
  const listLabel = props.hasDetail === false ? "" : props.listLabel;
  const onBack = props.hasDetail === false ? undefined : props.onBack;

  const isTwoColumns = useTwoColumns();
  const isNarrow = useIsNarrow();
  const setFrameBack = useContext(BackOverrideContext);
  const showsDetail = hasDetail && detail != null;
  const listPane = useRef<HTMLDivElement>(null);
  const listBody = useRef<HTMLDivElement>(null);
  const detailPane = useRef<HTMLDivElement>(null);

  // Two columns turning into one pane keep the side that has focus (4.1: the field being
  // typed in is kept). With focus on the list's side (a filter, a row), the list stays,
  // its item still selected, until another item is selected there; elsewhere the detail
  // takes the width. Focus on the list's side is followed through its events; React
  // reports none from a list taken out of the page, so it is cleared once the list goes.
  const [isFocusOnList, setFocusOnList] = useState(false);
  const [isListHeld, setListHeld] = useState(false);
  const [wasTwoColumns, setWasTwoColumns] = useState(isTwoColumns);
  if (wasTwoColumns !== isTwoColumns) {
    setWasTwoColumns(isTwoColumns);
    setListHeld(!isTwoColumns && showsDetail && isFocusOnList);
  }
  if (isListHeld && !showsDetail) setListHeld(false);
  // In one pane, whether the detail is the pane shown.
  const opensDetail = showsDetail && !isListHeld;
  const showsList = isTwoColumns || !opensDetail;
  useEffect(() => {
    if (!showsList) setFocusOnList(false);
  }, [showsList]);
  const listSide = {
    onFocus: () => setFocusOnList(true),
    onBlur: (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (!(next instanceof Node) || !listPane.current?.contains(next)) {
        setFocusOnList(false);
      }
    },
  };
  // The selection when the list was held: the detail follows once it changes. Read
  // from the rows, as the pattern is given the detail, not which item it belongs to.
  const heldSelection = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (!isListHeld) {
      heldSelection.current = null;
      return;
    }
    const selection = selectedRows(listPane.current);
    if (heldSelection.current === null) heldSelection.current = selection;
    else if (selection !== heldSelection.current) setListHeld(false);
  });

  // On a phone inside AppFrame, the header's ← goes back to the list (6.0.1): one ←.
  const usesFrameBack = isNarrow && setFrameBack !== null;

  const latestOnBack = useRef(onBack);
  latestOnBack.current = onBack;
  useEffect(() => {
    if (!usesFrameBack || !opensDetail || setFrameBack === null) return;
    setFrameBack({
      label: listLabel,
      onPress: () => latestOnBack.current?.(),
    });
    return () => setFrameBack(null);
  }, [usesFrameBack, opensDetail, listLabel, setFrameBack]);

  // A pane that goes takes the focused element with it: in one pane, one replaces the
  // other; two columns coming back take the detail's ←. Focus then moves to the detail,
  // or to the list. Only focus lost from inside the pattern is moved: React reports no
  // blur from an element taken out of the page, so `hasFocus` still says focus was here.
  // On a phone,
  // the header's ← that closed a detail goes too, once this pattern stops taking it over.
  const hasFocus = useRef(false);
  const shown = useRef({ opensDetail, isTwoColumns });
  useLayoutEffect(() => {
    const before = shown.current;
    if (
      before.opensDetail === opensDetail &&
      before.isTwoColumns === isTwoColumns
    ) {
      return;
    }
    shown.current = { opensDetail, isTwoColumns };
    const lost =
      hasFocus.current &&
      (document.activeElement === null ||
        document.activeElement === document.body);
    const closedFromHeader =
      !isTwoColumns &&
      !before.isTwoColumns &&
      before.opensDetail &&
      !opensDetail &&
      usesFrameBack;
    if (!lost && !closedFromHeader) return;
    if (isTwoColumns ? hasDetail : opensDetail) {
      detailPane.current?.focus();
      return;
    }
    // The row a collection keeps in the Tab order, or the list's first control.
    for (const selector of [
      '[tabindex="0"]',
      'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ]) {
      const element = listBody.current?.querySelector<HTMLElement>(selector);
      if (element) {
        element.focus();
        break;
      }
    }
  }, [opensDetail, isTwoColumns, usesFrameBack, hasDetail]);

  const isBeside = hasDetail && isTwoColumns;
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
      <div className={styles.listDetail({ isBeside, isListOnly: !hasDetail })}>
        {showsList && (
          <div
            ref={listPane}
            className={styles.listPane({ isBeside })}
            {...listSide}
          >
            {(header != null || (!isNarrow && newItem !== undefined)) && (
              <div className={styles.listHead}>
                <div className={styles.listTitle}>{header}</div>
                {!isNarrow && newItem !== undefined && (
                  <Button variant="primary" onPress={newItem.onPress}>
                    <Plus />
                    {newItem.label}
                  </Button>
                )}
              </div>
            )}
            {filters != null && (
              <div className={styles.listFilters}>{filters}</div>
            )}
            <div ref={listBody}>
              <ListPaneContext.Provider value={true}>
                {list}
              </ListPaneContext.Provider>
            </div>
            {listNote != null && (
              <div className={styles.listNote}>{listNote}</div>
            )}
          </div>
        )}
        {hasDetail && (isTwoColumns || opensDetail) && (
          <div
            ref={detailPane}
            tabIndex={-1}
            className={styles.detailPane({ isBeside: isTwoColumns })}
          >
            {!isTwoColumns && !usesFrameBack && (
              <AriaButton
                aria-label={t("components:listDetailPattern.back", {
                  label: listLabel,
                })}
                onPress={onBack}
                className={styles.backButton}
              >
                <IconSlot size="M">
                  <ArrowLeft />
                </IconSlot>
                {listLabel}
              </AriaButton>
            )}
            {detail}
          </div>
        )}
      </div>
      {isNarrow && showsList && newItem !== undefined && (
        <FloatingAction label={newItem.label} onPress={newItem.onPress} />
      )}
    </div>
  );
}
