import type { ConflictCurrent } from "@moonx/schemas";

/** The request a save sends, kept as plain data so it survives a reload (ADR-021). */
export interface QueuedRequest {
  method: "PUT" | "PATCH";
  url: string;
  body: Record<string, unknown>;
}

/** One item's latest unsent save. Only the newest input of an item is kept (ADR-021). */
export interface PendingEntry {
  userId: string;
  itemKey: string;
  request: QueuedRequest;
  /** Set when a send got 409; the entry waits for the person to choose (design-spec 6.0.2). */
  conflict: ConflictCurrent | null;
  queuedAt: number;
}

const DB_NAME = "moonx-pending";
const STORE = "saves";

const idOf = (userId: string, itemKey: string) => `${userId}|${itemKey}`;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE, { keyPath: "id" });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error("IndexedDB is blocked"));
  });
}

interface Row extends PendingEntry {
  id: string;
}

/**
 * The queue of unsent saves (ADR-021). IndexedDB keeps it across reloads and tabs. A browser
 * that refuses IndexedDB (private windows, blocked site data) keeps it in memory instead: the
 * entries then survive a lost connection but not a reload, which is the most such a browser can do.
 */
export class PendingQueue {
  private database: Promise<IDBDatabase | null> | undefined;
  private readonly memory = new Map<string, Row>();

  private db(): Promise<IDBDatabase | null> {
    this.database ??= (typeof indexedDB === "undefined" ? Promise.reject() : openDatabase()).catch(
      () => null,
    );
    return this.database;
  }

  private async withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
    fallback: () => T,
  ): Promise<T> {
    const db = await this.db();
    if (!db) return fallback();
    try {
      return await run(db.transaction(STORE, mode).objectStore(STORE));
    } catch {
      return fallback();
    }
  }

  async put(entry: PendingEntry): Promise<void> {
    const row: Row = { ...entry, id: idOf(entry.userId, entry.itemKey) };
    this.memory.set(row.id, row);
    await this.withStore(
      "readwrite",
      async (store) => {
        await requestResult(store.put(row));
      },
      () => undefined,
    );
  }

  async get(userId: string, itemKey: string): Promise<PendingEntry | null> {
    const id = idOf(userId, itemKey);
    return this.withStore(
      "readonly",
      async (store) => ((await requestResult(store.get(id))) as Row | undefined) ?? null,
      () => this.memory.get(id) ?? null,
    );
  }

  async list(userId: string): Promise<PendingEntry[]> {
    const rows = await this.withStore(
      "readonly",
      async (store) => (await requestResult(store.getAll())) as Row[],
      () => [...this.memory.values()],
    );
    return rows.filter((row) => row.userId === userId).sort((a, b) => a.queuedAt - b.queuedAt);
  }

  async remove(userId: string, itemKey: string): Promise<void> {
    const id = idOf(userId, itemKey);
    this.memory.delete(id);
    await this.withStore(
      "readwrite",
      async (store) => {
        await requestResult(store.delete(id));
      },
      () => undefined,
    );
  }

  /** Drops every entry that is not `userId`'s: a different person signed in on this browser. */
  async removeOthers(userId: string): Promise<void> {
    const rows = await this.withStore(
      "readonly",
      async (store) => (await requestResult(store.getAll())) as Row[],
      () => [...this.memory.values()],
    );
    await Promise.all(
      rows
        .filter((row) => row.userId !== userId)
        .map((row) => this.remove(row.userId, row.itemKey)),
    );
  }

  /** Empties the queue (log out). */
  async clear(): Promise<void> {
    this.memory.clear();
    await this.withStore(
      "readwrite",
      async (store) => {
        await requestResult(store.clear());
      },
      () => undefined,
    );
  }
}

export const pendingQueue = new PendingQueue();
