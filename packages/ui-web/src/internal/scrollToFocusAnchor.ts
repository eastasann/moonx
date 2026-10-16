import { vars } from "@moonx/ui-tokens";
import { reducedMotion } from "../styles/helpers";

/** `--layout-focus-anchor`, read from the page: 06 layout.focus-anchor. */
const anchorProperty = /var\((--[^),]+)/.exec(vars.layout.focusAnchor)?.[1];

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (
    let parent = element.parentElement;
    parent !== null;
    parent = parent.parentElement
  ) {
    const { overflowY } = getComputedStyle(parent);
    if (
      (overflowY === "auto" || overflowY === "scroll") &&
      parent.scrollHeight > parent.clientHeight
    ) {
      return parent;
    }
  }
  return null;
}

/**
 * Scrolls `element` to the height of 06 `layout.focus-anchor` (0.5: the middle) in its
 * scrolling container or the window, smoothly unless motion is reduced (design-spec 4.1
 * C). One taller than the view puts `focused` (the field being typed in) at that height
 * instead, which its middle would push out of sight; a field taller still is left where
 * it is.
 */
export function scrollToFocusAnchor(element: HTMLElement, focused: Element) {
  if (anchorProperty === undefined) {
    throw new Error("layout.focus-anchor is not a CSS variable");
  }
  const anchor = Number.parseFloat(
    getComputedStyle(element).getPropertyValue(anchorProperty),
  );
  const parent = scrollParent(element);
  const view = parent?.getBoundingClientRect() ?? {
    top: 0,
    height: window.visualViewport?.height ?? window.innerHeight,
  };
  const card = element.getBoundingClientRect();
  const box =
    card.height >= view.height ? focused.getBoundingClientRect() : card;
  // A field taller than the view keeps its caret in sight by itself (the browser
  // scrolls to it); moving the field would move the caret out of it.
  if (box.height >= view.height) return;
  const top = box.top + box.height / 2 - (view.top + anchor * view.height);
  (parent ?? window).scrollBy({
    top,
    behavior: window.matchMedia(reducedMotion).matches ? "auto" : "smooth",
  });
}
