import { formatCount } from "@moonx/i18n";
import type { QuestionCardMode } from "@moonx/ui-tokens";
import { MessageSquare, TriangleAlert } from "lucide-react";
import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button, VisuallyHidden } from "react-aria-components";
import { useTranslation } from "react-i18next";
import { AnswerFieldContext } from "../internal/answerField";
import { IconSlot } from "../internal/IconSlot";
import type { MoonState } from "../internal/MoonMark";
import * as moonStyles from "../internal/moon.css";
import { scrollToFocusAnchor } from "../internal/scrollToFocusAnchor";
import { narrowQuery } from "../styles/helpers";
import { MoonGlyph } from "./MoonGlyph";
import * as styles from "./QuestionCard.css";

/**
 * Whether `element` is a field that takes an answer: a text field or a choice (a native
 * radio or checkbox), not read-only (a Viewer's) or disabled. The F/A/U buttons are
 * buttons, not answers.
 */
function isAnswerField(element: EventTarget): boolean {
  if (
    !(
      element instanceof HTMLTextAreaElement ||
      (element instanceof HTMLInputElement && element.type !== "hidden")
    )
  ) {
    return false;
  }
  // React Aria marks a read-only choice on its group, not on its inputs.
  return (
    !element.readOnly &&
    !element.disabled &&
    element.closest('[aria-readonly="true"], [aria-disabled="true"]') === null
  );
}

/** The answer's field: what a pressed quiet card focuses once open. */
const ANSWER =
  'textarea:not([disabled]), input:not([type="hidden"]):not([disabled])';

export interface QuestionCardProps {
  /** The question's title as the template writes it ("WHO"), set small and monospaced. */
  title: string;
  /** The question itself ("Who exactly is the customer?"). */
  question: ReactNode;
  /**
   * `focused`: the question being answered, framed, with everything open. `open`: every
   * question open without the frame (the Focus switch off, a Viewer). `quiet`: a question
   * not being answered, its title, the start of the answer, F/A/U and comments, a little
   * quieter (design-spec 4.1 C).
   */
  mode: QuestionCardMode;
  /**
   * The answer's F/A/U (validation only; self-analysis has none): its mark at the start of
   * a quiet card, and its label (`useFauLabel`).
   */
  status?: {
    state: MoonState;
    label: string;
    /** A Fact without evidence: the label carries a warning (design-spec 6.0.3). */
    isWarning?: boolean;
  };
  /** A quiet card's excerpt: the answer's start, or null for "Empty". */
  excerpt?: string | null;
  /** A quiet card's number of comments; none shows nothing. @default 0 */
  commentCount?: number;
  /** An open card's tools at the end of its header (💬 🕘). */
  actions?: ReactNode;
  /** An open card's content under the question: the answer field, F/A/U, EXAMPLE, Hint. */
  children?: ReactNode;
  /**
   * A quiet card was pressed or reached with Tab: the screen makes it the focused one.
   * Its answer's field (a text field, or the first choice) then takes focus.
   */
  onFocusRequest?: () => void;
  /** The title's level in the page outline. @default 2 */
  headingLevel?: 2 | 3 | 4;
  id?: string;
}

/** The warning beside "Fact · No evidence", as FauPicker's (its label says why). */
function Warning() {
  return (
    <span className={styles.warning}>
      <IconSlot size="XS">
        <TriangleAlert />
      </IconSlot>
    </span>
  );
}

/**
 * One question of 11 and 21 (design-spec 4.1 C・4.5・6.2). Focus coming into a card scrolls
 * it to the middle of the view (06 layout.focus-anchor).
 */
export function QuestionCard({
  title,
  question,
  mode,
  status,
  excerpt = null,
  commentCount = 0,
  actions,
  children,
  onFocusRequest,
  headingLevel = 2,
  id,
}: QuestionCardProps) {
  const { t } = useTranslation(["components"]);
  const titleId = useId();
  const metaId = useId();
  const excerptId = useId();
  const ref = useRef<HTMLElement>(null);
  const Heading = `h${headingLevel}` as const;
  // Pressed while quiet: once open, its first input takes focus.
  const focusOnOpen = useRef(false);

  useEffect(() => {
    if (mode === "quiet" || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    ref.current?.querySelector<HTMLElement>(ANSWER)?.focus();
  }, [mode]);

  // Entering an answer's field moves its question to the middle (4.1 C), in the focused
  // card and with every question open alike. A read-only answer (a Viewer's) is no field
  // to enter, so it moves nothing (6.2). Nor does a phone's (6.2「設問の入力欄に入る
  // （Web）」): one question at a time sits under the section's description, which the
  // move would hide under the header, and a field keeps itself above the keyboard
  // (useKeepAboveKeyboard, 4.3), in a list of questions too.
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (
      mode !== "quiet" &&
      isAnswerField(event.target) &&
      !window.matchMedia(narrowQuery).matches
    ) {
      scrollToFocusAnchor(event.currentTarget, event.target);
    }
  };
  // Entering a quiet question, by a press or by Tab, opens it with its answer focused.
  const enter = () => {
    focusOnOpen.current = true;
    onFocusRequest?.();
  };

  if (mode === "quiet") {
    return (
      <section
        ref={ref}
        id={id}
        aria-labelledby={titleId}
        className={styles.quiet}
      >
        {status !== undefined && (
          <span className={styles.glyph}>
            <MoonGlyph state={status.state} />
          </span>
        )}
        <div className={styles.quietText}>
          <Heading className={`${styles.title} ${styles.quietTitle}`}>
            <Button
              id={titleId}
              aria-describedby={`${metaId} ${excerptId}`}
              onPress={enter}
              onFocus={enter}
              className={styles.press}
            >
              {title}
            </Button>
          </Heading>
          <p
            id={excerptId}
            className={excerpt === null ? styles.emptyExcerpt : styles.excerpt}
          >
            {excerpt ?? t("components:questionCard.empty")}
          </p>
        </div>
        <span id={metaId} className={styles.meta}>
          {/* An empty answer says "Empty" once, where its text would be. */}
          {status !== undefined && status.state !== "empty" && (
            <span className={moonStyles.labelColor[status.state]}>
              {status.label}
            </span>
          )}
          {status?.isWarning === true && <Warning />}
          {commentCount > 0 && (
            <span className={styles.comments}>
              <IconSlot size="XS">
                <MessageSquare />
              </IconSlot>
              <span aria-hidden="true">{formatCount(commentCount)}</span>
              <VisuallyHidden>
                {t("components:questionCard.comments", {
                  count: commentCount,
                  formatted: formatCount(commentCount),
                })}
              </VisuallyHidden>
            </span>
          )}
        </span>
      </section>
    );
  }

  return (
    <section
      ref={ref}
      id={id}
      aria-labelledby={titleId}
      onFocus={onFocus}
      className={mode === "focused" ? styles.focused : styles.open}
    >
      <div className={styles.header}>
        <Heading id={titleId} className={styles.title}>
          {title}
        </Heading>
        {status !== undefined && (
          <span className={styles.status}>
            <MoonGlyph state={status.state} size="S" />
            <span className={moonStyles.labelColor[status.state]}>
              {status.label}
            </span>
            {status.isWarning === true && <Warning />}
          </span>
        )}
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </div>
      <p className={styles.question}>{question}</p>
      {children != null && (
        <div className={styles.body}>
          <AnswerFieldContext.Provider value={true}>
            {children}
          </AnswerFieldContext.Provider>
        </div>
      )}
    </section>
  );
}
