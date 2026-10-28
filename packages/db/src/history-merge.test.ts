import { describe, expect, test } from "bun:test";
import {
  HISTORY_MERGE_WINDOW_MS,
  type HistoryMergeFacts,
  mergesIntoLatest,
} from "./history-merge";
import { type HistoryInput, HistoryLog } from "./seed/context";

const at = new Date("2026-10-29T01:00:00.000Z");
const later = (ms: number) => new Date(at.getTime() + ms);
const edit: HistoryMergeFacts = {
  action: "update",
  source: "manual",
  batchId: null,
  changedById: "ana",
  changedAt: at,
};

describe("mergesIntoLatest (ADR-020)", () => {
  test("merges the same person's manual update within the window, up to its end", () => {
    for (const ms of [0, 1, HISTORY_MERGE_WINDOW_MS]) {
      expect(mergesIntoLatest(edit, { ...edit, changedAt: later(ms) })).toBe(
        true,
      );
    }
    // Another instance's clock may date it a little before the row.
    expect(mergesIntoLatest(edit, { ...edit, changedAt: later(-5) })).toBe(
      true,
    );
  });

  test("keeps apart what is past the window, someone else's, or not a manual update", () => {
    const next = { ...edit, changedAt: later(60_000) };
    expect(
      mergesIntoLatest(edit, {
        ...edit,
        changedAt: later(HISTORY_MERGE_WINDOW_MS + 1),
      }),
    ).toBe(false);
    expect(mergesIntoLatest(edit, { ...next, changedById: "paolo" })).toBe(
      false,
    );
    for (const action of ["create", "delete", "restore"] as const) {
      expect(mergesIntoLatest({ ...edit, action }, next)).toBe(false);
      expect(mergesIntoLatest(edit, { ...next, action })).toBe(false);
    }
    for (const source of [
      "ai_import",
      "revert",
      "template_migration",
      "duplicate",
      "plan_draft",
    ] as const) {
      expect(mergesIntoLatest({ ...edit, source }, next)).toBe(false);
      expect(mergesIntoLatest(edit, { ...next, source })).toBe(false);
    }
    expect(mergesIntoLatest({ ...edit, batchId: "b" }, next)).toBe(false);
    expect(mergesIntoLatest(edit, { ...next, batchId: "b" })).toBe(false);
  });
});

describe("the seed's history (HistoryLog)", () => {
  const input = (
    minutes: number,
    by: "ana" | "kenji" = "ana",
  ): HistoryInput => ({
    container: {
      type: "validation",
      id: "validation",
      workspaceId: "workspace",
      ownerUserId: null,
    },
    sectionKey: "01",
    target: { type: "validation_answer", id: "validation", key: "V.01.WHO" },
    action: "update",
    before: { text: "a" },
    after: { text: "b" },
    source: "manual",
    by,
    at: later(minutes * 60_000),
  });

  test("refuses two rows of an item the API would have merged, in whatever order they come", () => {
    const log = new HistoryLog();
    log.add(input(0));
    expect(() => log.add(input(5))).toThrow(
      "The API would merge two history rows",
    );
    const backwards = new HistoryLog();
    backwards.add(input(30));
    expect(() => backwards.add(input(25))).toThrow(
      "The API would merge two history rows",
    );
  });

  test("takes rows the API keeps apart", () => {
    const log = new HistoryLog();
    log.add(input(0));
    log.add(input(5, "kenji"));
    log.add(input(20));
    log.add({ ...input(22), source: "ai_import", batch: "import" });
    log.add({ ...input(23), target: { type: "idea", id: "idea" } });
    expect(log.rows).toHaveLength(5);
  });
});
