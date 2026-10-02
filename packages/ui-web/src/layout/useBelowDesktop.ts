import { useSyncExternalStore } from "react";
import { breakpoints } from "../theme";

const QUERY = `(max-width: ${breakpoints.desktop - 1}px)`;

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * True while the viewport is narrower than `semantic.breakpoint.desktop`, where two-column
 * layouts collapse. `useIsNarrow` stops at tablet, which is too early for these patterns.
 */
export function useBelowDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
