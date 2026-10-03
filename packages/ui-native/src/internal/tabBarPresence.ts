import { useEffect, useSyncExternalStore } from "react";

// A module-level count rather than context: toasts render in the portal host at the app root,
// outside the screen tree that holds the TabBar, so context from the screen cannot reach them.
let mounted = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

/** Called by `TabBar` while it is on screen. */
export function useRegisterTabBar(): void {
  useEffect(() => {
    mounted += 1;
    emit();
    return () => {
      mounted -= 1;
      emit();
    };
  }, []);
}

/** Whether a `TabBar` is on screen, so overlays outside the screen know what to clear. */
export function useHasTabBar(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => mounted > 0,
  );
}
