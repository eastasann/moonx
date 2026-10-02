import type { ConflictCurrent } from "@moonx/schemas";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiError } from "./api-error";
import { autosave } from "./autosave";
import { useMe } from "./session";

/** How long input may rest before it is saved (design-spec 6.0.2). */
export const AUTOSAVE_DELAY_MS = 1000;

export interface SavedItemOptions {
  /** Names the item in the pending queue, such as `answer:<validationId>:<questionKey>`. */
  itemKey: string;
  method: "PUT" | "PATCH";
  url: string;
  /** The `lockVersion` of the copy the screen loaded. */
  lockVersion: number;
  /** Receives the server's answer after every save, to refresh the screen's copy. */
  onSaved: (data: unknown) => void;
  /** Applies the other person's copy (`current.value`) after "Load theirs". */
  onAdopt: (current: ConflictCurrent) => void;
  /** Applies the input an earlier visit left unsent, once, when the item mounts. */
  onRestore: (patch: Record<string, unknown>) => void;
  /** Another tab sent this item's queued input; the screen reads the item again. */
  onSentElsewhere?: () => void;
  /** A Viewer or an archived idea: nothing is saved and nothing is restored. */
  isReadOnly?: boolean;
}

export interface SavedItem {
  /** Merges `patch` into the next request. `delay` is 0 for a choice that saves when picked. */
  save: (patch: Record<string, unknown>, options?: { delay?: number }) => void;
  /** Sends what is waiting now (the person left the field or the screen); resolves once queued. */
  flush: () => Promise<void>;
  /** Tells the hook the item's version changed by a request it did not send (the evidence sheet). */
  acknowledge: (lockVersion: number) => void;
  /** The last save failed; `willRetry` says whether the input waits in the queue for a retry. */
  failure: { error: ApiError; willRetry: boolean } | null;
  /**
   * Retry after a failure. A save the server refused is not in the queue any more, so `resend`
   * (the item's whole current input) is sent again.
   */
  retry: (resend?: Record<string, unknown>) => void;
  /** Someone else saved the item first (design-spec 6.0.2). */
  conflict: ConflictCurrent | null;
  /** The person's own unsent input while `conflict` is set, so it can be copied before it is dropped. */
  mine: Record<string, unknown> | null;
  /** "Overwrite with mine". */
  keepMine: () => void;
  /** "Load theirs". */
  loadTheirs: () => void;
}

const WITHOUT_LOCK = (body: Record<string, unknown>) => {
  const { lockVersion: _lock, force: _force, ...patch } = body;
  return patch;
};

/**
 * Saves one item of a screen with the autosave rules of design-spec 6.0.2: input rests for a
 * second, or the person leaves the field, or leaves the screen, and the request goes through the
 * pending queue so a lost connection keeps it (ADR-019, ADR-021). A choice passes `delay: 0`.
 */
