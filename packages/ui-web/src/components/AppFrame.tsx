import { formatCount } from "@moonx/i18n";
import {
  presentationTwoColumnMinWidth,
  type SaveState,
  twoColumnMinWidth,
} from "@moonx/ui-tokens";
import { ArrowLeft, ChevronDown, History, MessageSquare } from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Button as AriaButton,
  Link as AriaLink,
  type PressEvent,
} from "react-aria-components";
import { flushSync } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  BackOverrideContext,
  type BackTarget,
  Banners,
  type BodyRoom,
  BodyRoomContext,
  type FrameBanners,
  fullBodyRoom,
  HeaderToolsContext,
} from "../internal/frame";
import * as frame from "../internal/frame.css";
import { IconSlot } from "../internal/IconSlot";
import { useIsNarrow } from "../internal/useIsNarrow";
import { cssVarName } from "../styles/helpers";
import { ActionButton } from "./ActionButton";
import * as styles from "./AppFrame.css";
import { Badge } from "./Badge";
import { Button } from "./Button";
import { StatusLight } from "./StatusLight";
import * as statusLight from "./StatusLight.css";
import { Tooltip, TooltipTrigger } from "./Tooltip";

const topInsetName = cssVarName(frame.topInset);

const saveLabels = {
  saving: "components:appFrame.saving",
  saved: "components:appFrame.saved",
  "save-failed": "components:appFrame.saveFailed",
} as const;

/**
 * On a phone, ← and where it leads: a link ("Validation", "Plan", "Self Analysis",
 * "Ideas"), or a press that does something, as ← More opening the More menu again on
 * 7・4・9・26 (`useMoreMenu`). `menu` makes it a menu button: it reads that it opens one
 * and whether it is open, and ↓ / ↑ open it on its first or last item.
 */
export type AppFrameBack =
  | { label: string; href: string; onPress?: never; menu?: never }
  | {
      label: string;
      href?: never;
      onPress: (event: PressEvent) => void;
      menu?: { isOpen: boolean; open: (focus: "first" | "last") => void };
    };

