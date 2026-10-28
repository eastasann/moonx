import { formatCount } from "@moonx/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useLayoutEffect, useRef } from "react";
import { ListBox, ListBoxItem } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { ActionButton } from "../components/ActionButton";
import { Skeleton } from "../components/Skeleton";
import { useThumbnailColumn } from "../internal/frame";
import * as deck from "./PresentationPattern.css";
import * as styles from "./patterns.css";

/** A slide of the deck: its thumbnail in the column on the left. */
export interface PresentationSlide {
  id: string;
  /** Its type's name under the thumbnail ("Business model"). */
  title: string;
  /** The slide drawn small: a `Slide` with `isThumbnail`. */
  thumbnail: ReactNode;
}

export interface PresentationPatternProps {
  /** The title: its level 1 Heading, `heading-1-toolbar`. */
  header: ReactNode;
  /** The deck's tools after the title: One-minute / Five-minute, the version to show. */
  tools?: ReactNode;
  /** The main action ("Download PDF"): at the end of the line, beside the tools on a phone. */
  primaryAction?: ReactNode;
  slides: PresentationSlide[];
  currentId: string;
  onCurrentChange: (id: string) => void;
  /** The slide on screen, wide: a `Slide`. */
  slide: ReactNode;
  /**
   * Above the slide's links: what the screen says about the slide or the deck ("Too long
   * for this slide…", a PDF that could not be made).
   */
  notices?: ReactNode;
  /**
   * Over the slide, at its end: quiet links ("Edit source", "Edit in validation") and the
   * slide's 💬, a quiet ActionButton.
   */
  slideTools?: ReactNode;
  /** What to say (§30), under the slide: its heading and its text. */
  notes?: ReactNode;
  /**
   * The deck is on its way (another length or version chosen): the thumbnails and the
   * slide show as their skeleton, out of reach, while the tools' line stays in use.
   */
  isLoading?: boolean;
}

/**
 * Pattern I, presentation (design-spec 4.1, s23-deck.html): slides to show and export
 * (23). The tools' line across the top. Desktop and tablet: the thumbnails down the left,
 * numbered, the slide on the right with the notes under it. Phone, and a desktop whose
 * docked panel leaves the body too narrow: the slide on screen alone, the previous and
 * next under it, then the notes.
 */
