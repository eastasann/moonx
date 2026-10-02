import { type RefObject, useEffect, useRef } from "react";
import { reducedMotion } from "../../styles.css";
import { vars } from "../../theme";

/** Reads the custom property behind a generated token reference such as `var(--moonx-x)`. */
function readToken(reference: string): string | null {
  const name = /^var\((--[^),\s]+)/.exec(reference)?.[1];
  if (!name) return null;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === "" ? null : value;
}

interface Transition {
  durationMs: number;
  ease: (t: number) => number;
}

function parseTransition(value: string): Transition | null {
  const duration = /(-?\d*\.?\d+)(ms|s)\b/.exec(value);
  const curve = /cubic-bezier\(([^)]+)\)/.exec(value);
  if (!duration || !curve) return null;
  const points = (curve[1] ?? "").split(",").map((part) => Number.parseFloat(part));
  const [x1, y1, x2, y2] = points;
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) return null;
  if (points.some(Number.isNaN)) return null;
  const durationMs = Number.parseFloat(duration[1] ?? "") * (duration[2] === "s" ? 1000 : 1);
  return { durationMs, ease: cubicBezier(x1, y1, x2, y2) };
}

function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const axis = (a: number, b: number, t: number) =>
    3 * a * (1 - t) * (1 - t) * t + 3 * b * (1 - t) * t * t + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let low = 0;
    let high = 1;
    let t = x;
    for (let i = 0; i < 24; i++) {
      t = (low + high) / 2;
      if (axis(x1, x2, t) < x) low = t;
      else high = t;
    }
    return axis(y1, y2, t);
  };
}

const SCROLL_KEYS = new Set([
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
  " ",
]);

function scrollParent(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === "auto" || overflowY === "scroll") && node.scrollHeight > node.clientHeight) {
      return node;
    }
  }
  return null;
}

/**
 * Scrolls the referenced element so its vertical center sits at `semantic.layout.focus-anchor`
 * of the scroll container whenever `isFocused` becomes true (design-spec 4.1 pattern C). The
 * motion uses `semantic.motion.transition.focus-scroll` and is replaced by an instant jump
 * when the OS asks to reduce motion. Wheel, touch and scrolling keys interrupt the motion. A card taller than the container keeps its top edge in view.
 * Nothing happens while the theme's custom properties are not loaded.
 */
export function useFocusAnchor<T extends HTMLElement = HTMLElement>(
  isFocused: boolean,
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!isFocused || !element) return;

    const anchorToken = readToken(vars.layout["focus-anchor"]);
    const anchor = anchorToken === null ? Number.NaN : Number.parseFloat(anchorToken);
    if (Number.isNaN(anchor)) return;

    const container = scrollParent(element);
    const scroller = container ?? document.scrollingElement ?? document.documentElement;
    const containerRect = container
      ? container.getBoundingClientRect()
      : { top: 0, height: window.innerHeight };
    const rect = element.getBoundingClientRect();
    const centerOffset =
      rect.top + rect.height / 2 - (containerRect.top + containerRect.height * anchor);
    const topOffset = rect.top - containerRect.top;
    const delta = Math.min(centerOffset, topOffset);
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    const from = scroller.scrollTop;
    const to = Math.min(Math.max(from + delta, 0), Math.max(maxScroll, 0));
    if (Math.abs(to - from) < 1) return;

    const transitionToken = readToken(vars.motion.transition["focus-scroll"]);
    const transition = transitionToken === null ? null : parseTransition(transitionToken);
    if (!transition || window.matchMedia(reducedMotion).matches) {
      scroller.scrollTop = to;
      return;
    }

    let frame = 0;
    let startedAt: number | null = null;
    const stop = () => cancelAnimationFrame(frame);
    const step = (now: number) => {
      startedAt ??= now;
      const progress = Math.min((now - startedAt) / transition.durationMs, 1);
      scroller.scrollTop = from + (to - from) * transition.ease(progress);
      if (progress < 1) frame = requestAnimationFrame(step);
      else cleanup();
    };
    const interrupt = container ?? window;
    // Keys that scroll the page natively; the animation must yield to them like to a wheel.
    // Ctrl+Up / Ctrl+Down move to another question and reach this listener in the same event
    // that started the animation; with a modifier they do not scroll, so they must not stop it.
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return;
      if (SCROLL_KEYS.has(event.key)) cleanup();
    };
    const cleanup = () => {
      stop();
      interrupt.removeEventListener("wheel", cleanup);
      interrupt.removeEventListener("touchmove", cleanup);
      window.removeEventListener("keydown", onKey);
    };
    interrupt.addEventListener("wheel", cleanup, { passive: true });
    interrupt.addEventListener("touchmove", cleanup, { passive: true });
    window.addEventListener("keydown", onKey);
    frame = requestAnimationFrame(step);
    return cleanup;
  }, [isFocused]);

  return ref;
}
