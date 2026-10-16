import { i18n } from "@moonx/i18n";
import { ArrowLeft } from "lucide-react";
import {
  type ReactNode,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { BackOverrideContext, FloatingAction } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import { useIsDesktop } from "../internal/useIsDesktop";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

interface ListDetailBase {
  /**
   * Over the panes: the list's title, and the filters and search when they go across
   * (6.8). Filters in the left pane (4.1 D) go in `list` instead. Shown with the list.
   */
  header?: ReactNode;
  /** The list pane: a ListView, a Tree (27), a TableView (28), with its own filters. */
  list: ReactNode;
  /**
   * The new-item action: floating at the bottom right on a phone (4.1 D), at the end of
   * the header on tablet and wider.
   */
  floatingAction?: ReactNode;
}

interface WithDetail extends ListDetailBase {
  /** @default true */
  hasDetail?: true;
  /**
   * The selected item's detail, or null while none is selected. Below the desktop
   * breakpoint it takes the whole width in place of the list.
   */
  detail: ReactNode;
  /** The list's name, for ← back to it from a detail below the desktop breakpoint. */
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
 * Pattern D, list and detail (design-spec 4.1): many things to find, open and manage (6,
 * 7, 8, 12, 14, 16, 22, 26–28). Desktop: the list on the left, the selected item on the
 * right. Tablet and phone: one pane at a time across the whole width, the list, then the
 * detail with ← back to the list (in the header on a phone, inside AppFrame).
 */
export function ListDetailPattern(props: ListDetailPatternProps) {
  const { header, list, floatingAction } = props;
  const hasDetail = props.hasDetail !== false;
  const detail = props.hasDetail === false ? null : props.detail;
  const listLabel = props.hasDetail === false ? "" : props.listLabel;
  const onBack = props.hasDetail === false ? undefined : props.onBack;

  const isDesktop = useIsDesktop();
  const isNarrow = useIsNarrow();
  const setFrameBack = useContext(BackOverrideContext);
  const showsDetail = hasDetail && detail != null;
  const showsList = isDesktop || !showsDetail;
  // On a phone inside AppFrame, the header's ← goes back to the list (6.0.1): one ←.
  const usesFrameBack = isNarrow && setFrameBack !== null;

  const latestOnBack = useRef(onBack);
  latestOnBack.current = onBack;
  useEffect(() => {
    if (!usesFrameBack || !showsDetail || setFrameBack === null) return;
    setFrameBack({
      label: listLabel,
      onPress: () => latestOnBack.current?.(),
    });
    return () => setFrameBack(null);
  }, [usesFrameBack, showsDetail, listLabel, setFrameBack]);

  // Below the desktop breakpoint one pane replaces the other, taking the focused element
  // with it: focus moves to the detail that opened, or back to the list. The header's ←
  // that closed a detail goes too, once this pattern stops taking it over.
  const listPane = useRef<HTMLDivElement>(null);
  const detailPane = useRef<HTMLDivElement>(null);
  const shown = useRef(showsDetail);
  useLayoutEffect(() => {
    if (shown.current === showsDetail) return;
    shown.current = showsDetail;
    if (isDesktop) return;
    const lost =
      document.activeElement === null ||
      document.activeElement === document.body ||
      (!showsDetail && usesFrameBack);
    if (!lost) return;
    if (showsDetail) {
      detailPane.current?.focus();
    } else {
      // The row a collection keeps in the Tab order, or the list's first control.
      for (const selector of [
        '[tabindex="0"]',
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ]) {
        const element = listPane.current?.querySelector<HTMLElement>(selector);
        if (element) {
          element.focus();
          break;
        }
      }
    }
  }, [showsDetail, isDesktop, usesFrameBack]);

  return (
    <div className={styles.root}>
      <div
        className={styles.page({
          width: hasDetail ? "content" : "reading",
          density: "regular",
        })}
      >
        <div className={styles.listDetailRoot}>
          {showsList &&
            (header != null || (!isNarrow && floatingAction != null)) && (
              <div className={styles.headerRow}>
                <div className={styles.headerTitle}>{header}</div>
                {!isNarrow && floatingAction}
              </div>
            )}
          <div className={styles.listDetail}>
            {showsList && (
              <div
                ref={listPane}
                className={`${styles.listPane}${hasDetail ? "" : ` ${styles.listOnly}`}`}
              >
                {list}
              </div>
            )}
            {hasDetail && (isDesktop || showsDetail) && (
              <div ref={detailPane} tabIndex={-1} className={styles.detailPane}>
                {!isDesktop && !usesFrameBack && (
                  <AriaButton
                    aria-label={i18n.t("components:listDetailPattern.back", {
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
        </div>
      </div>
      {isNarrow && showsList && floatingAction != null && (
        <FloatingAction>{floatingAction}</FloatingAction>
      )}
    </div>
  );
}
