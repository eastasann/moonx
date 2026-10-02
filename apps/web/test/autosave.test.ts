import type { ConflictCurrent } from "@moonx/schemas";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { autosave, type SaveEvent } from "../src/lib/autosave";
import { PendingQueue, pendingQueue } from "../src/lib/pending-queue";
import { saveStatus } from "../src/lib/save-status";

const USER = "user-1";
const KEY = "answer:v1:V.01.WHO";
const URL = "/api/v1/validations/v1/answers/V.01.WHO";
const request = (body: Record<string, unknown>) => ({ method: "PUT" as const, url: URL, body });

const ok = (body: unknown = {}) => Response.json(body);
const failure = (status: number, error: Record<string, unknown>) =>
  Response.json({ error: { message: "x", requestId: "abcdef12", ...error } }, { status });

interface Sent {
  method: string;
  url: string;
  body: Record<string, unknown>;
}
let sent: Sent[];
let answers: (() => Response | Promise<Response>)[];
let events: SaveEvent[];
let unsubscribe: () => void;

beforeEach(() => {
  sent = [];
  answers = [];
  events = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        method: init?.method ?? "GET",
        url: String(input),
        body: JSON.parse(String(init?.body ?? "{}")),
      });
      const answer = answers.shift();
      if (!answer) throw new TypeError("no answer queued");
      return answer();
    }),
  );
  unsubscribe = autosave.subscribe(USER, KEY, (event) => events.push(event));
});

afterEach(async () => {
  unsubscribe();
  await autosave.idle();
  await autosave.clear();
  autosave.onUnauthenticated = () => {};
  vi.unstubAllGlobals();
});

test("a save is sent with its lockVersion, then leaves the queue", async () => {
  answers.push(() => ok({ lockVersion: 1, text: "Office workers" }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "Office workers" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(sent).toEqual([
    { method: "PUT", url: URL, body: { text: "Office workers", lockVersion: 0 } },
  ]);
  expect(await pendingQueue.list(USER)).toEqual([]);
  expect(events).toEqual([{ type: "saved", data: { lockVersion: 1, text: "Office workers" } }]);
});

test("input that arrives during a save is merged and follows with the new version", async () => {
  let finishFirst: (response: Response) => void = () => {};
  answers.push(() => new Promise<Response>((resolve) => (finishFirst = resolve)));
  answers.push(() => ok({ lockVersion: 5 }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "a" }),
    lockVersion: 3,
  });
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "ab" }),
    lockVersion: 3,
  });
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ classification: { fau: "unknown" } }),
    lockVersion: 3,
  });
  finishFirst(ok({ lockVersion: 4 }));
  await autosave.idle();
  expect(sent.map((s) => s.body)).toEqual([
    { text: "a", lockVersion: 3 },
    { text: "ab", classification: { fau: "unknown" }, lockVersion: 4 },
  ]);
  expect(await pendingQueue.list(USER)).toEqual([]);
});

test("a lost connection keeps the input and the header offers Retry; a later flush sends it", async () => {
  answers.push(() => {
    throw new TypeError("offline");
  });
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "typed offline" }),
    lockVersion: 2,
  });
  await autosave.idle();
  expect(events[0]).toMatchObject({ type: "failed", willRetry: true });
  expect(saveStatus.getSnapshot().status).toBe("error");
  const [kept] = await pendingQueue.list(USER);
  expect(kept?.request.body).toEqual({ text: "typed offline", lockVersion: 2 });

  answers.push(() => ok({ lockVersion: 3 }));
  await autosave.flush(USER);
  await autosave.idle();
  expect(sent.at(-1)?.body).toEqual({ text: "typed offline", lockVersion: 2 });
  expect(await pendingQueue.list(USER)).toEqual([]);
  expect(saveStatus.getSnapshot().status).toBe("saved");
});

test("a server failure is retried like a lost connection", async () => {
  answers.push(() => failure(503, { code: "UPSTREAM_UNAVAILABLE" }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "x" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(events[0]).toMatchObject({ type: "failed", willRetry: true });
  expect(await pendingQueue.list(USER)).toHaveLength(1);
});

test("a 409 waits for the person's choice and is not retried", async () => {
  const current: ConflictCurrent = {
    value: { text: "Paolo's text" },
    lockVersion: 7,
    updatedAt: "2026-10-02T02:00:00.000Z",
    updatedBy: null,
  };
  answers.push(() => failure(409, { code: "CONFLICT", current }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "mine" }),
    lockVersion: 6,
  });
  await autosave.idle();
  expect(events[0]).toEqual({ type: "conflict", current });
  const [waiting] = await pendingQueue.list(USER);
  expect(waiting?.conflict).toEqual(current);

  await autosave.flush(USER);
  await autosave.idle();
  expect(sent).toHaveLength(1);

  answers.push(() => ok({ lockVersion: 8 }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "mine" }),
    lockVersion: 7,
    force: true,
  });
  await autosave.idle();
  expect(sent.at(-1)?.body).toEqual({ text: "mine", lockVersion: 7, force: true });
  expect(await pendingQueue.list(USER)).toEqual([]);
});

test("discarding a conflicted save drops it and clears the header error", async () => {
  answers.push(() => failure(409, { code: "CONFLICT", current: { lockVersion: 2 } }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "mine" }),
    lockVersion: 1,
  });
  await autosave.idle();
  expect(saveStatus.getSnapshot().status).toBe("error");
  await autosave.discard(USER, KEY);
  expect(await pendingQueue.list(USER)).toEqual([]);
  expect(saveStatus.getSnapshot().status).toBe("saved");
});

