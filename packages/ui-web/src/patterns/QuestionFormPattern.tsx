import { formatCount } from "@moonx/i18n";
import type { QuestionCardMode } from "@moonx/ui-tokens";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  type KeyboardEvent,
  type ReactNode,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button as AriaButton } from "react-aria-components";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { MoonGlyph } from "../components/MoonGlyph";
import { Switch } from "../components/Switch";
import { Density } from "../internal/Density";
import { BottomBar, useHeaderTools } from "../internal/frame";
import { IconSlot } from "../internal/IconSlot";
import { isMacOS } from "../internal/platform";
import { useIsNarrow } from "../internal/useIsNarrow";
import * as styles from "./patterns.css";

/** Where the Focus switch is kept on the device (4.1 C: "選択は端末に覚えておく"). */
const FOCUS_KEY = "moonx:question-form:focus";

function readFocusMode(): boolean {
  try {
    return window.localStorage.getItem(FOCUS_KEY) !== "off";
  } catch {
    // Storage the browser refuses (a private window's quota) leaves the default: on.
    return true;
  }
}

function storeFocusMode(isOn: boolean) {
  try {
    window.localStorage.setItem(FOCUS_KEY, isOn ? "on" : "off");
  } catch {
    // Kept for this page only when the browser refuses storage; nothing else depends on it.
  }
}

/**
 * What a question takes focus on, in this order: its answer's field, or else its first
 * control (a quiet card's title, a Viewer's 💬).
 */
const ENTRIES = [
  'textarea:not([disabled]):not([readonly]), input:not([type="hidden"]):not([disabled]):not([readonly])',
  'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
];

function focusEntry(card: HTMLElement) {
  for (const selector of ENTRIES) {
    const element = card.querySelector<HTMLElement>(selector);
    if (element) {
      element.focus();
      return;
    }
  }
}

export interface QuestionFormPatternProps {
  /**
   * Above the questions: the section's name (▼ to switch sections), the answered count
   * and the guidance (6.2).
   */
  header: ReactNode;
  /** The ids of the section's questions, in order. */
  questionIds: string[];
  /** The question being answered; null before one is chosen. */
  currentId: string | null;
  /** Another question becomes the current one (phone's ← and →). */
  onCurrentChange: (id: string) => void;
  /**
   * Draws a question as a `QuestionCard` in `mode`: `focused` for the current question
   * with Focus on (and on a phone), `quiet` for the others, `open` for all with Focus
   * off or read-only.
   */
  renderQuestion: (id: string, mode: QuestionCardMode) => ReactNode;
  /** A Viewer's read-only form: every question open, no Focus switch (6.2). */
  isReadOnly?: boolean;
  /**
   * AI ▼ (6.2): from the tablet breakpoint up in the middle of a bar kept at the bottom
   * with a line above it (s11-form.html .footer); on a phone, under its one question.
   */
  footer?: ReactNode;
  /**
   * "← Previous section" at the start of the bottom bar, from the tablet breakpoint up
   * only: a phone moves between sections by the title's ▼ and the section's completion
   * card (4.1 C, 6.2).
   */
  previousSection?: ReactNode;
  /** "Next: 02 Market →" at the end of the bottom bar, as `previousSection`. */
  nextSection?: ReactNode;
  /**
   * On a phone, a dot per question between ← and → (6.2): answered ●, not answered ◌, the
   * current one ringed; pressing one moves to it. Dots that do not fit the bar scroll
   * sideways, the current one kept in view. Without it, no dots.
   */
  isAnswered?: (id: string) => boolean;
  /** → pressed on the last question, on a phone (6.2: the section's completion card). */
  onEnd?: () => void;
  /**
   * On a phone, the section's completion card (6.2) the screen shows once → was pressed on
   * the last question: it takes the question's place and focus, → does nothing more, and
   * ← goes back to the last question. Null while a question is shown; ignored from the
   * tablet breakpoint up, where every question is in the list.
   */
  end?: ReactNode;
}

