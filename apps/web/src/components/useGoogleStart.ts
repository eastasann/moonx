import { useCallback, useEffect, useRef, useState } from "react";

/**
 * "Continue with Google" (SDD 5.4 A2): starts once at a time, and is ready again when the
 * browser's Back brings the page back from Google as it was left, mid-start (the
 * back-forward cache keeps the page's state).
 *
 * @param start Asks the API to start and leaves the page.
 * @param onFailure What the screen shows when the API does not start one.
 */
export function useGoogleStart(
  start: () => Promise<void>,
  onFailure: (error: unknown) => void,
): { isStarting: boolean; startGoogle: () => void } {
  const [isStarting, setStarting] = useState(false);
  const busy = useRef(false);
  useEffect(() => {
    const ready = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      busy.current = false;
      setStarting(false);
    };
    window.addEventListener("pageshow", ready);
    return () => window.removeEventListener("pageshow", ready);
  }, []);
  const startGoogle = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setStarting(true);
    start().catch((error: unknown) => {
      busy.current = false;
      setStarting(false);
      onFailure(error);
    });
  }, [start, onFailure]);
  return { isStarting, startGoogle };
}
