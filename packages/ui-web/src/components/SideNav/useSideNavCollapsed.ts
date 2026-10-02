import { useSyncExternalStore } from "react";
import { breakpoints } from "../../theme";

const QUERY = `(min-width: ${breakpoints.tablet}px) and (max-width: ${breakpoints.desktop - 1}px)`;

function subscribe(onChange: () => void) {
  const list = window.matchMedia(QUERY);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** True on tablet widths, where the sidebar shrinks to icons only (design-spec 4.3). */
export function useSideNavCollapsed(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