/**
 * Pattern C, question form (design-spec 4.1 C, s11-form.html): a section's questions (11,
 * 21). Tablet and wider: all the questions in one column between hairlines, the one being
 * answered open and framed in the middle of the view, the others quiet rows; the header's
 * Focus switch opens them all, and Ctrl+↓ / Ctrl+↑ (on macOS also Ctrl+Option+↓ / ↑) move
 * to the next and previous question; the sections' footer stays at the bottom. Phone: the
 * current question alone, with ← and → fixed to the bottom and AI ▼ under it.
 */
export function QuestionFormPattern({
  header,
  questionIds,
  currentId,
  onCurrentChange,
  renderQuestion,
  isReadOnly = false,
  footer,
  previousSection,
  nextSection,
  isAnswered,
  onEnd,
  end,
}: QuestionFormPatternProps) {
  const { t } = useTranslation(["components"]);
  const isNarrow = useIsNarrow();
  const tools = useHeaderTools();
  const [isFocusMode, setFocusMode] = useState(readFocusMode);
  const strip = useRef<HTMLDivElement>(null);
  const endCard = useRef<HTMLLIElement>(null);
  const hasFocus = isFocusMode && !isReadOnly;
  const isAtEnd = isNarrow && end != null;

  // → that showed the card is disabled under the finger: focus moves to the card instead
  // of falling to the page.
  useLayoutEffect(() => {
    if (isAtEnd) endCard.current?.focus();
  }, [isAtEnd]);

  // The phone's dots: the current one stays in view as the questions change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the current question changes
  useLayoutEffect(() => {
    const element = strip.current;
    const dot = element?.querySelector<HTMLElement>("[aria-current]");
    if (!element || !dot) return;
    const start =
      dot.getBoundingClientRect().left -
      element.getBoundingClientRect().left +
      element.scrollLeft;
    element.scrollLeft = start - (element.clientWidth - dot.offsetWidth) / 2;
  }, [currentId, isNarrow]);

  const toggle = (isOn: boolean) => {
    setFocusMode(isOn);
    storeFocusMode(isOn);
  };
  // The switch is for wider screens (6.2 "Focus スイッチ（Web）"): a phone shows one
  // question at a time either way.
  const focusSwitch =
    isReadOnly || isNarrow ? null : (
      <span className={styles.focusTool}>
        <Switch
          isSelected={isFocusMode}
          onChange={toggle}
          labelPosition="start"
        >
          {t("components:questionFormPattern.focus")}
        </Switch>
      </span>
    );

  // Ctrl+↓ / Ctrl+↑ (4.1 C): the next or previous question takes focus as Tab would
  // bring it there, so a quiet card opens with its answer focused and moves to the middle.
  // macOS keeps Ctrl+arrows for Mission Control and App Exposé, so there Ctrl+Option+
  // arrows move too; elsewhere Ctrl+Alt+arrows are left alone, as graphics drivers turn
  // the screen with them.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (
      isNarrow ||
      !event.ctrlKey ||
      (event.altKey && !isMacOS()) ||
      event.metaKey ||
      event.shiftKey ||
      (event.key !== "ArrowDown" && event.key !== "ArrowUp") ||
      // Keys from an overlay opened by a question (F/A/U, a hint) are the overlay's.
      !event.currentTarget.contains(event.target as Node)
    ) {
      return;
    }
    const cards = [
      ...event.currentTarget.querySelectorAll<HTMLElement>("[data-question]"),
    ];
    const from = cards.findIndex((card) => card.contains(event.target as Node));
    const to =
      event.key === "ArrowDown"
        ? from + 1
        : from === -1
          ? cards.length - 1
          : from - 1;
    const card = cards[to];
    if (card === undefined) return;
    event.preventDefault();
    focusEntry(card);
  };

  const index = Math.max(
    0,
    currentId === null ? 0 : questionIds.indexOf(currentId),
  );
  const shown = isAtEnd
    ? []
    : isNarrow
      ? questionIds.slice(index, index + 1)
      : questionIds;
  const previous = isAtEnd ? questionIds.at(-1) : questionIds[index - 1];
  const next = isAtEnd ? undefined : questionIds[index + 1];
  const modeOf = (id: string): QuestionCardMode => {
    if (isReadOnly) return "open";
    if (isNarrow) return "focused";
    if (!hasFocus) return "open";
    return id === currentId ? "focused" : "quiet";
  };

  // One tree at every width, each question keyed by its id, so turning a phone sideways
  // keeps the card being typed in (and its keyboard) instead of drawing it again.
  return (
    <Density density="spacious">
      {/* The keys reach this container from the fields and buttons inside it. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: it only listens to its children's keys */}
      <div className={styles.root} onKeyDown={onKeyDown}>
        {focusSwitch !== null &&
          tools !== null &&
          createPortal(focusSwitch, tools)}
        <div className={styles.questionPage}>
          <div className={`${styles.headerRow} ${styles.questionHeader}`}>
            <div className={styles.headerTitle}>{header}</div>
            {focusSwitch !== null && tools === null && (
              <div className={styles.inlineTools}>{focusSwitch}</div>
            )}
          </div>
          <ol className={styles.questions}>
            {shown.map((id) => (
              <li key={id} data-question={id} className={styles.question}>
                {renderQuestion(id, modeOf(id))}
              </li>
            ))}
            {isAtEnd && (
              <li ref={endCard} tabIndex={-1} className={styles.question}>
                {end}
              </li>
            )}
          </ol>
          {footer != null && isNarrow && (
            <div className={styles.sectionFooter}>{footer}</div>
          )}
        </div>
        {!isNarrow &&
          (footer != null ||
            previousSection != null ||
            nextSection != null) && (
            <BottomBar variant="footer">
              {/* Empty places keep AI ▼ in the middle and next at the end. */}
              <span className={styles.sectionStep}>{previousSection}</span>
              {footer}
              <span className={styles.sectionStep}>{nextSection}</span>
            </BottomBar>
          )}
        {isNarrow && (
          <BottomBar variant="navigation">
            <AriaButton
              aria-label={t("components:questionFormPattern.previous")}
              isDisabled={previous === undefined}
              onPress={() => previous && onCurrentChange(previous)}
              className={styles.questionArrow}
            >
              <IconSlot size="nav">
                <ArrowLeft />
              </IconSlot>
            </AriaButton>
            <div ref={strip} className={styles.barMiddle}>
              {isAnswered !== undefined && (
                <div className={styles.barStrip}>
                  {questionIds.map((id, index) => {
                    const answered = isAnswered(id);
                    return (
                      <AriaButton
                        key={id}
                        aria-label={t(
                          answered
                            ? "components:questionFormPattern.dotAnswered"
                            : "components:questionFormPattern.dot",
                          {
                            number: formatCount(index + 1),
                            total: formatCount(questionIds.length),
                          },
                        )}
                        aria-current={
                          id === currentId && !isAtEnd ? "step" : undefined
                        }
                        onPress={() => onCurrentChange(id)}
                        className={styles.questionDot}
                      >
                        <MoonGlyph
                          state={answered ? "done" : "empty"}
                          size="S"
                          isCurrent={id === currentId}
                        />
                      </AriaButton>
                    );
                  })}
                </div>
              )}
            </div>
            <AriaButton
              aria-label={t("components:questionFormPattern.next")}
              isDisabled={
                isAtEnd || (next === undefined && onEnd === undefined)
              }
              onPress={() => (next ? onCurrentChange(next) : onEnd?.())}
              className={styles.questionArrow}
            >
              <IconSlot size="nav">
                <ArrowRight />
              </IconSlot>
            </AriaButton>
          </BottomBar>
        )}
      </div>
    </Density>
  );
}
