import { createContext, useContext, useId, useLayoutEffect } from "react";

/** What `QuestionFormPattern` gives the `QuestionCard`s inside it. Read it through `useQuestionFocus`. */
export interface QuestionFocusContextValue {
  /** Whether any card of the form is focused. */
  hasFocus: boolean;
  /** A card reports whether it is focused. Unmounting reports false. */
  setFocused: (id: string, focused: boolean) => void;
}

/**
 * The phone twin of the `data-question-card` / `data-focused` attributes the Web frame reads.
 * `QuestionFormPattern` provides it; a `QuestionCard` must not use it directly but call
 * `useQuestionFocus`. Outside a `QuestionFormPattern` there is no value, and cards always show.
 */
export const QuestionFocusContext = createContext<QuestionFocusContextValue | null>(null);

/**
 * For `QuestionCard`: reports `isFocused` to the surrounding `QuestionFormPattern` and returns
 * whether the card shows. On a phone only the focused card shows, but only while some card is
 * focused, so a form with no focused card shows every question. A card that gets `false` must
 * render nothing (it stays mounted in the screen's tree, so its state is kept by the screen).
 * The report is made before paint, so the other cards never flash.
 */
export function useQuestionFocus(isFocused: boolean): boolean {
  const context = useContext(QuestionFocusContext);
  const id = useId();
  const setFocused = context?.setFocused;
  useLayoutEffect(() => {
    setFocused?.(id, isFocused);
    return () => setFocused?.(id, false);
  }, [setFocused, id, isFocused]);
  if (!context) return true;
  return isFocused || !context.hasFocus;
}
