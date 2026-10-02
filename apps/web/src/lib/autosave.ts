import type { ConflictCurrent } from "@moonx/schemas";
import { sendJson } from "./api";
import { ApiError, isApiError } from "./api-error";
import { type PendingEntry, pendingQueue, type QueuedRequest } from "./pending-queue";
import { saveStatus } from "./save-status";

/** What happened to the latest save of one item. */
export type SaveEvent =
  | { type: "saved"; data: unknown }
  | { type: "conflict"; current: ConflictCurrent }
  /** Another tab sent the queued input of this item; the screen reads the item again. */
  | { type: "sent-elsewhere" }
  /** `willRetry`: a lost connection or a server failure; the input stays queued and goes out again. */
  | { type: "failed"; error: ApiError; willRetry: boolean };

type Listener = (event: SaveEvent) => void;

interface Slot {
  entry: PendingEntry;
  sending: boolean;
  /**
   * The entry came from the queue and nothing was merged into it here, so another tab may have
   * sent it already. Input submitted in this tab always goes out.
   */
  fromQueue: boolean;
}

/** Failures a later attempt can fix (SDD 8.2): no answer, the server's own failure, a rate limit. */
function isTransient(error: ApiError): boolean {
  return (
    error.code === "NETWORK" ||
    error.code === "UPSTREAM_UNAVAILABLE" ||
    error.code === "RATE_LIMITED" ||
    error.status >= 500
  );
}

const conflictOf = (error: ApiError): ConflictCurrent | null => {
  const current = error.extra.current;
  return error.code === "CONFLICT" && current ? (current as ConflictCurrent) : null;
};

/**
 * Sends the saves of the screens one item at a time and keeps what could not be sent (ADR-019,
 * ADR-021, design-spec 6.0.2).
 *
 * An item has at most one request in flight and one waiting behind it: input that arrives while
 * a save is running is merged into the waiting request, and when the first one answers the waiting
 * one is sent with the `lockVersion` that answer returned. Every request is written to the
 * pending queue before it is sent and removed when it succeeds, so a lost connection, a closed
 * tab or an expired session never loses the input. Entries go out again when the browser comes
 * back online, on a timer, and from the header's Retry.
 */
/** `send` found the entry already gone from the queue: another tab sent it. */
const SENT_ELSEWHERE = Symbol("sent-elsewhere");

class Autosave {
  private readonly slots = new Map<string, Slot>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly running = new Set<Promise<unknown>>();
  private readonly runs = new Map<string, () => Promise<void>>();
  private readonly flushers = new Set<() => Promise<void>>();
  /** The version of each item's last successful save, which any later input must follow. */
  private readonly versions = new Map<string, number>();
  private closed = false;
  /** Counts clears, so a save that was waiting on the queue when the person logged out is dropped. */
  private epoch = 0;
  /** Told about a 401 so the app can send the person to the login screen. */
  onUnauthenticated: (error: ApiError) => void = () => {};
  /**
   * Told when a save succeeded that no screen was watching: input an earlier visit left in the
   * queue, sent at start-up. The screens showing that item have an older copy to refresh.
   */
  onUnobservedSave: (userId: string, itemKey: string) => void = () => {};

  private slotId = (userId: string, itemKey: string) => `${userId}|${itemKey}`;

