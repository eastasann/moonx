import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiError } from "./api";
import {
  type Autosave,
  createAutosave,
  RETRY_DELAYS_MS,
  type SaveTarget,
  saveStateOf,
  TYPING_PAUSE_MS,
  UNREACHABLE_AFTER,
} from "./autosave";

// The saves of the page (ADR-021, design-spec 6.0.2).

const network = () =>
  new ApiError({ status: null, code: null, requestId: null });
const refused = (status: number, code: ApiError["code"], detail = {}) =>
  new ApiError({ status, code, requestId: "8f14e45f-0000", detail });

const current = {
  value: { name: "Theirs", oneLineConcept: "c", proposedSolution: null },
  lockVersion: 7,
  updatedAt: "2026-10-18T01:00:00.000Z",
  updatedBy: {
    id: "0f8fad5b-d9cb-469f-a165-70867728950e",
    displayName: "Paolo Gonzaga",
    avatarUrl: null,
    badge: null,
  },
};

interface Sent {
  fields: Record<string, unknown>;
  lockVersion: number;
  force: boolean;
}

/** A target whose sends answer as `answer` decides, with every send kept. */
function targetOf(answer: (sent: Sent) => Promise<number>) {
  const sent: Sent[] = [];
  const loaded: unknown[] = [];
  const target: SaveTarget = {
    key: "idea:a",
    noun: "summary",
    send: (fields, lockVersion, force) => {
      const call = { fields: { ...fields }, lockVersion, force };
      sent.push(call);
      return answer(call);
    },
    loadTheirs: (theirs) => loaded.push(theirs),
  };
  return { target, sent, loaded };
}

let online = true;
let autosave: Autosave;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers();
  online = true;
  autosave = createAutosave({ isBrowserOnline: () => online });
  stop = autosave.start();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

const statusOf = () => autosave.getState().items.get("idea:a")?.status;

