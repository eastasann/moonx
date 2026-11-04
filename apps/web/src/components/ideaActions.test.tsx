import type { HistoryEntry, Me, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sentry from "../lib/sentry";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { ideaSummary, validationHome, workspaceId } from "../test/ideas";
import { questionsRead, section01, validationId } from "../test/validation";

// The idea's actions from 6 and 13, and the undo of a creation, failing (design-spec 6.8,
// 6.0.5「作成の取り消し」, 6.0.6's rule for what a row or a button sends).

const bowl = validationHome();
const copyId = "c0000000-0000-4000-8000-000000000001";
const batchId = "b0000000-0000-4000-8000-000000000001";
const copy = validationHome({
  id: copyId,
  name: "Bacolod Health Bowl (copy)",
  duplicatedFrom: { id: bowl.idea.id, name: bowl.idea.name },
});
const piaya = ideaSummary(
  "a2809bdc-f3d5-4f7f-b5db-afef39019de0",
  "Piaya Gift Box Delivery",
);
const ideasPath = `/w/${workspaceId}/ideas`;
const bowlPath = `${ideasPath}/${bowl.idea.id}`;
const copyPath = `${ideasPath}/${copyId}`;
const duplicatePath = `/api/v1/ideas/${bowl.idea.id}/duplicate`;
const revertPath = `/api/v1/history/batches/${batchId}/revert`;
const copyHomePath = `/api/v1/ideas/${copyId}/validation`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

afterEach(async () => {
  // One queue serves every render of the app: a toast left up would show in the next test.
  const user = userEvent.setup();
  for (const toast of screen.queryAllByRole("alertdialog")) {
    const close = within(toast).queryByRole("button", { name: "Close" });
    if (close !== null) await user.click(close);
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** The toast that says `words` (a screen may say them too: 13's "Duplicated from …"). */
async function toastSaying(words: string) {
  return waitFor(() => {
    const toast = screen
      .getAllByText(words)
      .map((text) => text.closest<HTMLElement>('[role="alertdialog"]'))
      .findLast((found) => found !== null);
    if (toast == null) throw new Error(`"${words}" is not in a toast`);
    return toast;
  });
}

/**
 * The API of 6 and 13 for Bacolod Health Bowl and its copy, and of 11 with its history
 * (`history`). `write` answers the actions (I3 duplicate, I4 archive and restore) and H3
 * first; undefined lets them through. `me` and whether the idea and its copy are archived
 * are read at each call, as what changes meanwhile.
 */
function actionsApi({
  me = () => ana,
  items = [bowl.idea, piaya],
  archived = () => false,
  copyArchived = () => false,
  history = [],
  write = () => undefined,
  readHome = () => undefined,
}: {
  me?: () => Me;
  items?: unknown[];
  /** Bacolod Health Bowl is archived. */
  archived?: () => boolean;
  copyArchived?: () => boolean;
  history?: HistoryEntry[];
  write?: (call: Call) => Response | undefined;
  /** Answers Bacolod Health Bowl's V1 first; undefined lets it through. */
  readHome?: () => Response | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (path === "/api/v1/me") return Response.json(me());
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/workspaces/${workspaceId}/ideas?`)
    ) {
      return Response.json({ items, nextCursor: null, hiddenDroppedCount: 0 });
    }
    if (path === `/api/v1/workspaces/${workspaceId}/members`) {
      return Response.json({ items: [] });
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${bowl.idea.id}/validation`
    ) {
      return (
        readHome() ??
        Response.json({
          ...bowl,
          idea: { ...bowl.idea, archived: archived() },
        })
      );
    }
    if (method === "GET" && path === `/api/v1/ideas/${piaya.id}/validation`) {
      return Response.json(validationHome({ id: piaya.id, name: piaya.name }));
    }
    if (method === "GET" && path === copyHomePath) {
      return Response.json({
        ...copy,
        idea: { ...copy.idea, archived: copyArchived() },
      });
    }
    if (
      method === "GET" &&
      path === `/api/v1/validations/${validationId}/questions/01`
    ) {
      return Response.json(questionsRead(section01));
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    if (method === "GET" && path.startsWith("/api/v1/history?")) {
      return Response.json({ items: history, nextCursor: null });
    }
    if (method !== "POST") return undefined;
    const answered = write(call);
    if (answered !== undefined) return answered;
    if (path === duplicatePath) {
      return Response.json({ ...copy.idea, batchId }, { status: 201 });
    }
    if (path === revertPath) return Response.json({ reverted: 12, batchId });
    if (path.startsWith(`/api/v1/ideas/${bowl.idea.id}/`)) {
      return Response.json({
        ...bowl.idea,
        archived: path.endsWith("/archive"),
      });
    }
    return undefined;
  });
}

const posts = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === "POST" && call.path === path);

const reads = (calls: Call[], path: string) =>
  calls.filter((call) => call.method === "GET" && call.path === path).length;

/** Fails the first send to `path` with `failure`, and lets the next through. */
function failingOnce(path: string, failure: () => Response) {
  let tries = 0;
  return (call: Call) => {
    if (call.path !== path) return undefined;
    tries += 1;
    return tries === 1 ? failure() : undefined;
  };
}

/** Opens the ⋯ of Bacolod Health Bowl (6's row, 13's tools) and picks `action`. */
async function pick(action: string) {
  const user = userEvent.setup();
  const [more] = await screen.findAllByRole("button", {
    name: "More for Bacolod Health Bowl",
  });
  await user.click(more as HTMLElement);
  await user.click(await screen.findByRole("menuitem", { name: action }));
  return user;
}

const unexpected = () => apiError(500, "INTERNAL");
const rateLimited = () =>
  apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 });

describe("6's and 13's actions that fail (design-spec 6.8, 6.0.6)", () => {
  test.each([
    ["6", ideasPath],
    ["13", bowlPath],
  ])(
    "%s: Duplicate meets an unexpected failure: the Ref and Retry, which sends it again",
    async (_, at) => {
      const calls = actionsApi({
        write: failingOnce(duplicatePath, unexpected),
      });
      const router = renderApp(at);
      const user = await pick("Duplicate");
      const toast = await toastSaying("Something went wrong. Ref: 8f14e45f");
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(router.state.location.pathname).toBe(copyPath),
      );
      expect(posts(calls, duplicatePath).map(({ body }) => body)).toEqual([
        {},
        {},
      ]);
    },
  );

  test.each([
    ["6", "Duplicate", ideasPath, false],
    ["6", "Archive", ideasPath, false],
    ["6", "Restore", `${ideasPath}?archived=true`, true],
    ["13", "Duplicate", bowlPath, false],
    ["13", "Archive", bowlPath, false],
    ["13", "Restore", bowlPath, true],
  ] as const)(
    "%s: %s meets the rate limit, then an unexpected failure: the wait, the Ref, and Retry sends it again",
    async (_, action, at, archived) => {
      const path = `/api/v1/ideas/${bowl.idea.id}/${action.toLowerCase()}`;
      let tries = 0;
      const calls = actionsApi({
        archived: () => archived,
        items: [{ ...bowl.idea, archived }, piaya],
        write: (call) => {
          if (call.path !== path) return undefined;
          tries += 1;
          return tries === 1
            ? rateLimited()
            : tries === 2
              ? unexpected()
              : undefined;
        },
      });
      renderApp(at);
      const user = userEvent.setup();
      if (at === bowlPath && action === "Restore") {
        // 13's archived notice holds Restore (design-spec 6.1).
        await user.click(
          await screen.findByRole("button", { name: "Restore" }),
        );
      } else {
        await pick(action);
      }
      const waiting = await toastSaying(
        "Too many attempts. Try again in 1 minute.",
      );
      await user.click(within(waiting).getByRole("button", { name: "Retry" }));
      const failed = await toastSaying("Something went wrong. Ref: 8f14e45f");
      await user.click(within(failed).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(posts(calls, path)).toHaveLength(3));
      expect(
        new Set(posts(calls, path).map(({ body }) => JSON.stringify(body)))
          .size,
      ).toBe(1);
    },
  );

  test("an API that is down: Couldn't save with its answer's Ref and Retry, nothing sent to Sentry; no answer at all: Couldn't save alone", async () => {
    const report = vi.spyOn(sentry, "reportError");
    const archive = `/api/v1/ideas/${bowl.idea.id}/archive`;
    let tries = 0;
    const calls = actionsApi({
      write: (call) => {
        if (call.path !== archive) return undefined;
        tries += 1;
        if (tries === 1) return apiError(503, "UPSTREAM_UNAVAILABLE");
        if (tries === 2) throw new TypeError("Failed to fetch");
        return undefined;
      },
    });
    renderApp(ideasPath);
    const user = await pick("Archive");
    const down = await toastSaying("Couldn't save. Ref: 8f14e45f");
    await user.click(within(down).getByRole("button", { name: "Retry" }));
    const offline = await toastSaying("Couldn't save");
    await user.click(within(offline).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts(calls, archive)).toHaveLength(3));
    expect(report).not.toHaveBeenCalled();
  });

  test("an action refused for good says why without Retry, and the screen is read again in the new role", async () => {
    let role: Role = "owner";
    const calls = actionsApi({
      me: () => as(role),
      write: ({ path }) => {
        if (!path.endsWith("/archive")) return undefined;
        role = "viewer";
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(ideasPath);
    const meReads = () => reads(calls, "/api/v1/me");
    await screen.findAllByRole("button", {
      name: "More for Bacolod Health Bowl",
    });
    const before = meReads();
    await pick("Archive");
    const toast = await toastSaying(
      "Couldn't save. You don't have access to this.",
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    // Read again as a Viewer: the rows have no ⋯ (design-spec 6.8).
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "More for Bacolod Health Bowl" }),
      ).toBeNull(),
    );
    expect(meReads()).toBeGreaterThan(before);
  });
});