  /** Hears the outcome of every save of one item, including those sent from the queue later. */
  subscribe(userId: string, itemKey: string, listener: Listener): () => void {
    const id = this.slotId(userId, itemKey);
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);
    return () => {
      set.delete(listener);
    };
  }

  private emit(id: string, event: SaveEvent) {
    for (const listener of this.listeners.get(id) ?? []) {
      try {
        listener(event);
      } catch (error) {
        // A screen's handler failing is that screen's bug; it must not unsettle the queue.
        queueMicrotask(() => {
          throw error;
        });
      }
    }
  }

  /**
   * Queues a save of one item and starts sending it. `request.body` carries the changed fields
   * only; fields of an earlier unsent save of the same item are kept unless this one replaces
   * them. `lockVersion` is the version the person's copy was read at.
   */
  async submit(input: {
    userId: string;
    itemKey: string;
    request: QueuedRequest;
    lockVersion: number;
    force?: boolean;
  }): Promise<void> {
    if (this.closed) return;
    const id = this.slotId(input.userId, input.itemKey);
    const epoch = this.epoch;
    // Everything up to the queue write is synchronous: a save submitted while the page is being
    // closed reaches IndexedDB, and two saves submitted in one tick cannot overwrite each other.
    // What an earlier visit left in the queue is not merged here; the screen restored it into the
    // field before the person typed, so the new input already contains it.
    const slot = this.slots.get(id);
    const stored = slot?.entry;
    const entry: PendingEntry = {
      userId: input.userId,
      itemKey: input.itemKey,
      // Input typed while a conflict waits for a choice joins the waiting entry; only the choice
      // ("Overwrite with mine", sent with `force`) lifts the conflict.
      conflict: input.force ? null : (stored?.conflict ?? null),
      queuedAt: stored?.queuedAt ?? Date.now(),
      request: {
        ...input.request,
        body: {
          ...stored?.request.body,
          ...input.request.body,
          lockVersion: input.force
            ? input.lockVersion
            : Math.max(input.lockVersion, this.versions.get(id) ?? 0),
          ...(input.force ? { force: true } : {}),
        },
      },
    };
    if (slot) {
      slot.entry = entry;
      slot.fromQueue = false;
    } else this.slots.set(id, { entry, sending: false, fromQueue: false });
    await pendingQueue.put(entry);
    if (epoch !== this.epoch) {
      await pendingQueue.remove(input.userId, input.itemKey);
      return;
    }
    void this.start(id);
  }

  /**
   * Moves the queued save of an item to a newer version. For a change made to the item by another
   * request of this person (evidence), so the queued input does not clash with the person's own change.
   */
  async rebase(userId: string, itemKey: string, lockVersion: number): Promise<void> {
    const id = this.slotId(userId, itemKey);
    this.versions.set(id, lockVersion);
    const slot = this.slots.get(id);
    if (!slot || slot.entry.conflict || slot.entry.request.body.force === true) return;
    slot.entry.request.body.lockVersion = lockVersion;
    await pendingQueue.put(slot.entry);
  }

  /** Lets a screen's resting input register to be sent before the session ends. */
  registerFlusher(flusher: () => Promise<void>): () => void {
    this.flushers.add(flusher);
    return () => {
      this.flushers.delete(flusher);
    };
  }

  /** Sends all resting input and waits for every request to finish (before logging out). */
  async flushAll(): Promise<void> {
    await Promise.all([...this.flushers].map((flusher) => flusher()));
    await this.idle();
  }

  /** The unsent save of an item that an earlier visit left in the queue, if any. */
  async pending(userId: string, itemKey: string): Promise<PendingEntry | null> {
    return this.slots.get(this.slotId(userId, itemKey))?.entry ?? pendingQueue.get(userId, itemKey);
  }

  /** Forgets the unsent save of an item: the person chose the other copy of a conflict. */
  async discard(userId: string, itemKey: string): Promise<void> {
    this.slots.delete(this.slotId(userId, itemKey));
    this.versions.delete(this.slotId(userId, itemKey));
    await pendingQueue.remove(userId, itemKey);
    await this.clearFailure(userId, itemKey);
  }

  /** Sends the queued saves of `userId` that are waiting (after a reload, a reconnect, a timer). */
  async flush(userId: string): Promise<void> {
    for (const entry of await pendingQueue.list(userId)) {
      const id = this.slotId(userId, entry.itemKey);
      const slot = this.slots.get(id);
      if (slot?.sending || entry.conflict) continue;
      if (!slot) {
        // The list was read before a send may have finished; only what is still queued goes out.
        const fresh = await pendingQueue.get(userId, entry.itemKey);
        if (!fresh || this.slots.has(id)) continue;
        this.slots.set(id, { entry: fresh, sending: false, fromQueue: true });
      }
      void this.start(id);
    }
  }

  /** Whether any request is still on its way. Tests await this. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running]);
  }

  /** Empties the queue and forgets everything in memory (log out). */
  async clear(): Promise<void> {
    this.epoch += 1;
    this.slots.clear();
    this.versions.clear();
    await pendingQueue.clear();
  }

  /**
   * Ends the session's saving: empties the queue and refuses new input until `reopen`, so input
   * still resting in a screen that unmounts afterwards is not written back (log out, delete account).
   */
  async endSession(): Promise<void> {
    this.closed = true;
    await this.clear();
  }

  /** A person is signed in again; saving works. */
  reopen(): void {
    this.closed = false;
  }

  /** The header's Retry for one item: runs the request again unless the item was resolved. */
  private runFor(id: string): () => Promise<void> {
    let run = this.runs.get(id);
    if (!run) {
      run = async () => {
        const slot = this.slots.get(id);
        // A request already on its way ends with the loop that sent it.
        if (!slot || slot.sending) return;
        const error = await this.drain(id);
        if (error) throw error;
      };
      this.runs.set(id, run);
    }
    return run;
  }

  private start(id: string): Promise<void> {
    const slot = this.slots.get(id);
    if (!slot || slot.sending) return Promise.resolve();
    const promise = saveStatus
      .track(this.runFor(id))
      .catch(() => {})
      .finally(() => this.running.delete(promise));
    this.running.add(promise);
    return promise;
  }

  private async clearFailure(userId: string, itemKey: string) {
    const id = this.slotId(userId, itemKey);
    await saveStatus.track(this.runFor(id)).catch(() => {});
  }

  /** Sends the item's request, then the one that queued up behind it. Returns the failure, if any. */
  private async drain(id: string): Promise<ApiError | null> {
    for (;;) {
      const slot = this.slots.get(id);
      if (!slot) return null;
      if (slot.entry.conflict) return new ApiError("CONFLICT", 409, "Waiting for a choice");
      slot.sending = true;
      const sent = slot.entry;
      const known = this.versions.get(id);
      if (known !== undefined && sent.request.body.force !== true) {
        sent.request.body.lockVersion = Math.max(Number(sent.request.body.lockVersion), known);
      }
      try {
        const data = await this.send(sent, slot.fromQueue);
        const version = (data as { lockVersion?: number } | null)?.lockVersion;
        if (data !== SENT_ELSEWHERE && typeof version === "number") this.versions.set(id, version);
        const newer = slot.entry !== sent ? slot.entry : null;
        if (newer) {
          // The merged request was read at the version before this save; it follows this save.
          if (data === SENT_ELSEWHERE) {
            this.emit(id, { type: "sent-elsewhere" });
            this.onUnobservedSave(sent.userId, sent.itemKey);
          } else {
            if (typeof version === "number" && newer.request.body.force !== true) {
              newer.request.body.lockVersion = version;
              if (this.slots.get(id) === slot) await pendingQueue.put(newer);
            }
            this.emit(id, { type: "saved", data });
            this.notifyIfUnobserved(id, sent);
          }
          continue;
        }
        slot.sending = false;
        this.slots.delete(id);
        // Before any await, so input submitted from here on is already told the new version.
        if (data === SENT_ELSEWHERE) {
          this.emit(id, { type: "sent-elsewhere" });
          this.onUnobservedSave(sent.userId, sent.itemKey);
        } else {
          this.emit(id, { type: "saved", data });
          this.notifyIfUnobserved(id, sent);
        }
        await pendingQueue.remove(sent.userId, sent.itemKey);
        // A save submitted while the entry was being removed wrote the same key; put it back.
        const successor = this.slots.get(id);
        if (successor) await pendingQueue.put(successor.entry);
        return null;
      } catch (error) {
        slot.sending = false;
        // Anything that is not an ApiError is a bug in this client; it is reported like a refusal
        // so the input is kept and the header shows the failure.
        const failure = isApiError(error)
          ? error
          : new ApiError("UNKNOWN", 0, error instanceof Error ? error.message : "Unexpected error");
        const refused = await this.fail(id, slot, sent, failure);
        const refusedForGood =
          !isTransient(failure) && !conflictOf(failure) && failure.code !== "UNAUTHENTICATED";
        if (refusedForGood && slot.entry !== sent) continue;
        return refused;
      }
    }
  }

  /**
   * Sends one request. Where Web Locks exist, tabs take turns per item, and a tab whose entry was
   * already sent by another finds it gone from the queue and sends nothing: two tabs flushing the
   * same entry would otherwise conflict with each other's success.
   */
  private async send(entry: PendingEntry, mayBeSentElsewhere: boolean): Promise<unknown> {
    const run = async () => {
      if (mayBeSentElsewhere && !(await pendingQueue.get(entry.userId, entry.itemKey))) {
        return SENT_ELSEWHERE;
      }
      return sendJson(entry.request.method, entry.request.url, entry.request.body);
    };
    const locks = typeof navigator === "undefined" ? undefined : navigator.locks;
    return locks ? locks.request(`moonx-save:${entry.userId}|${entry.itemKey}`, run) : run();
  }

  private notifyIfUnobserved(id: string, sent: PendingEntry) {
    if ((this.listeners.get(id)?.size ?? 0) === 0) this.onUnobservedSave(sent.userId, sent.itemKey);
  }

  private async fail(
    id: string,
    slot: Slot,
    sent: PendingEntry,
    error: ApiError,
  ): Promise<ApiError> {
    // `slot.entry` is the newest input, which may have been merged in while `sent` was in flight.
    if (error.code === "UNAUTHENTICATED") {
      this.onUnauthenticated(error);
      this.emit(id, { type: "failed", error, willRetry: true });
      return error;
    }
    if (isTransient(error)) {
      this.emit(id, { type: "failed", error, willRetry: true });
      return error;
    }
    const current = conflictOf(error);
    if (current) {
      slot.entry = { ...slot.entry, conflict: current };
      if (this.slots.get(id) === slot) await pendingQueue.put(slot.entry);
      this.emit(id, { type: "conflict", current });
      return error;
    }
    // A refusal of the request itself. Input merged in meanwhile is a fresh attempt, so it stays.
    if (slot.entry === sent) {
      this.slots.delete(id);
      await pendingQueue.remove(sent.userId, sent.itemKey);
    }
    this.emit(id, { type: "failed", error, willRetry: false });
    return error;
  }
}

export const autosave = new Autosave();