describe("when a save goes out", () => {
  test("once typing pauses, the newest value, with the version the screen holds", async () => {
    const { target, sent } = targetOf(
      async ({ lockVersion }) => lockVersion + 1,
    );
    autosave.change(target, 3, { name: "P" });
    autosave.change(target, 3, { name: "Pi" });
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS - 1);
    expect(sent).toEqual([]);
    expect(statusOf()).toBe("waiting");
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([
      { fields: { name: "Pi" }, lockVersion: 3, force: false },
    ]);
    expect(statusOf()).toBe("saved");
    expect(autosave.hasUnsaved()).toBe(false);
  });

  test("leaving the field sends at once; the next save takes the version the last one left", async () => {
    const { target, sent } = targetOf(
      async ({ lockVersion }) => lockVersion + 1,
    );
    autosave.change(target, 3, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.change(target, 3, { oneLineConcept: "B" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    expect(sent.map(({ lockVersion }) => lockVersion)).toEqual([3, 4]);
  });

  test("one save of an item at a time: what is typed meanwhile follows the answer", async () => {
    let finish: (version: number) => void = () => {};
    const { target, sent } = targetOf(
      () => new Promise((resolve) => (finish = resolve)),
    );
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    autosave.change(target, 1, { oneLineConcept: "B" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS);
    expect(sent).toHaveLength(1);
    finish(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[1]).toEqual({
      fields: { oneLineConcept: "B" },
      lockVersion: 2,
      force: false,
    });
  });

  test("input that breaks its rules is dropped, not sent", async () => {
    const { target, sent } = targetOf(async () => 2);
    autosave.change(target, 1, { name: "A" });
    autosave.discard("idea:a", ["name"]);
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS);
    expect(sent).toEqual([]);
    expect(autosave.hasUnsaved()).toBe(false);
  });
});

describe("when a save fails", () => {
  test("for now: sent again by itself, with longer waits, until it passes", async () => {
    let failures = 2;
    const { target, sent } = targetOf(async () => {
      if (failures-- > 0) throw refused(503, "UPSTREAM_UNAVAILABLE");
      return 2;
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusOf()).toBe("retrying");
    expect(saveStateOf(autosave.getState(), "idea:", 0)).toBe("save-failed");
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0] ?? 0);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync((RETRY_DELAYS_MS[1] ?? 0) - 1);
    expect(sent).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toHaveLength(3);
    expect(statusOf()).toBe("saved");
  });

  test("on the network again and again: unreachable, as offline, until one passes", async () => {
    let failing = true;
    const { target } = targetOf(async () => {
      if (failing) throw network();
      return 2;
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    for (let attempt = 1; attempt < UNREACHABLE_AFTER; attempt += 1) {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
    expect(autosave.getState().isUnreachable).toBe(true);
    failing = false;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(autosave.getState().isUnreachable).toBe(false);
    expect(statusOf()).toBe("saved");
  });

  test("unreachable ends once any answer comes, or the browser says it is online", async () => {
    let answer: () => number = () => {
      throw network();
    };
    const { target } = targetOf(async () => answer());
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    for (let attempt = 1; attempt < UNREACHABLE_AFTER; attempt += 1) {
      await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[attempt - 1] ?? 0);
    }
    expect(autosave.getState().isUnreachable).toBe(true);
    window.dispatchEvent(new Event("online"));
    expect(autosave.getState().isUnreachable).toBe(false);
    for (let attempt = 0; attempt < UNREACHABLE_AFTER; attempt += 1) {
      await vi.advanceTimersByTimeAsync(30_000);
    }
    expect(autosave.getState().isUnreachable).toBe(true);
    answer = () => {
      throw refused(409, "ARCHIVED");
    };
    await vi.advanceTimersByTimeAsync(30_000);
    expect(statusOf()).toBe("rejected");
    expect(autosave.getState().isUnreachable).toBe(false);
  });

  test("refused for good: not sent again until Retry; the screen hears of it", async () => {
    const onRejected = vi.fn();
    autosave = createAutosave({ onRejected, isBrowserOnline: () => online });
    const { target, sent } = targetOf(async () => {
      throw refused(409, "ARCHIVED");
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
    expect(statusOf()).toBe("rejected");
    expect(onRejected).toHaveBeenCalledOnce();
    expect(autosave.hasUnsaved()).toBe(true);
    autosave.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
    expect(statusOf()).toBe("rejected");
  });

  test("typing after a refusal waits for Retry too", async () => {
    const { target, sent } = targetOf(async () => {
      throw refused(403, "FORBIDDEN");
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.change(target, 1, { name: "AB" });
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS * 2);
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(statusOf()).toBe("rejected");
  });

  test("offline: held, and sent once the browser is back", async () => {
    const { target, sent } = targetOf(async () => 2);
    online = false;
    autosave.change(target, 1, { name: "A" });
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS);
    expect(sent).toEqual([]);
    expect(statusOf()).toBe("retrying");
    online = true;
    window.dispatchEvent(new Event("online"));
    expect(autosave.getState().isReconnecting).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(1);
    expect(autosave.getState().isReconnecting).toBe(false);
    expect(statusOf()).toBe("saved");
  });
});

describe("a conflict (ADR-019)", () => {
  test("waits for the answer; overwrite sends again with force", async () => {
    let first = true;
    const { target, sent } = targetOf(async () => {
      if (first) {
        first = false;
        throw refused(409, "CONFLICT", { current });
      }
      return 8;
    });
    autosave.change(target, 3, { name: "Mine" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    expect(statusOf()).toBe("conflict");
    expect(autosave.getState().items.get("idea:a")?.conflict).toEqual(current);
    // Typing goes on, but nothing goes out until the user answers.
    autosave.change(target, 3, { name: "Mine too" });
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS * 2);
    expect(sent).toHaveLength(1);
    autosave.resolveConflict("idea:a", "overwrite");
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[1]).toEqual({
      fields: { name: "Mine too" },
      lockVersion: current.lockVersion,
      force: true,
    });
    expect(statusOf()).toBe("saved");
  });

  test("Retry sends a conflict's input again, which meets the other save and asks again", async () => {
    const { target, sent } = targetOf(async () => {
      throw refused(409, "CONFLICT", { current });
    });
    autosave.change(target, 3, { name: "Mine" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
    expect(statusOf()).toBe("conflict");
  });

  test("typing during the send that meets the conflict sends nothing past it", async () => {
    let finish: (error: unknown) => void = () => {};
    const { target, sent } = targetOf(
      () => new Promise((_, reject) => (finish = reject)),
    );
    autosave.change(target, 3, { name: "Mine" });
    autosave.flush("idea:a");
    autosave.change(target, 3, { name: "Mine too" });
    finish(refused(409, "CONFLICT", { current }));
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS * 3);
    expect(sent).toHaveLength(1);
    expect(statusOf()).toBe("conflict");
  });

  test("overwrite sends on their version", async () => {
    let first = true;
    const { target, sent } = targetOf(async () => {
      if (first) {
        first = false;
        throw refused(409, "CONFLICT", { current });
      }
      return 8;
    });
    autosave.change(target, 3, { name: "Mine" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.resolveConflict("idea:a", "overwrite");
    await vi.advanceTimersByTimeAsync(0);
    expect(sent[1]).toMatchObject({
      lockVersion: current.lockVersion,
      force: true,
    });
  });

  test("Load theirs drops the input and puts theirs in place", async () => {
    const { target, loaded } = targetOf(async () => {
      throw refused(409, "CONFLICT", { current });
    });
    autosave.change(target, 3, { name: "Mine" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.resolveConflict("idea:a", "loadTheirs");
    expect(loaded).toEqual([current]);
    expect(autosave.hasUnsaved()).toBe(false);
  });
});

describe("a lost session (design-spec M9)", () => {
  test("holds the input for M9 and sends it once signed in again", async () => {
    let signedIn = false;
    const { target, sent } = targetOf(async () => {
      if (!signedIn) throw refused(401, "UNAUTHENTICATED");
      return 2;
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sent).toHaveLength(1);
    expect(autosave.getState().needsSignIn).toBe(true);
    expect(statusOf()).toBe("signedOut");
    signedIn = true;
    autosave.resumeAfterSignIn();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toHaveLength(2);
    expect(autosave.getState().needsSignIn).toBe(false);
    expect(statusOf()).toBe("saved");
  });

  test("leaving for the login page or logging out drops it all", async () => {
    const { target } = targetOf(async () => {
      throw refused(401, "UNAUTHENTICATED");
    });
    autosave.change(target, 1, { name: "A" });
    autosave.flush("idea:a");
    await vi.advanceTimersByTimeAsync(0);
    autosave.discardAll();
    expect(autosave.hasUnsaved()).toBe(false);
    expect(autosave.getState().needsSignIn).toBe(false);
  });
});

describe("the header's save state (design-spec 6.0.1・6.0.2)", () => {
  test("nothing until the screen's item saves on this visit; then Saved", async () => {
    const { target } = targetOf(async () => 2);
    expect(saveStateOf(autosave.getState(), "idea:a", 0)).toBeUndefined();
    autosave.change(target, 1, { name: "A" });
    expect(saveStateOf(autosave.getState(), "idea:a", 0)).toBe("saving");
    // A screen that saves nothing shows a save on its way all the same.
    expect(saveStateOf(autosave.getState(), undefined, 0)).toBe("saving");
    await vi.advanceTimersByTimeAsync(TYPING_PAUSE_MS);
    expect(saveStateOf(autosave.getState(), "idea:a", 0)).toBe("saved");
    expect(saveStateOf(autosave.getState(), "idea:b", 0)).toBeUndefined();
    expect(
      saveStateOf(autosave.getState(), "idea:a", Date.now() + 1),
    ).toBeUndefined();
  });
});
