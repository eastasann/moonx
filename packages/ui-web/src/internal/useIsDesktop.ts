import { useSyncExternalStore } from "react";
import { desktopUp } from "../styles/helpers";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(desktopUp);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/** Whether the window is at least `semantic.breakpoint.desktop` wide (design-spec 4.3). */
export function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(desktopUp).matches,
    () => false,
  );
}