export function PresentationPattern({
  header,
  tools,
  primaryAction,
  slides,
  currentId,
  onCurrentChange,
  slide,
  notices,
  slideTools,
  notes,
  isLoading = false,
}: PresentationPatternProps) {
  const { t } = useTranslation(["components"]);
  const hasThumbnails = useThumbnailColumn();
  const index = Math.max(
    0,
    slides.findIndex((item) => item.id === currentId),
  );
  const previous = slides[index - 1];
  const next = slides[index + 1];
  const nav = useRef<HTMLDivElement | null>(null);
  // Reaching the first or the last slide disables the button just pressed: focus goes to
  // the other one instead of falling to the page.
  const move = (to: PresentationSlide, other: "first" | "last") => {
    onCurrentChange(to.id);
    const position = slides.indexOf(to);
    if (position !== 0 && position !== slides.length - 1) return;
    const buttons = nav.current?.querySelectorAll("button");
    buttons?.[other === "first" ? 0 : buttons.length - 1]?.focus();
  };

  // Changing arrangement takes away the thumbnails or the previous and next, and focus in
  // them goes to what replaces them: the first of the previous and next that can be
  // pressed (the slide's column when neither can, in a deck of one slide), or the slide on
  // screen's thumbnail. Whether the part held focus is noted as it leaves the page, while
  // focus is still in it, and the note is used or dropped once the page is drawn. Each
  // leaving writes the note, as Strict Mode also detaches and attaches a new part's ref.
  const thumbnails = useRef<HTMLDivElement | null>(null);
  const stageColumn = useRef<HTMLDivElement>(null);
  const leaving = useRef<"thumbnails" | "nav" | null>(null);
  const thumbnailsRef = useCallback((element: HTMLDivElement) => {
    thumbnails.current = element;
    return () => {
      leaving.current = element.contains(document.activeElement)
        ? "thumbnails"
        : null;
      thumbnails.current = null;
    };
  }, []);
  const navRef = useCallback((element: HTMLDivElement) => {
    nav.current = element;
    return () => {
      leaving.current = element.contains(document.activeElement) ? "nav" : null;
      nav.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    const part = leaving.current;
    leaving.current = null;
    const isLost = () =>
      document.activeElement === null ||
      document.activeElement === document.body;
    if (part === "thumbnails" && isLost()) {
      (
        nav.current?.querySelector<HTMLElement>("button:not(:disabled)") ??
        stageColumn.current
      )?.focus();
    }
    if (part === "nav") {
      // React Aria draws a new ListBox's options a render later, in the same task.
      queueMicrotask(() => {
        if (!isLost()) return;
        thumbnails.current
          ?.querySelector<HTMLElement>('[aria-selected="true"]')
          ?.focus();
      });
    }
  });

  return (
    <div className={styles.root} aria-busy={isLoading || undefined}>
      <div className={styles.deckBar}>
        <div className={styles.deckTitle}>{header}</div>
        {tools}
        {primaryAction != null && (
          <div className={styles.deckAction}>{primaryAction}</div>
        )}
      </div>
      <Skeleton isLoading={isLoading}>
        <div className={styles.presentation}>
          {hasThumbnails && (
            <>
              <div ref={thumbnailsRef} className={styles.thumbnails}>
                <ListBox
                  aria-label={t("components:presentationPattern.slides")}
                  items={slides.map((item, position) => ({
                    ...item,
                    position,
                  }))}
                  selectionMode="single"
                  disallowEmptySelection
                  selectedKeys={[currentId]}
                  onSelectionChange={(keys) => {
                    if (keys === "all") return;
                    const [key] = [...keys];
                    if (key !== undefined) onCurrentChange(String(key));
                  }}
                  className={deck.list}
                >
                  {(item) => (
                    // Named by its number and title, the text on screen: the small slide
                    // inside is a picture of the slide, not read out. Typing a title
                    // finds its slide.
                    <ListBoxItem
                      id={item.id}
                      textValue={item.title}
                      className={deck.item}
                    >
                      <span className={deck.number}>
                        {formatCount(item.position + 1)}
                      </span>
                      <span aria-hidden="true" className={deck.mini}>
                        {item.thumbnail}
                      </span>
                      <span className={deck.caption}>{item.title}</span>
                    </ListBoxItem>
                  )}
                </ListBox>
              </div>
              <div aria-hidden="true" className={styles.thumbnailRule} />
            </>
          )}
          <div className={styles.stage}>
            <div ref={stageColumn} tabIndex={-1} className={styles.stageColumn}>
              {notices != null && (
                <div className={styles.slideNotices}>{notices}</div>
              )}
              {slideTools != null && (
                <div className={styles.slideTools}>{slideTools}</div>
              )}
              {slide}
              {!hasThumbnails && (
                <div ref={navRef} className={styles.slideNav}>
                  <ActionButton
                    aria-label={t("components:presentationPattern.previous")}
                    isDisabled={previous === undefined}
                    onPress={() => previous && move(previous, "last")}
                  >
                    <ChevronLeft />
                  </ActionButton>
                  <span aria-live="polite" className={styles.slidePosition}>
                    {t("components:presentationPattern.position", {
                      number: formatCount(index + 1),
                      total: formatCount(slides.length),
                    })}
                  </span>
                  <ActionButton
                    aria-label={t("components:presentationPattern.next")}
                    isDisabled={next === undefined}
                    onPress={() => next && move(next, "first")}
                  >
                    <ChevronRight />
                  </ActionButton>
                </div>
              )}
              {notes != null && <div className={styles.notes}>{notes}</div>}
            </div>
          </div>
        </div>
      </Skeleton>
    </div>
  );
}
