import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef } from "react";
import { Button } from "react-aria-components";
import {
  answer as answerClass,
  answerEmpty,
  body,
  compact,
  header,
  prompt as promptClass,
  root,
  side,
  title as titleClass,
} from "./QuestionCard.css";
import { useFocusAnchor } from "./useFocusAnchor";

export interface QuestionCardProps {
  /** Question title, such as "BEHAVIOR". */
  title: string;
  /** Question text. Shown only while the card is focused. */
  prompt?: string;
  /** The card showing its full body. Becoming focused scrolls it to the focus anchor. */
  isFocused: boolean;
  /** Start of the saved answer, shown in the compact form. Empty or missing shows `emptyLabel`. */
  answer?: string;
  /** Text for an unanswered question ("Empty"). */
  emptyLabel: string;
  /** F/A/U label and confidence, shown in both forms. */
  status?: ReactNode;
  /** Comment count and similar markers, shown in both forms. */
  meta?: ReactNode;
  /** Header controls shown only while focused, such as the comment and history buttons. */
  actions?: ReactNode;
  /** The focused body: answer field, EXAMPLE, hint and F/A/U controls. */
  children?: ReactNode;
  /**
   * Called when the user moves into the card (pressing the compact form or focusing anything
   * inside). May fire more than once for one gesture, so the handler must be idempotent.
   */
  onFocusRequest?: () => void;
  /** Called for Ctrl+ArrowDown (`next`) and Ctrl+ArrowUp (`previous`) from anywhere in the card. */
  onNavigate?: (direction: "previous" | "next") => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * One question of the question form (layout pattern C). The focused card is open with its input
 * controls, the others show only the title, the start of the answer and their labels.
 *
 * The root element carries `data-question-card` and `data-focused="true|false"`. This is the
 * selector contract for layouts: below `semantic.breakpoint.tablet` a layout shows one question
 * per screen by hiding `[data-question-card][data-focused="false"]`. The card does not hide
 * itself, so a layout that wants every card on narrow screens simply omits that rule.
 *
 * Swapping between the compact and the open form replaces the DOM, which drops keyboard focus
 * to `body`. When `isFocused` turns true while nothing holds focus, focus moves to the first
 * focusable element of the body, or to the group if there is none, so Ctrl+ArrowUp/Down keep
 * working. Focus already on another element is left alone, and a card that mounts focused does
 * not take focus.
 */
export function QuestionCard({
  title,
  prompt,
  isFocused,
  answer,
  emptyLabel,
  status,
  meta,
  actions,
  children,
  onFocusRequest,
  onNavigate,
}: QuestionCardProps) {
  const ref = useFocusAnchor<HTMLDivElement>(isFocused);
  const titleId = useId();
  const groupRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasFocused = useRef(isFocused);
  const hasAnswer = answer !== undefined && answer.trim() !== "";

  useEffect(() => {
    const was = wasFocused.current;
    wasFocused.current = isFocused;
    if (!isFocused || was) return;
    const group = groupRef.current;
    if (!group || group.contains(document.activeElement)) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    const target = bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE) ?? group;
    // The focus anchor owns scrolling; a native scroll-into-view would fight its animation.
    target.focus({ preventScroll: true });
  }, [isFocused]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (!onNavigate || !event.ctrlKey) return;
    if (event.key === "ArrowDown") onNavigate("next");
    else if (event.key === "ArrowUp") onNavigate("previous");
    else return;
    event.preventDefault();
  };

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: the handlers only observe events that bubble from the focusable controls inside
    <div
      ref={ref}
      className={root}
      data-question-card=""
      data-focused={isFocused}
      onFocus={isFocused ? undefined : onFocusRequest}
      onKeyDown={onKeyDown}
    >
      {isFocused ? (
        // biome-ignore lint/a11y/useSemanticElements: the group is named by the visible title
        <div ref={groupRef} role="group" aria-labelledby={titleId} tabIndex={-1}>
          <div className={header}>
            <span id={titleId} className={titleClass}>
              {title}
            </span>
            <span className={side}>
              {status}
              {meta}
              {actions}
            </span>
          </div>
          {prompt ? <p className={promptClass}>{prompt}</p> : null}
          <div ref={bodyRef} className={body}>
            {children}
          </div>
        </div>
      ) : (
        <Button className={compact} onPress={onFocusRequest}>
          <span className={titleClass}>{title}</span>
          <span className={side}>
            {status}
            {meta}
          </span>
          <span className={hasAnswer ? answerClass : `${answerClass} ${answerEmpty}`}>
            {hasAnswer ? answer : emptyLabel}
          </span>
        </Button>
      )}
    </div>
  );
}
