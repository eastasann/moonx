import { type RefObject, useLayoutEffect } from "react";

/**
 * Grows the textarea with its content: the height follows the text, never below the
 * frame's minimum. It is measured again when the text changes and when the width does,
 * since a narrower field wraps into more lines.
 */
export function useAutoGrow(
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string | undefined,
) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: a controlled value changes the text without an input event, so the height is measured again then.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const resize = () => {
      element.style.height = "auto";
      element.style.height = `${element.scrollHeight}px`;
    };
    resize();
    let width = element.clientWidth;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === width) return;
      width = element.clientWidth;
      // Changing the height inside the observer's callback would make it report again in
      // the same frame, which the browser raises as an error; the next frame is soon enough.
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(resize);
    });
    observer.observe(element);
    element.addEventListener("input", resize);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      element.removeEventListener("input", resize);
    };
  }, [ref, value]);
}
