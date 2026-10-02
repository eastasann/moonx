import { useSyncExternalStore } from "react";

export type SaveState =
  | { status: "idle" | "saving" | "saved" }
  | { status: "error"; retry: () => void };

let state: SaveState = { status: "idle" };
let pending = 0;
/** Requests that failed and have not succeeded since; the header shows the error while any remain. */
const failed = new Set<() => Promise<unknown>>();
const listeners = new Set<() => void>();

function set(next: SaveState) {
  state = next;
  for (const notify of listeners) notify();
}

function showResult() {
  if (pending > 0) return;
  if (failed.size === 0) {
    set({ status: "saved" });
    return;
  }
  const runs = [...failed];
  set({
    status: "error",
    retry: () => {
      for (const run of runs) void saveStatus.track(run).catch(() => {});
    },
  });
}

/**
 * The header's save state (design-spec 6.0.2). Whatever saves something wraps the request in
 * `track`; the header shows "Saving…" while any is in flight, then "Saved", or "Couldn't save"
 * with a Retry that runs the failed requests again. A later save that works does not hide an
 * earlier one that failed.
 */
export const saveStatus = {
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => listeners.delete(notify);
  },
  getSnapshot: () => state,
  async track<T>(run: () => Promise<T>): Promise<T> {
    pending += 1;
    if (failed.size === 0) set({ status: "saving" });
    try {
      const result = await run();
      failed.delete(run);
      pending -= 1;
      showResult();
      return result;
    } catch (error) {
      failed.add(run);
      pending -= 1;
      showResult();
      throw error;
    }
  },
  /** Back to blank, for a new screen. A save still running or failed stays visible. */
  reset() {
    if (state.status === "saved") set({ status: "idle" });
  },
};

export function useSaveState(): SaveState {
  return useSyncExternalStore(saveStatus.subscribe, saveStatus.getSnapshot, saveStatus.getSnapshot);
}