export function useSavedItem(options: SavedItemOptions): SavedItem {
  const userId = useMe().id;
  const { itemKey, method, url, isReadOnly } = options;
  const latest = useRef(options);
  latest.current = options;
  const lockVersion = useRef(options.lockVersion);
  const waiting = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [failure, setFailure] = useState<SavedItem["failure"]>(null);
  const [conflict, setConflict] = useState<ConflictCurrent | null>(null);
  const [mine, setMine] = useState<Record<string, unknown> | null>(null);

  // The version follows saves, `acknowledge` and "Load theirs", never a refetch: a refetch while the
  // person has unsent input must leave the old version in place so the server reports the conflict.
  // biome-ignore lint/correctness/useExhaustiveDependencies: a different item restarts at its own version
  useEffect(() => {
    lockVersion.current = latest.current.lockVersion;
  }, [itemKey]);

  const commit = useCallback((): Promise<void> => {
    clearTimeout(timer.current);
    timer.current = undefined;
    if (Object.keys(waiting.current).length === 0) return Promise.resolve();
    const body = waiting.current;
    waiting.current = {};
    return autosave.submit({
      userId,
      itemKey,
      request: { method, url, body },
      lockVersion: lockVersion.current,
    });
  }, [userId, itemKey, method, url]);

  const acknowledge = useCallback(
    (version: number) => {
      lockVersion.current = version;
      void autosave.rebase(userId, itemKey, version);
    },
    [userId, itemKey],
  );

  useEffect(() => {
    const unsubscribe = autosave.subscribe(userId, itemKey, (event) => {
      if (event.type === "saved") {
        const version = (event.data as { lockVersion?: number } | null)?.lockVersion;
        if (version !== undefined) lockVersion.current = version;
        setFailure(null);
        setConflict(null);
        latest.current.onSaved(event.data);
      } else if (event.type === "sent-elsewhere") {
        setFailure(null);
        setConflict(null);
        latest.current.onSentElsewhere?.();
      } else if (event.type === "conflict") {
        setConflict(event.current);
      } else {
        setFailure({ error: event.error, willRetry: event.willRetry });
      }
    });
    return unsubscribe;
  }, [userId, itemKey]);

  // The input an earlier visit left unsent comes back into the field and goes out again.
  useEffect(() => {
    if (isReadOnly) return;
    let cancelled = false;
    void autosave.pending(userId, itemKey).then((entry) => {
      if (cancelled || !entry) return;
      latest.current.onRestore(WITHOUT_LOCK(entry.request.body));
      if (entry.conflict) setConflict(entry.conflict);
      else void autosave.flush(userId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, itemKey, isReadOnly]);

  // Logging out sends what is still resting first (see `autosave.flushAll`).
  useEffect(() => autosave.registerFlusher(commit), [commit]);

  // Leaving the screen, or hiding the tab, sends what is still resting.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void commit();
    };
    const onPageHide = () => void commit();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onPageHide);
      void commit();
    };
  }, [commit]);

  const save = useCallback(
    (patch: Record<string, unknown>, saveOptions: { delay?: number } = {}) => {
      if (isReadOnly) return;
      waiting.current = { ...waiting.current, ...patch };
      clearTimeout(timer.current);
      const delay = saveOptions.delay ?? AUTOSAVE_DELAY_MS;
      if (delay <= 0) void commit();
      else timer.current = setTimeout(() => void commit(), delay);
    },
    [commit, isReadOnly],
  );

  useEffect(() => {
    if (!conflict) {
      setMine(null);
      return;
    }
    let cancelled = false;
    void autosave.pending(userId, itemKey).then((entry) => {
      if (!cancelled && entry) setMine(WITHOUT_LOCK(entry.request.body));
    });
    return () => {
      cancelled = true;
    };
  }, [conflict, userId, itemKey]);

  const retry = useCallback(
    (resend?: Record<string, unknown>) => {
      const willRetry = failure?.willRetry ?? true;
      setFailure(null);
      if (!willRetry && resend) save(resend, { delay: 0 });
      else void autosave.flush(userId);
    },
    [failure, save, userId],
  );

  const keepMine = useCallback(() => {
    void (async () => {
      const entry = await autosave.pending(userId, itemKey);
      const current = conflict;
      if (!entry || !current) return;
      setConflict(null);
      lockVersion.current = current.lockVersion;
      await autosave.submit({
        userId,
        itemKey,
        request: { method, url, body: WITHOUT_LOCK(entry.request.body) },
        lockVersion: current.lockVersion,
        force: true,
      });
    })();
  }, [userId, itemKey, method, url, conflict]);

  const loadTheirs = useCallback(() => {
    const current = conflict;
    if (!current) return;
    setConflict(null);
    lockVersion.current = current.lockVersion;
    void autosave.discard(userId, itemKey);
    latest.current.onAdopt(current);
  }, [userId, itemKey, conflict]);

  return { save, flush: commit, acknowledge, failure, retry, conflict, mine, keepMine, loadTheirs };
}