test("a 401 keeps the input for the same person and reports the lost session", async () => {
  const onUnauthenticated = vi.fn();
  autosave.onUnauthenticated = onUnauthenticated;
  answers.push(() => failure(401, { code: "UNAUTHENTICATED" }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "kept" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(onUnauthenticated).toHaveBeenCalledTimes(1);
  expect(await pendingQueue.list(USER)).toHaveLength(1);
});

test("a save the server refuses is dropped and reported as final", async () => {
  answers.push(() => failure(422, { code: "VALIDATION_FAILED" }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "x" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(events[0]).toMatchObject({ type: "failed", willRetry: false });
  expect(await pendingQueue.list(USER)).toEqual([]);
});

test("another person's input is dropped, and logging out empties the queue", async () => {
  await pendingQueue.put({
    userId: "someone-else",
    itemKey: KEY,
    request: request({ text: "theirs", lockVersion: 0 }),
    conflict: null,
    queuedAt: 1,
  });
  await pendingQueue.put({
    userId: USER,
    itemKey: "answer:v1:V.01.PROBLEM",
    request: request({ text: "mine", lockVersion: 0 }),
    conflict: null,
    queuedAt: 2,
  });
  await pendingQueue.removeOthers(USER);
  expect(await pendingQueue.list("someone-else")).toEqual([]);
  expect(await pendingQueue.list(USER)).toHaveLength(1);
  await autosave.clear();
  expect(await pendingQueue.list(USER)).toEqual([]);
});

test("the queue works when IndexedDB is refused (in-memory fallback)", async () => {
  vi.stubGlobal("indexedDB", undefined);
  const memoryQueue = new PendingQueue();
  await memoryQueue.put({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "kept in memory", lockVersion: 0 }),
    conflict: null,
    queuedAt: 1,
  });
  expect((await memoryQueue.get(USER, KEY))?.request.body.text).toBe("kept in memory");
  expect(await memoryQueue.list(USER)).toHaveLength(1);
  await memoryQueue.remove(USER, KEY);
  expect(await memoryQueue.get(USER, KEY)).toBeNull();
});

test("input typed while a conflict waits joins the waiting entry and keeps the conflict", async () => {
  const current: ConflictCurrent = {
    value: {},
    lockVersion: 7,
    updatedAt: "2026-10-02T02:00:00.000Z",
    updatedBy: null,
  };
  answers.push(() => failure(409, { code: "CONFLICT", current }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "mine", classification: { fau: "unknown" } }),
    lockVersion: 6,
  });
  await autosave.idle();
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "mine, edited" }),
    lockVersion: 6,
  });
  await autosave.idle();
  const [entry] = await pendingQueue.list(USER);
  expect(entry?.conflict).toEqual(current);
  expect(entry?.request.body).toEqual({
    text: "mine, edited",
    classification: { fau: "unknown" },
    lockVersion: 6,
  });
  expect(sent).toHaveLength(1);
});

test("rebase moves the queued input to the version another request of the person produced", async () => {
  answers.push(() => {
    throw new TypeError("offline");
  });
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "waiting" }),
    lockVersion: 2,
  });
  await autosave.idle();
  await autosave.rebase(USER, KEY, 5);
  expect((await pendingQueue.list(USER))[0]?.request.body.lockVersion).toBe(5);
});

test("logging out sends resting input first, and a save finishing after the clear leaves nothing behind", async () => {
  let rest: Record<string, unknown> | null = { text: "resting" };
  const unregister = autosave.registerFlusher(async () => {
    if (!rest) return;
    const body = rest;
    rest = null;
    await autosave.submit({ userId: USER, itemKey: KEY, request: request(body), lockVersion: 0 });
  });
  answers.push(() => ok({ lockVersion: 1 }));
  await autosave.flushAll();
  unregister();
  expect(sent.map((s) => s.body)).toEqual([{ text: "resting", lockVersion: 0 }]);

  let finish: (response: Response) => void = () => {};
  answers.push(() => new Promise<Response>((resolve) => (finish = resolve)));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "in flight" }),
    lockVersion: 1,
  });
  await autosave.clear();
  finish(failure(409, { code: "CONFLICT", current: { lockVersion: 9 } }));
  await autosave.idle();
  expect(await pendingQueue.list(USER)).toEqual([]);
});

test("input submitted right after a save follows the version that save returned", async () => {
  answers.push(() => ok({ lockVersion: 4 }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "first" }),
    lockVersion: 3,
  });
  await autosave.idle();
  answers.push(() => ok({ lockVersion: 5 }));
  // The screen has not heard about version 4 yet and still submits with 3.
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "second" }),
    lockVersion: 3,
  });
  await autosave.idle();
  expect(sent.map((s) => s.body.lockVersion)).toEqual([3, 4]);
});

test("after the session ends nothing is written back to the queue until a person signs in", async () => {
  await autosave.endSession();
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "typed while signing out" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(sent).toEqual([]);
  expect(await pendingQueue.list(USER)).toEqual([]);
  autosave.reopen();
  answers.push(() => ok({ lockVersion: 1 }));
  await autosave.submit({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "new session" }),
    lockVersion: 0,
  });
  await autosave.idle();
  expect(sent).toHaveLength(1);
});

test("an entry another tab already sent is not sent again, and the screen is told", async () => {
  await pendingQueue.put({
    userId: USER,
    itemKey: KEY,
    request: request({ text: "sent by the other tab", lockVersion: 0 }),
    conflict: null,
    queuedAt: 1,
  });
  const unobserved = vi.fn();
  autosave.onUnobservedSave = unobserved;
  const pendingFlush = autosave.flush(USER);
  // The other tab finishes its send and removes the entry while this tab is listing.
  await pendingQueue.remove(USER, KEY);
  await pendingFlush;
  await autosave.idle();
  expect(sent).toEqual([]);
  autosave.onUnobservedSave = () => {};
});
