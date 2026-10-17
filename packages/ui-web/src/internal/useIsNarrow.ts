import { useSyncExternalStore } from "react";
import { narrowQuery } from "../styles/helpers";

function subscribe(onChange: () => void) {
  const list = window.matchMedia(narrowQuery);
  list.addEventListener("change", onChange);
  return () => list.removeEventListener("change", onChange);
}

/**
 * Whether the window is narrower than `semantic.breakpoint.tablet`, where Picker, ComboBox
 * and DatePicker open as trays instead of popovers (design-spec 4.5).
 */
export function useIsNarrow(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );
}