export interface AppFrameProps {
  /** The `SideNav`: tablet and wider. */
  sideNav: ReactNode;
  /** The `TabBar`: phone. */
  tabBar: ReactNode;
  /** The `Breadcrumbs` (tablet and wider): "Ideas / Piaya Gift Box / 05 Costs". */
  breadcrumbs?: ReactNode;
  /** On a phone, ← and where it leads (`AppFrameBack`). */
  back?: AppFrameBack;
  /**
   * On a phone, the title of a screen the TabBar opens, which has no ←: "Ideas",
   * "Notifications". With `onPress`, it is a button with ▾: 5's workspace, which opens M7
   * (6.0.1). The screens the More menu opens have ← More instead (`useMoreMenu`).
   */
  title?: { label: string; onPress?: () => void };
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
   * body narrower than `layout.two-column-min-width`, patterns A, D and F inside take their
   * tablet arrangement, and narrower than `layout.presentation.two-column-min-width`,
   * pattern I its phone arrangement (design-spec 4.1).
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
  title,
  saveState,
  onRetrySave,
  comments,
  history,
  banners,
  panel,
  children,
}: AppFrameProps) {
  const { t } = useTranslation(["components"]);
  const isNarrow = useIsNarrow();
  const mainId = useId();
  const mainRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const headerStartRef = useRef<HTMLDivElement>(null);
  const saveProbeRef = useRef<HTMLSpanElement>(null);
  const [saveLabelFits, setSaveLabelFits] = useState(true);
  const bodyWidthRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [room, setRoom] = useState<BodyRoom>(fullBodyRoom);
  const [tools, setTools] = useState<HTMLElement | null>(null);
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  // A pattern's ← on a phone (a list's detail), in place of the screen's `back`.
  const [backOverride, setBackOverride] = useState<BackTarget | null>(null);
  const hasHeader =
    breadcrumbs !== undefined ||
    back !== undefined ||
    title !== undefined ||
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

  // On a phone "Saving…" and "Saved" show when the header has room for them beside ← and
  // its label (or the title) without cutting those; otherwise the mark alone (4.3・6.0.1).
  // Measured before the header is first painted and whenever what its start holds
  // changes; then again when the header, its start or the label change size, or a face
  // loads. A change seen by the observer is applied in the next frame: applied within
  // the observer's round, the label resizes the observed start after the label's copy,
  // which lies deeper, and the browser ends the round with an error.
  const measuresSaveLabel = isNarrow && saveState !== undefined;
  const headerStartShape = [
    backOverride !== null ? "list" : back !== undefined ? "back" : "title",
    title?.onPress !== undefined ? "button" : "text",
    backOverride?.label ?? back?.label ?? title?.label ?? "",
  ].join(":");
  // biome-ignore lint/correctness/useExhaustiveDependencies: what the start of the header holds changes the widths to measure.
  useLayoutEffect(() => {
    const header = headerRef.current;
    const start = headerStartRef.current;
    const probe = saveProbeRef.current;
    if (
      !measuresSaveLabel ||
      !header ||
      !start ||
      !probe ||
      typeof ResizeObserver === "undefined"
    ) {
      return;
    }
    const measure = () => {
      const startBox = start.getBoundingClientRect();
      // Where ← and its label (or the title) end, and how much of them "…" cuts.
      let end = startBox.left;
      for (const child of start.children) {
        const box = child.getBoundingClientRect();
        if (box.width > 0) end = Math.max(end, box.right);
      }
      let cut = 0;
      for (const text of start.querySelectorAll<HTMLElement>(
        `.${styles.backLabel}, .${styles.title}`,
      )) {
        // The laid-out contents past the box "…" cuts them to, exactly: scrollWidth
        // rounds a cut of under a pixel away, though "…" is drawn.
        const contents = document.createRange();
        contents.selectNodeContents(text);
        const style = getComputedStyle(text);
        const inner =
          text.getBoundingClientRect().width -
          Number.parseFloat(style.paddingInlineStart) -
          Number.parseFloat(style.paddingInlineEnd);
        cut += Math.max(0, contents.getBoundingClientRect().width - inner);
      }
      const free = startBox.right - end;
      const overflow = header.scrollWidth - header.clientWidth;
      const room = probe.getBoundingClientRect().width;
      // The label shows only where its whole width is free; showing it then leaves the
      // start as much room as it needs, so it does not flip back.
      return (shown: boolean) =>
        cut < 0.01 && overflow < 1 && free >= (shown ? 0 : room);
    };
    const apply = () => flushSync(() => setSaveLabelFits(measure()));
    let frame = 0;
    const nextFrame = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    // A state set here is rendered before the header is painted.
    setSaveLabelFits(measure());
    const observer = new ResizeObserver(nextFrame);
    observer.observe(header);
    observer.observe(start);
    observer.observe(probe);
    document.fonts?.addEventListener("loadingdone", apply);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", apply);
    };
  }, [measuresSaveLabel, saveState, headerStartShape]);
  const showsSaveLabel =
    !measuresSaveLabel || saveState === "save-failed" || saveLabelFits;

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
      const isDocked = column.getBoundingClientRect().width > 0;
      const width = body.getBoundingClientRect().width + scrollbar;
      const hasTwoColumns = !isDocked || width >= twoColumnMinWidth;
      const hasThumbnails = !isDocked || width >= presentationTwoColumnMinWidth;
      flushSync(() =>
        setRoom((current) =>
          current.hasTwoColumns === hasTwoColumns &&
          current.hasThumbnails === hasThumbnails
            ? current
            : { hasTwoColumns, hasThumbnails },
        ),
      );
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
        {t("components:appFrame.skipToContent")}
      </a>
      {sideNav}
      <div className={styles.column}>
        {hasHeader && (
          <header ref={headerRef} className={styles.header}>
            <div ref={headerStartRef} className={styles.headerStart}>
              {backOverride !== null ? (
                <AriaButton
                  aria-label={t("components:appFrame.back", {
                    label: backOverride.label,
                  })}
                  onPress={backOverride.onPress}
                  className={styles.back}
                >
                  <IconSlot size="nav">
                    <ArrowLeft />
                  </IconSlot>
                  <span className={styles.backLabel}>{backOverride.label}</span>
                </AriaButton>
              ) : back?.href !== undefined ? (
                <AriaLink
                  href={back.href}
                  aria-label={t("components:appFrame.back", {
                    label: back.label,
                  })}
                  className={styles.back}
                >
                  <IconSlot size="nav">
                    <ArrowLeft />
                  </IconSlot>
                  <span className={styles.backLabel}>{back.label}</span>
                </AriaLink>
              ) : (
                back !== undefined && (
                  <AriaButton
                    aria-label={t("components:appFrame.back", {
                      label: back.label,
                    })}
                    aria-haspopup={back.menu !== undefined ? "menu" : undefined}
                    aria-expanded={back.menu?.isOpen}
                    // A press focuses the button where the browser does not (Safari), so
                    // a menu it opens has a button to give focus back to.
                    onPressStart={(event) => {
                      if (event.target instanceof HTMLElement)
                        event.target.focus();
                    }}
                    onPress={back.onPress}
                    // A menu button opens on ↓ and ↑ as well (as React Aria's
                    // MenuTrigger does for More). Other keys go on to the page.
                    onKeyDown={(event) => {
                      const menu = back.menu;
                      if (menu !== undefined && event.key === "ArrowDown") {
                        menu.open("first");
                      } else if (
                        menu !== undefined &&
                        event.key === "ArrowUp"
                      ) {
                        menu.open("last");
                      } else {
                        event.continuePropagation();
                        return;
                      }
                      event.preventDefault();
                    }}
                    className={styles.back}
                  >
                    <IconSlot size="nav">
                      <ArrowLeft />
                    </IconSlot>
                    <span className={styles.backLabel}>{back.label}</span>
                  </AriaButton>
                )
              )}
              {backOverride === null &&
                back === undefined &&
                title !== undefined &&
                (title.onPress === undefined ? (
                  <span className={styles.title}>{title.label}</span>
                ) : (
                  <AriaButton
                    aria-label={t("components:nav.workspace", {
                      name: title.label,
                    })}
                    onPress={title.onPress}
                    className={`${styles.title} ${styles.titleButton}`}
                  >
                    {title.label}
                    <IconSlot size="XS">
                      <ChevronDown />
                    </IconSlot>
                  </AriaButton>
                ))}
              {breadcrumbs}
            </div>
            <div className={styles.tools}>
              <div ref={setTools} className={styles.patternTools} />
              {saveState !== undefined && (
                <div className={styles.saveState}>
                  <StatusLight variant={saveState} role="status">
                    <span
                      className={
                        showsSaveLabel ? undefined : styles.saveLabelHidden
                      }
                    >
                      {t(saveLabels[saveState])}
                    </span>
                  </StatusLight>
                  {measuresSaveLabel && saveState !== "save-failed" && (
                    <span className={styles.saveProbeBox}>
                      <span
                        ref={saveProbeRef}
                        aria-hidden="true"
                        className={`${statusLight.root.M} ${styles.saveProbe}`}
                      >
                        {t(saveLabels[saveState])}
                      </span>
                    </span>
                  )}
                  {saveState === "save-failed" && onRetrySave && (
                    <Button variant="secondary" size="S" onPress={onRetrySave}>
                      {t("components:appFrame.retry")}
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
                          ? t("components:appFrame.commentsUnresolved", {
                              count: comments.count,
                              formatted: formatCount(comments.count),
                            })
                          : t("components:appFrame.comments")
                      }
                      aria-expanded={comments.isOpen}
                      onPress={comments.onPress}
                    >
                      <MessageSquare />
                    </ActionButton>
                    <Tooltip placement="bottom">
                      {t("components:appFrame.comments")}
                    </Tooltip>
                  </TooltipTrigger>
                  {comments.count > 0 && (
                    // The count of unresolved threads: the small ink tag over the
                    // icon (moon-base.css .iconbtn .badge). The button's name reads it.
                    <span aria-hidden="true" className={styles.commentsCount}>
                      <Badge fillStyle="bold">
                        {formatCount(comments.count)}
                      </Badge>
                    </span>
                  )}
                </span>
              )}
              {history !== undefined && (
                <TooltipTrigger>
                  <ActionButton
                    isQuiet
                    aria-label={t("components:appFrame.history")}
                    aria-expanded={history.isOpen}
                    onPress={history.onPress}
                  >
                    <History />
                  </ActionButton>
                  <Tooltip placement="bottom">
                    {t("components:appFrame.history")}
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
                <BodyRoomContext.Provider value={room}>
                  {children}
                </BodyRoomContext.Provider>
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
