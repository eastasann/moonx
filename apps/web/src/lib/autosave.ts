import {
  type ConflictCurrent,
  conflictCurrentSchema,
  type ErrorCode,
} from "@moonx/schemas";
import type { SaveState } from "@moonx/ui-tokens";
import { ApiError } from "./api";

/** The fields of one item that wait to be saved, by name. */
export type SaveFields = Readonly<Record<string, unknown>>;

/**
 * One item of design-spec 6.0.2 (an answer, a row, a number, an idea's summary) and how it
 * is saved. Its saves go out one at a time, each with the version the previous one left.
 */
export interface SaveTarget {
  /** The item, the same for every field of it: `idea:<id>`. */
  key: string;
  /** What the conflict question calls it: "summary" in "Paolo updated this summary". */
  noun: string;
  /**
   * Sends the fields with the version the client holds (`force` overwrites someone
   * else's save, ADR-019) and puts the answer in the screen's data; resolves to the
   * item's version after it.
   *
   * @throws {ApiError} as the API refuses it, or the network fails.
   */
  send: (
    fields: SaveFields,
    lockVersion: number,
    force: boolean,
  ) => Promise<number>;
  /** Puts what someone else saved in the screen's data, in place of the user's input. */
  loadTheirs: (current: ConflictCurrent) => void;
}

/**
 * Where an item's save stands. `retrying`: a failure that may pass next time, sent again
 * by itself; `rejected`: refused for good (archived, no access, gone), sent again only by
 * Retry; `conflict`: someone saved it first, the user chooses; `signedOut`: the session
 * ended, held for M9.
 */
export type SaveStatus =
  | "waiting"
  | "saving"
  | "saved"
  | "retrying"
  | "rejected"
  | "conflict"
  | "signedOut";

export interface SaveItem {
  key: string;
  noun: string;
  status: SaveStatus;
  /** What is not saved yet, the fields on their way included. */
  unsaved: SaveFields;
  /** The failure of `retrying` and `rejected`. */
  failure: ApiError | null;
  /** What the other save holds, while in `conflict`. */
  conflict: ConflictCurrent | null;
}

export interface AutosaveState {
  items: ReadonlyMap<string, SaveItem>;
  /** The saves failed on the network again and again: as offline as the browser saying so. */
  isUnreachable: boolean;
  /** Back online, the values held are on their way: inputs wait for them (ADR-021). */
  isReconnecting: boolean;
  /** A save or a screen met a lost session while input was unsaved: M9 is open. */
  needsSignIn: boolean;
  /** When each item was last saved, on this page. */
  savedAt: ReadonlyMap<string, number>;
}

/** How long typing has to stop before the save goes out (design-spec 6.0.2: about 1 s). */
export const TYPING_PAUSE_MS = 1000;

/** The waits between the tries of a save that failed for now, the last one repeated. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16_000, 30_000];

/**
 * How many network failures in a row make the API unreachable (ADR-021: "通信の失敗が
 * 続いたとき"): the inputs stop as for offline until a save gets through.
 */
export const UNREACHABLE_AFTER = 3;

/** Codes whose refusal no second send changes (ADR-021「恒久的な失敗」). */
const isTransient = (error: ApiError) =>
  error.status === null || error.status >= 500 || error.status === 429;

const retryAfterMs = (error: ApiError): number | null => {
  const seconds = error.detail.retryAfterSeconds;
  return typeof seconds === "number" ? seconds * 1000 : null;
};

const isEmpty = (fields: SaveFields) => Object.keys(fields).length === 0;

/** Holds input, so leaving the page would lose it (ADR-021「離脱の確認」). */
const holdsInput = (item: SaveItem) =>
  item.status !== "saved" || !isEmpty(item.unsaved);