/**
 * Duplicates on 13 and presses the toast's Undo, then, once `before` has run, Delete in
 * its question.
 */
async function duplicateAndUndo(before: () => void = () => {}) {
  const user = await pick("Duplicate");
  const toast = await toastSaying("Duplicated from Bacolod Health Bowl");
  await user.click(within(toast).getByRole("button", { name: "Undo" }));
  const ask = await screen.findByRole("alertdialog", {
    name: "Delete the copied idea?",
  });
  before();
  await user.click(within(ask).getByRole("button", { name: "Delete" }));
  return user;
}

/** The first row of a plan draft in 11's history, with Undo the whole operation. */
const draftRow: HistoryEntry = {
  id: "a0000000-0000-4000-8000-000000000001",
  batchId,
  target: { type: "validation_answer", id: validationId, key: "V.01.WHO" },
  label: "01 WHO",
  action: "create",
  source: "plan_draft",
  before: null,
  after: {
    text: "Office workers",
    fau: null,
    confidence: null,
    evidenceIds: [],
  },
  changedBy: {
    id: ana.id,
    displayName: ana.displayName,
    avatarUrl: null,
    badge: null,
  },
  changedAt: "2026-10-20T01:00:00Z",
  revertible: true,
};

/** Opens 11's history and undoes the plan draft, Delete pressed in its question. */
async function undoDraft() {
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: /^Undo the whole operation/ }),
  );
  const ask = await screen.findByRole("alertdialog", {
    name: "Delete this plan draft?",
  });
  await user.click(within(ask).getByRole("button", { name: "Delete" }));
}

