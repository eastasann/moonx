import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { autosave } from "../lib/autosave";
import { IDEAS_KEY } from "../lib/idea-actions";
import { pendingQueue } from "../lib/pending-queue";
import { reportUnauthenticated } from "../lib/query-client";
import { useMe } from "../lib/session";

/** How often queued saves are tried again while any wait (ADR-021). */
export const RETRY_INTERVAL_MS = 30_000;

/**
 * Runs the pending queue of the signed-in person for every screen (ADR-021): drops what another
 * person left on this browser, sends what is waiting now, and again on reconnect and on a timer.
 * A 401 while sending goes to the login screen; the queue stays and goes out when the same
 * person logs in again.
 */
export function AutosaveRuntime() {
  const userId = useMe().id;
  const queryClient = useQueryClient();

  useEffect(() => {
    autosave.onUnauthenticated = (error) => reportUnauthenticated(queryClient, error);
    // A save nobody was watching changed data that loaded screens still show in the old state.
    autosave.onUnobservedSave = () => {
      void queryClient.invalidateQueries({ queryKey: ["validations"] });
      void queryClient.invalidateQueries({ queryKey: IDEAS_KEY });
    };
    return () => {
      autosave.onUnauthenticated = () => {};
      autosave.onUnobservedSave = () => {};
    };
  }, [queryClient]);

  useEffect(() => {
    autosave.reopen();
    let active = true;
    void pendingQueue.removeOthers(userId).then(() => {
      if (active) void autosave.flush(userId);
    });
    const flush = () => void autosave.flush(userId);
    window.addEventListener("online", flush);
    const timer = setInterval(flush, RETRY_INTERVAL_MS);
    return () => {
      active = false;
      window.removeEventListener("online", flush);
      clearInterval(timer);
    };
  }, [userId]);

  return null;
}
