import { formatCount, i18n } from "@moonx/i18n";
import type { QuestionCardMode } from "@moonx/ui-tokens";
import { MessageSquare } from "lucide-react";
import {
  type FocusEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button, VisuallyHidden } from "react-aria-components";
import { IconSlot } from "../internal/IconSlot";
import type { MoonState } from "../internal/MoonMark";
import { scrollToFocusAnchor } from "../internal/scrollToFocusAnchor";
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
   * a quiet card, and its label (`fauLabel`).
   */
  status?: { state: MoonState; label: string };
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
  // to enter, so it moves nothing (6.2).
  const onFocus = (event: FocusEvent<HTMLElement>) => {
    if (mode !== "quiet" && isAnswerField(event.target)) {
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
        <div className={styles.quietHeader}>
          {status !== undefined && (
            <span className={styles.glyph}>
              <MoonGlyph state={status.state} />
            </span>
          )}
          <Heading className={styles.title}>
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
          <span id={metaId} className={styles.meta}>
            {status !== undefined && <span>{status.label}</span>}
            {commentCount > 0 && (
              <span className={styles.comments}>
                <IconSlot size="XS">
                  <MessageSquare />
                </IconSlot>
                <span aria-hidden="true">{formatCount(commentCount)}</span>
                <VisuallyHidden>
                  {i18n.t("components:questionCard.comments", {
                    count: commentCount,
                    formatted: formatCount(commentCount),
                  })}
                </VisuallyHidden>
              </span>
            )}
          </span>
        </div>
        <p
          id={excerptId}
          className={excerpt === null ? styles.emptyExcerpt : styles.excerpt}
        >
          {excerpt ?? i18n.t("components:questionCard.empty")}
        </p>
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
            <MoonGlyph state={status.state} />
            <span>{status.label}</span>
          </span>
        )}
        {actions != null && <div className={styles.actions}>{actions}</div>}
      </div>
      <p className={styles.question}>{question}</p>
      {children != null && <div className={styles.body}>{children}</div>}
    </section>
  );
}