describe("the toast's Undo that fails (design-spec 6.8, 6.0.5「作成の取り消し」)", () => {
  test("the rate limit, then an unexpected failure: the wait, the Ref, and Retry sends the same undo; once through, 6 opens", async () => {
    let tries = 0;
    const calls = actionsApi({
      write: (call) => {
        if (call.path !== revertPath) return undefined;
        tries += 1;
        return tries === 1
          ? rateLimited()
          : tries === 2
            ? unexpected()
            : undefined;
      },
    });
    const router = renderApp(bowlPath);
    const user = await duplicateAndUndo();
    const waiting = await toastSaying(
      "Too many attempts. Try again in 1 minute.",
    );
    expect(router.state.location.pathname).toBe(copyPath);
    await user.click(within(waiting).getByRole("button", { name: "Retry" }));
    const failed = await toastSaying("Something went wrong. Ref: 8f14e45f");
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(ideasPath));
    expect(posts(calls, revertPath)).toHaveLength(3);
  });

  test("undone elsewhere first: This was already undone, and 6 opens as the copy is gone", async () => {
    actionsApi({
      write: (call) =>
        call.path === revertPath
          ? apiError(409, "ALREADY_REVERTED")
          : undefined,
    });
    const router = renderApp(bowlPath);
    await duplicateAndUndo();
    expect(await toastSaying("This was already undone")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe(ideasPath));
  });

  test("archived meanwhile: the notice in a toast, and the copy's 13 read again shows it archived", async () => {
    let isArchived = false;
    const calls = actionsApi({
      copyArchived: () => isArchived,
      write: (call) => {
        if (call.path !== revertPath) return undefined;
        isArchived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    const router = renderApp(bowlPath);
    let before = 0;
    await duplicateAndUndo(() => {
      before = reads(calls, copyHomePath);
    });
    expect(
      await toastSaying("This idea is archived. Restore it to make changes."),
    ).toBeTruthy();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(reads(calls, copyHomePath)).toBeGreaterThan(before);
    expect(router.state.location.pathname).toBe(copyPath);
  });

  test.each([
    ["its plan", false, "This plan is archived. Restore it to make changes."],
    ["its idea", true, "This idea is archived. Restore it to make changes."],
  ])(
    "a plan draft whose %s was archived meanwhile: the idea read again says which, in a toast",
    async (_, isIdeaArchived, words) => {
      let refused = false;
      const calls = actionsApi({
        archived: () => refused && isIdeaArchived,
        history: [draftRow],
        write: (call) => {
          if (call.path !== revertPath) return undefined;
          refused = true;
          return apiError(409, "ARCHIVED");
        },
      });
      const router = renderApp(`${bowlPath}/questions/01`);
      await undoDraft();
      expect(await toastSaying(words)).toBeTruthy();
      // Read again after the refusal, and the screen stays.
      expect(
        calls.findLastIndex(
          ({ method, path }) =>
            method === "GET" &&
            path === `/api/v1/ideas/${bowl.idea.id}/validation`,
        ),
      ).toBeGreaterThan(calls.findIndex(({ path }) => path === revertPath));
      expect(router.state.location.pathname).toBe(`${bowlPath}/questions/01`);
    },
  );

  test("a plan draft refused as archived whose idea cannot be read again: that failure in a toast, and Retry sends the undo again", async () => {
    let reverts = 0;
    const calls = actionsApi({
      history: [draftRow],
      // Every read between the refusal and Retry fails.
      readHome: () => (reverts === 1 ? unexpected() : undefined),
      write: (call) => {
        if (call.path !== revertPath) return undefined;
        reverts += 1;
        return reverts === 1 ? apiError(409, "ARCHIVED") : undefined;
      },
    });
    const router = renderApp(`${bowlPath}/questions/01`);
    await undoDraft();
    const toast = await toastSaying("Something went wrong. Ref: 8f14e45f");
    await userEvent
      .setup()
      .click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(bowlPath));
    expect(posts(calls, revertPath)).toHaveLength(2);
  });

  test("a plan draft undone elsewhere first: This was already undone, and its idea's 13 opens", async () => {
    actionsApi({
      history: [draftRow],
      write: (call) =>
        call.path === revertPath
          ? apiError(409, "ALREADY_REVERTED")
          : undefined,
    });
    const router = renderApp(`${bowlPath}/questions/01`);
    await undoDraft();
    expect(await toastSaying("This was already undone")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe(bowlPath));
  });
});
