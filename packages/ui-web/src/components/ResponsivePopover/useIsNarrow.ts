import { useSyncExternalStore } from "react";
import { breakpoints } from "../../theme";

const QUERY = `(max-width: ${breakpoints.tablet - 1}px)`;

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** True while the viewport is narrower than `semantic.breakpoint.tablet`. Overlays become trays. */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
