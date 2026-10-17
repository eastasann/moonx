import { formatCount, i18n } from "@moonx/i18n";
import { type SaveState, twoColumnMinWidth } from "@moonx/ui-tokens";
import { ArrowLeft, History, MessageSquare } from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button as AriaButton, Link as AriaLink } from "react-aria-components";
import { flushSync } from "react-dom";
import {
  BackOverrideContext,
  type BackTarget,
  Banners,
  type FrameBanners,
  HeaderToolsContext,
  TwoColumnRoomContext,
} from "../internal/frame";
import * as frame from "../internal/frame.css";
import { IconSlot } from "../internal/IconSlot";
import { cssVarName } from "../styles/helpers";
import { ActionButton } from "./ActionButton";
import * as styles from "./AppFrame.css";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { StatusLight } from "./StatusLight";
import { Tooltip, TooltipTrigger } from "./Tooltip";

const topInsetName = cssVarName(frame.topInset);

const saveLabels = {
  saving: "components:appFrame.saving",
  saved: "components:appFrame.saved",
  "save-failed": "components:appFrame.saveFailed",
} as const;

export interface AppFrameProps {
  /** The `SideNav`: tablet and wider. */
  sideNav: ReactNode;
  /** The `TabBar`: phone. */
  tabBar: ReactNode;
  /** The `Breadcrumbs` (tablet and wider): "Ideas / Piaya Gift Box / 05 Costs". */
  breadcrumbs?: ReactNode;
  /** On a phone, ← and where it leads: "Validation", "Plan", "Self Analysis", "Ideas". */
  back?: { href: string; label: string };
  /** The save state of the screen's fields; none on screens that save nothing. */
  saveState?: SaveState;
  /** Sends the failed saves again (the header's Retry, 6.0.2). */
  onRetrySave?: () => void;
  /**
   * 💬: the comments panel of the screen, with the number of unresolved threads. None on
   * screens with nothing to comment on (6.0.1).
   */
  comments?: { count: number; isOpen: boolean; onPress: () => void };
  /** 🕘: the history panel of the screen. */
  history?: { isOpen: boolean; onPress: () => void };
  /** The bands under the header (6.0.6), drawn in their order: offline first. */
  banners?: FrameBanners;
  /**
   * The open `Panel`: in the column at the body's right on a desktop. While it leaves the
   * body narrower than `layout.two-column-min-width`, patterns D and F inside take their
   * tablet arrangement (design-spec 4.1).
   */
  panel?: ReactNode;
  /** The screen: its layout pattern. */
  children: ReactNode;
}

/**
 * The frame of every screen after signing in (design-spec 4.3・4.5・6.0.1): a link to skip
 * to the content, the SideNav or the TabBar, the header (breadcrumbs or ←, the save
 * state, 💬 and 🕘), the bands under it, the body, and the panel beside it on a desktop.
 */