interface Item {
  target: SaveTarget;
  lockVersion: number;
  unsaved: Record<string, unknown>;
  sending: SaveFields | null;
  status: SaveStatus;
  failure: ApiError | null;
  conflict: ConflictCurrent | null;
  force: boolean;
  attempt: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export interface AutosaveOptions {
  /** A save refused for good: the screen reloads to show why (archived, read only). */
  onRejected?: (error: ApiError) => void;
  /** Whether the browser says it is online; tests pass their own. */
  isBrowserOnline?: () => boolean;
}

export interface Autosave {
  /** The current state, the same object until something changes (useSyncExternalStore). */
  getState: () => AutosaveState;
  subscribe: (listener: () => void) => () => void;
  /**
   * Takes what the user typed: saved once typing stops for {@link TYPING_PAUSE_MS}.
   *
   * @param lockVersion The version the screen shows, taken while nothing of the item waits
   * and it is newer than the last one saved.
   */
  change: (target: SaveTarget, lockVersion: number, fields: SaveFields) => void;
  /** Saves what waits now: the field was left, or the screen is (design-spec 6.0.2). */
  flush: (key: string) => void;
  /** Drops fields that break their rules: such input is not saved (6.0.8). */
  discard: (key: string, fields: readonly string[]) => void;
  /**
   * Sends the failed saves again: one item's (the field's Retry) or all (the header's),
   * those waiting for a conflict's answer included.
   */
  retry: (key?: string) => void;
  /** The user's answer to a conflict (design-spec 6.0.2). */
  resolveConflict: (key: string, choice: "overwrite" | "loadTheirs") => void;
  /** Whether input would be lost by leaving the page or the session. */
  hasUnsaved: () => boolean;
  /** A lost session met unsaved input: M9 opens (design-spec 5章「認証」). */
  requireSignIn: () => void;
  /** Signed in again from M9: what was held goes out (ADR-021). */
  resumeAfterSignIn: () => void;
  /**
   * M9 closed without signing in (its error dialog's Close): the input stays held, and
   * Retry, which meets the lost session again, opens M9 again.
   */
  cancelSignIn: () => void;
  /** Leaving for the sign-in screen, or logging out: the input is dropped (ADR-021). */
  discardAll: () => void;
  /** Follows the browser's online and offline events; returns the way to stop. */
  start: () => () => void;
}

/**
 * The saves of the page (ADR-021, design-spec 6.0.2): each item's newest unsaved value in
 * memory only, never on the device; sent one at a time per item once typing pauses, when
 * the field is left and when the screen is; failures that may pass sent again with longer
 * waits; held while offline and sent once back; held through a lost session for M9. It
 * lives as long as the page, so moving between screens keeps it.
 */
export function createAutosave(options: AutosaveOptions = {}): Autosave {
  const isBrowserOnline =
    options.isBrowserOnline ?? (() => globalThis.navigator?.onLine ?? true);
  const items = new Map<string, Item>();
  const savedAt = new Map<string, number>();
  const listeners = new Set<() => void>();
  let networkFailures = 0;
  let isUnreachable = false;
  let isReconnecting = false;
  let needsSignIn = false;
  let state: AutosaveState = build();

  function view(item: Item): SaveItem {
    return {
      key: item.target.key,
      noun: item.target.noun,
      status: item.status,
      unsaved: { ...item.sending, ...item.unsaved },
      failure: item.failure,
      conflict: item.conflict,
    };
  }

  function build(): AutosaveState {
    return {
      items: new Map([...items].map(([key, item]) => [key, view(item)])),
      isUnreachable,
      isReconnecting,
      needsSignIn,
      savedAt: new Map(savedAt),
    };
  }

  function emit() {
    if (
      isReconnecting &&
      ![...items.values()].some(
        (item) => item.status === "waiting" || item.status === "saving",
      )
    ) {
      isReconnecting = false;
    }
    state = build();
    for (const listener of listeners) listener();
  }

  function clearTimer(item: Item) {
    if (item.timer !== null) clearTimeout(item.timer);
    item.timer = null;
  }

  /** Sends what waits, unless one save is out already: its answer sends the rest. */
  function send(item: Item) {
    clearTimer(item);
    if (item.sending !== null) return;
    if (isEmpty(item.unsaved)) {
      if (item.status === "waiting") item.status = "saved";
      emit();
      return;
    }
    if (!isBrowserOnline()) {
      // Held until the browser is back (start's online listener).
      item.status = "retrying";
      emit();
      return;
    }
    const fields = item.unsaved;
    item.sending = fields;
    item.unsaved = {};
    item.status = "saving";
    const force = item.force;
    emit();
    item.target.send(fields, item.lockVersion, force).then(
      (lockVersion) => {
        if (items.get(item.target.key) !== item) return;
        item.sending = null;
        item.lockVersion = lockVersion;
        item.force = false;
        item.failure = null;
        item.attempt = 0;
        networkFailures = 0;
        isUnreachable = false;
        savedAt.set(item.target.key, Date.now());
        if (isEmpty(item.unsaved)) {
          item.status = "saved";
          emit();
        } else if (item.timer !== null) {
          // Still typing: the pause sends it.
          item.status = "waiting";
          emit();
        } else {
          send(item);
        }
      },
      (error: unknown) => {
        if (items.get(item.target.key) !== item) return;
        // What failed waits again, under anything typed since.
        item.unsaved = { ...fields, ...item.unsaved };
        item.sending = null;
        failed(item, error);
      },
    );
  }

  /**
   * Sends the item after `delay`, unless by then it is gone (dropped, Load theirs) or
   * waits for the user (a conflict, a lost session, a refusal).
   */
  function sendLater(item: Item, delay: number) {
    clearTimer(item);
    item.timer = setTimeout(() => {
      item.timer = null;
      if (items.get(item.target.key) === item && sendsByItself(item.status)) {
        send(item);
      }
    }, delay);
  }

  function failed(item: Item, error: unknown) {
    // A pause timer from typing during the send must not send past the failure.
    clearTimer(item);
    const apiError =
      error instanceof ApiError
        ? error
        : new ApiError({
            status: 500,
            code: "INTERNAL",
            requestId: null,
            cause: error,
          });
    if (apiError.status !== null) {
      // An answer came: the API is reachable, whatever it said.
      networkFailures = 0;
      isUnreachable = false;
    }
    if (apiError.status === 401) {
      item.status = "signedOut";
      needsSignIn = true;
      emit();
      return;
    }
    if (apiError.code === "CONFLICT") {
      const current = conflictCurrentSchema.safeParse(apiError.detail.current);
      if (current.success) {
        item.status = "conflict";
        item.conflict = current.data;
        item.failure = null;
        emit();
        return;
      }
    }
    item.failure = apiError;
    if (isTransient(apiError)) {
      item.status = "retrying";
      if (apiError.status === null) {
        networkFailures += 1;
        if (networkFailures >= UNREACHABLE_AFTER) isUnreachable = true;
      }
      const delay =
        retryAfterMs(apiError) ??
        RETRY_DELAYS_MS[Math.min(item.attempt, RETRY_DELAYS_MS.length - 1)] ??
        0;
      item.attempt += 1;
      sendLater(item, delay);
      emit();
      return;
    }
    item.status = "rejected";
    emit();
    options.onRejected?.(apiError);
  }

  /**
   * Whether a status lets typing send by itself: a conflict and a lost session wait for
   * the user, and a refusal for Retry (ADR-021: sending again changes nothing).
   */
  const sendsByItself = (status: SaveStatus) =>
    status !== "conflict" && status !== "signedOut" && status !== "rejected";

  /** An item left with nothing to send has nothing to save, nor to fail or ask about. */
  function settleIfEmpty(item: Item) {
    if (!isEmpty(item.unsaved) || item.sending !== null) return;
    clearTimer(item);
    item.status = "saved";
    item.failure = null;
    item.conflict = null;
  }

  function sendAllHeld() {
    for (const item of items.values()) {
      if (!isEmpty(item.unsaved) && sendsByItself(item.status)) {
        item.attempt = 0;
        send(item);
      }
    }
  }

  return {
    getState: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: (target, lockVersion, fields) => {
      let item = items.get(target.key);
      if (item === undefined) {
        item = {
          target,
          lockVersion,
          unsaved: {},
          sending: null,
          status: "saved",
          failure: null,
          conflict: null,
          force: false,
          attempt: 0,
          timer: null,
        };
        items.set(target.key, item);
      } else if (
        item.sending === null &&
        isEmpty(item.unsaved) &&
        item.status === "saved"
      ) {
        // Nothing of it waits. Versions only grow: the screen's is newer when it loaded
        // someone else's save, the item's when the screen has not caught up with its own.
        item.lockVersion = Math.max(item.lockVersion, lockVersion);
      }
      item.target = target;
      Object.assign(item.unsaved, fields);
      if (!sendsByItself(item.status)) {
        emit();
        return;
      }
      if (item.status !== "retrying" || item.timer === null) {
        if (item.status !== "saving") item.status = "waiting";
        sendLater(item, TYPING_PAUSE_MS);
      }
      emit();
    },
    flush: (key) => {
      const item = items.get(key);
      if (item?.status === "waiting") send(item);
    },
    discard: (key, fields) => {
      const item = items.get(key);
      if (item === undefined) return;
      for (const field of fields) delete item.unsaved[field];
      settleIfEmpty(item);
      emit();
    },
    retry: (key) => {
      const targets =
        key === undefined
          ? [...items.values()]
          : [items.get(key)].filter((item) => item !== undefined);
      for (const item of targets) {
        if (
          item.status === "retrying" ||
          item.status === "rejected" ||
          item.status === "conflict" ||
          (item.status === "signedOut" && !needsSignIn)
        ) {
          // A conflict sent again meets the other save anew and asks again.
          item.conflict = null;
          item.attempt = 0;
          send(item);
        }
      }
    },
    resolveConflict: (key, choice) => {
      const item = items.get(key);
      if (item?.status !== "conflict" || item.conflict === null) return;
      const current = item.conflict;
      item.conflict = null;
      if (choice === "overwrite") {
        // On their version, so a keyed item made meanwhile is overwritten too (SDD 5.1:
        // force alone does not pass a version-0 save onto a row someone made).
        item.lockVersion = current.lockVersion;
        item.force = true;
        item.status = "waiting";
        send(item);
        return;
      }
      item.target.loadTheirs(current);
      clearTimer(item);
      items.delete(key);
      emit();
    },
    hasUnsaved: () => [...state.items.values()].some(holdsInput),
    requireSignIn: () => {
      needsSignIn = true;
      emit();
    },
    resumeAfterSignIn: () => {
      needsSignIn = false;
      for (const item of items.values()) {
        if (item.status !== "signedOut") continue;
        item.status = "waiting";
        settleIfEmpty(item);
      }
      sendAllHeld();
      emit();
    },
    cancelSignIn: () => {
      needsSignIn = false;
      emit();
    },
    discardAll: () => {
      for (const item of items.values()) clearTimer(item);
      items.clear();
      networkFailures = 0;
      isUnreachable = false;
      isReconnecting = false;
      needsSignIn = false;
      emit();
    },
    start: () => {
      const online = () => {
        // The browser is back: the failures seen while it was away say nothing more.
        networkFailures = 0;
        isUnreachable = false;
        isReconnecting = [...items.values()].some(
          (item) => !isEmpty(item.unsaved) && sendsByItself(item.status),
        );
        sendAllHeld();
        emit();
      };
      const offline = () => emit();
      window.addEventListener("online", online);
      window.addEventListener("offline", offline);
      return () => {
        window.removeEventListener("online", online);
        window.removeEventListener("offline", offline);
      };
    },
  };
}

/**
 * The header's save state (design-spec 6.0.1・6.0.2): "Couldn't save" while any save of
 * the page failed, wherever it was typed, since the header's Retry sends them all;
 * "Saving…" while any is on its way; "Saved" once an item of `scope` (the screen's items,
 * by key prefix) saved on this visit; else nothing.
 */
export function saveStateOf(
  state: AutosaveState,
  scope: string | undefined,
  since: number,
): SaveState | undefined {
  const statuses = [...state.items.values()].map(({ status }) => status);
  if (
    statuses.some(
      (status) =>
        status === "retrying" ||
        status === "rejected" ||
        status === "conflict" ||
        status === "signedOut",
    )
  ) {
    return "save-failed";
  }
  if (statuses.some((status) => status === "waiting" || status === "saving")) {
    return "saving";
  }
  if (scope === undefined) return undefined;
  for (const [key, at] of state.savedAt) {
    if (at >= since && key.startsWith(scope)) return "saved";
  }
  return undefined;
}

/** The codes a refused save names as its reason beside "Couldn't save" (6.0.2). */
export type RejectionReason = "archived" | "noAccess" | "gone" | "format";

/**
 * Why the API refused a save for good (design-spec 6.0.2: archived, no access, gone), or
 * null for a refusal it does not name, shown as unexpected with its Ref.
 */
export function rejectionReason(error: ApiError): RejectionReason | null {
  const reasons: Partial<Record<ErrorCode, RejectionReason>> = {
    ARCHIVED: "archived",
    FORBIDDEN: "noAccess",
    NO_ACCESS: "noAccess",
    NOT_FOUND: "gone",
    VALIDATION_FAILED: "format",
  };
  return error.code === null ? null : (reasons[error.code] ?? null);
}

/** The text of what waits to be saved, for Copy my input (design-spec 6.0.2). */
export function unsavedText(item: SaveItem): string {
  return Object.values(item.unsaved)
    .filter((value): value is string => typeof value === "string")
    .join("\n\n");
}
