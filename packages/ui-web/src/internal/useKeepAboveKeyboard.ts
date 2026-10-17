import { type RefObject, useEffect } from "react";

function scrollParent(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      node.scrollHeight > node.clientHeight
    ) {
      return node;
    }
  }
  return (document.scrollingElement ?? document.documentElement) as HTMLElement;
}

/**
 * Keeps a focused field above the on-screen keyboard (design-spec 4.3). The keyboard
 * shrinks the visual viewport, not the layout one, so the browser's own scrolling can
 * leave the field under it: when the field's bottom falls below the visual viewport, the
 * nearest scrolling ancestor scrolls up by the difference. That ancestor's
 * `scroll-padding-bottom` counts as covered too, so a frame with a bar fixed to the bottom
 * keeps the field above the bar as well.
 */
export function useKeepAboveKeyboard(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const element = ref.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;

    const reveal = () => {
      if (!element.contains(document.activeElement)) return;
      const scroller = scrollParent(element);
      const padding =
        Number.parseFloat(getComputedStyle(scroller).scrollPaddingBottom) || 0;
      const visibleBottom = viewport.offsetTop + viewport.height - padding;
      const overlap = element.getBoundingClientRect().bottom - visibleBottom;
      if (overlap > 0) scroller.scrollBy({ top: overlap });
    };

    element.addEventListener("focusin", reveal);
    viewport.addEventListener("resize", reveal);
    return () => {
      element.removeEventListener("focusin", reveal);
      viewport.removeEventListener("resize", reveal);
    };
  }, [ref]);
}
