import { useSyncExternalStore } from "react";
import { useAutosaveState } from "./autosave-react";

const subscribe = (onChange: () => void) => {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
};

/** Whether the browser says it is online. The prerendered shell has none to ask. */
function useIsBrowserOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Whether the app can reach the API (design-spec 6.0.6「オフライン」): the browser says
 * it is online and the saves are not failing on the network again and again. The
 * offline band shows while it cannot, and leaves as soon as the connection is back.
 */
export function useIsReachable(): boolean {
  const isBrowserOnline = useIsBrowserOnline();
  const saves = useAutosaveState();
  return isBrowserOnline && !(saves?.isUnreachable ?? false);
}

/**
 * Whether input can be sent (design-spec 6.0.2・6.0.6「オフライン」, ADR-021): the browser
 * says it is online, the saves are not failing on the network again and again, and,
 * back online, the input held while offline has gone out. Otherwise the fields are read
 * only.
 */
export function useIsOnline(): boolean {
  const isReachable = useIsReachable();
  const saves = useAutosaveState();
  return isReachable && !(saves?.isReconnecting ?? false);
}