export function AppFrame({
  sideNav,
  tabBar,
  breadcrumbs,
  back,
  saveState,
  onRetrySave,
  comments,
  history,
  banners,
  panel,
  children,
}: AppFrameProps) {
  const mainId = useId();
  const mainRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const bodyWidthRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [hasTwoColumnRoom, setTwoColumnRoom] = useState(true);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  // A pattern's ← on a phone (a list's detail), in place of the screen's `back`.
  const [backOverride, setBackOverride] = useState<BackTarget | null>(null);
  const hasHeader =
    breadcrumbs !== undefined ||
    back !== undefined ||
    backOverride !== null ||
    saveState !== undefined ||
    comments !== undefined ||
    history !== undefined;

  // Sticky panes, and focus scrolling into view, stop under the header at its real
  // height: long breadcrumbs or a large scale can make it taller than
  // `layout.header-height`. A header that appears later (a save state once the screen
  // has loaded) is measured from then on.
  useLayoutEffect(() => {
    const element = hasHeader ? headerRef.current : null;
    if (!element || typeof ResizeObserver === "undefined") {
      setHeaderHeight(null);
      return;
    }
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      // A header taken out of the page reports 0 on its way out.
      if (height === 0) return;
      setHeaderHeight(height);
      root.style.scrollPaddingTop = `${height}px`;
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.style.removeProperty("scroll-padding-top");
    };
  }, [hasHeader]);

  // A docked panel narrows the body (4.3). Measured where the window and the panel set
  // the body's width, and rendered at once, so the squeezed two columns are never painted.
  // The body is measured through a probe of no height: the switch changes the body's
  // height, which, observed, would end the browser's round of observations with an error.
  useLayoutEffect(() => {
    const body = bodyWidthRef.current;
    const column = panelRef.current;
    if (!body || !column || typeof ResizeObserver === "undefined") return;
    // Where the stable scrollbar gutter (AppFrame.css.ts) is not supported, a scrollbar
    // coming and going would flip the arrangement on and on: the body is measured as if
    // the scrollbar took no width.
    const hasStableGutter = CSS.supports("scrollbar-gutter", "stable");
    const observer = new ResizeObserver(() => {
      const scrollbar = hasStableGutter
        ? 0
        : window.innerWidth - document.documentElement.clientWidth;
      // The column is empty, and 0 wide, unless a panel is docked in it.
      const isNarrowed =
        column.getBoundingClientRect().width > 0 &&
        body.getBoundingClientRect().width + scrollbar < twoColumnMinWidth;
      flushSync(() => setTwoColumnRoom(!isNarrowed));
    });
    observer.observe(body);
    observer.observe(column);
    return () => observer.disconnect();
  }, []);

  // The link goes to the content without changing the URL, which the router owns.
  const skipToContent = (event: MouseEvent) => {
    event.preventDefault();
    mainRef.current?.focus();
  };

  const rootClasses = [styles.frameRoot, frame.withTabBar];
  if (hasHeader) rootClasses.push(frame.withHeader);
  else rootClasses.push(styles.headerless);

  return (
    <div
      className={rootClasses.join(" ")}
      style={
        hasHeader && headerHeight !== null
          ? { [topInsetName]: `${headerHeight}px` }
          : undefined
      }
    >
      <a
        href={`#${mainId}`}
        onClick={skipToContent}
        className={styles.skipLink}
      >
        {i18n.t("components:appFrame.skipToContent")}
      </a>
      {sideNav}
      <div className={styles.column}>
        {hasHeader && (
          <header ref={headerRef} className={styles.header}>
            <div className={styles.headerStart}>
              {backOverride !== null ? (
                <AriaButton
                  aria-label={i18n.t("components:appFrame.back", {
                    label: backOverride.label,
                  })}
                  onPress={backOverride.onPress}
                  className={styles.back}
                >
                  <IconSlot size="M">
                    <ArrowLeft />
                  </IconSlot>
                  <span className={styles.backLabel}>{backOverride.label}</span>
                </AriaButton>
              ) : (
                back !== undefined && (
                  <AriaLink
                    href={back.href}
                    aria-label={i18n.t("components:appFrame.back", {
                      label: back.label,
                    })}
                    className={styles.back}
                  >
                    <IconSlot size="M">
                      <ArrowLeft />
                    </IconSlot>
                    <span className={styles.backLabel}>{back.label}</span>
                  </AriaLink>
                )
              )}
              {breadcrumbs}
            </div>
            <div className={styles.tools}>
              <div ref={setTools} className={styles.patternTools} />
              {saveState !== undefined && (
                <div className={styles.saveState}>
                  <StatusLight variant={saveState} role="status">
                    <span
                      className={
                        saveState === "save-failed"
                          ? undefined
                          : styles.saveLabelPhone
                      }
                    >
                      {i18n.t(saveLabels[saveState])}
                    </span>
                  </StatusLight>
                  {saveState === "save-failed" && onRetrySave && (
                    <Button variant="secondary" size="S" onPress={onRetrySave}>
                      {i18n.t("components:appFrame.retry")}
                    </Button>
                  )}
                </div>
              )}
              {comments !== undefined && (
                <span className={styles.comments}>
                  <TooltipTrigger>
                    <ActionButton
                      isQuiet
                      aria-label={
                        comments.count > 0
                          ? i18n.t("components:appFrame.commentsUnresolved", {
                              count: comments.count,
                              formatted: formatCount(comments.count),
                            })
                          : i18n.t("components:appFrame.comments")
                      }
                      aria-expanded={comments.isOpen}
                      onPress={comments.onPress}
                    >
                      <MessageSquare />
                    </ActionButton>
                    <Tooltip placement="bottom">
                      {i18n.t("components:appFrame.comments")}
                    </Tooltip>
                  </TooltipTrigger>
                  {comments.count > 0 && (
                    // The count of unresolved threads: the frame, not the ink fill,
                    // which 4.5 keeps for unread counts. The button's name reads it.
                    <span aria-hidden="true">
                      <Badge>{formatCount(comments.count)}</Badge>
                    </span>
                  )}
                </span>
              )}
              {history !== undefined && (
                <TooltipTrigger>
                  <ActionButton
                    isQuiet
                    aria-label={i18n.t("components:appFrame.history")}
                    aria-expanded={history.isOpen}
                    onPress={history.onPress}
                  >
                    <History />
                  </ActionButton>
                  <Tooltip placement="bottom">
                    {i18n.t("components:appFrame.history")}
                  </Tooltip>
                </TooltipTrigger>
              )}
            </div>
          </header>
        )}
        <Banners banners={banners} />
        <div className={styles.body}>
          <main ref={mainRef} id={mainId} tabIndex={-1} className={styles.main}>
            <div ref={bodyWidthRef} className={styles.bodyWidth} />
            <HeaderToolsContext.Provider value={tools}>
              <BackOverrideContext.Provider value={setBackOverride}>
                <TwoColumnRoomContext.Provider value={hasTwoColumnRoom}>
                  {children}
                </TwoColumnRoomContext.Provider>
              </BackOverrideContext.Provider>
            </HeaderToolsContext.Provider>
          </main>
          <div ref={panelRef} className={styles.panel}>
            {panel}
          </div>
        </div>
      </div>
      {tabBar}
    </div>
  );
}
