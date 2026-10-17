import { formatCount, i18n } from "@moonx/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { ListBox, ListBoxItem } from "react-aria-components";
import { ActionButton } from "../components/ActionButton";
import { useIsNarrow } from "../internal/useIsNarrow";
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
  /** Over the slide, at its end: quiet links ("Edit source", "Edit in validation", 💬). */
  slideTools?: ReactNode;
  /** What to say (§30), under the slide: its heading and its text. */
  notes?: ReactNode;
}

/**
 * Pattern I, presentation (design-spec 4.1, s23-deck.html): slides to show and export
 * (23). The tools' line across the top. Desktop and tablet: the thumbnails down the left,
 * numbered, the slide on the right with the notes under it. Phone: the slide on screen
 * alone, the previous and next under it, then the notes.
 */
export function PresentationPattern({
  header,
  tools,
  primaryAction,
  slides,
  currentId,
  onCurrentChange,
  slide,
  slideTools,
  notes,
}: PresentationPatternProps) {
  const isNarrow = useIsNarrow();
  const index = Math.max(
    0,
    slides.findIndex((item) => item.id === currentId),
  );
  const previous = slides[index - 1];
  const next = slides[index + 1];
  const nav = useRef<HTMLDivElement>(null);
  // Reaching the first or the last slide disables the button just pressed: focus goes to
  // the other one instead of falling to the page.
  const move = (to: PresentationSlide, other: "first" | "last") => {
    onCurrentChange(to.id);
    const position = slides.indexOf(to);
    if (position !== 0 && position !== slides.length - 1) return;
    const buttons = nav.current?.querySelectorAll("button");
    buttons?.[other === "first" ? 0 : buttons.length - 1]?.focus();
  };
  return (
    <div className={styles.root}>
      <div className={styles.deckBar}>
        <div className={styles.deckTitle}>{header}</div>
        {tools}
        {primaryAction != null && (
          <div className={styles.deckAction}>{primaryAction}</div>
        )}
      </div>
      <div className={styles.presentation}>
        {!isNarrow && (
          <>
            <div className={styles.thumbnails}>
              <ListBox
                aria-label={i18n.t("components:presentationPattern.slides")}
                items={slides.map((item, position) => ({ ...item, position }))}
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
          <div className={styles.stageColumn}>
            {slideTools != null && (
              <div className={styles.slideTools}>{slideTools}</div>
            )}
            {slide}
            {isNarrow && (
              <div ref={nav} className={styles.slideNav}>
                <ActionButton
                  aria-label={i18n.t("components:presentationPattern.previous")}
                  isDisabled={previous === undefined}
                  onPress={() => previous && move(previous, "last")}
                >
                  <ChevronLeft />
                </ActionButton>
                <span aria-live="polite" className={styles.slidePosition}>
                  {i18n.t("components:presentationPattern.position", {
                    number: formatCount(index + 1),
                    total: formatCount(slides.length),
                  })}
                </span>
                <ActionButton
                  aria-label={i18n.t("components:presentationPattern.next")}
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
    </div>
  );
}
