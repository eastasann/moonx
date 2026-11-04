import type { HistoryEntry, Me, Role, UserRef } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  type Call,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  home,
  questionsRead,
  section01,
  validationId,
} from "../test/validation";

// PNL-2, the history panel, on 11 (design-spec 6.0.5・6.0.1, SDD 4章・5.11 H1–H3).

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ideaPath = `/w/${workspaceId}/ideas/${home.idea.id}`;
const base = `${ideaPath}/questions/01`;
const validationPath = `/api/v1/validations/${validationId}`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const paolo: UserRef = {
  id: "6f1c2b3a-0000-4000-8000-000000000002",
  displayName: "Paolo Gonzaga",
  avatarUrl: null,
  badge: null,
};

const whoTarget = {
  type: "validation_answer",
  id: validationId,
  key: "V.01.WHO",
};

const row = (id: string, extra: Partial<HistoryEntry> = {}): HistoryEntry => ({
  id,
  batchId: null,
  target: whoTarget as HistoryEntry["target"],
  label: "01 WHO",
  action: "update",
  source: "manual",
  before: {
    text: "Office workers in Bacolod",
    fau: null,
    confidence: null,
    evidenceIds: [],
  },
  after: {
    text: "Office workers in Iloilo",
    fau: "assumption",
    confidence: "medium",
    evidenceIds: [],
  },
  changedBy: paolo,
  changedAt: "2026-10-20T01:00:00Z",
  revertible: true,
  ...extra,
});

const manualId = "a0000000-0000-4000-8000-000000000001";
const batchId = "b0000000-0000-4000-8000-000000000001";

/**
 * The API of 11 with H1–H3: `entries` answers H1, `write` the reverts (H2 and H3), which
 * a test may refuse.
 */
function panelApi({
  entries = [row(manualId)],
  more = [],
  me = ana,
  archived = false,
  write = (_call: Call): Response | undefined => undefined,
}: {
  entries?: HistoryEntry[];
  /** H1's second page, after "Show more". */
  more?: HistoryEntry[];
  me?: Me;
  archived?: boolean;
  write?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path === `${validationPath}/questions/01`) {
      return Response.json(questionsRead(section01));
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    if (method === "GET" && path.startsWith("/api/v1/history?")) {
      return path.includes("cursor=50")
        ? Response.json({ items: more, nextCursor: null })
        : Response.json({
            items: entries,
            nextCursor: more.length === 0 ? null : "50",
          });
    }
    if (method === "POST" && path.startsWith("/api/v1/history/")) {
      return write(call);
    }
    if (method === "PUT" && path === `${validationPath}/answers/V.01.WHO`) {
      return Response.json(
        answer("V.01.WHO", { text: "Students", lockVersion: 1 }),
      );
    }
    return undefined;
  });
}

/** The panel: a column beside the body on a desktop, a dialog under it (4.5 Panel). */
const panel = () =>
  screen.queryByRole("complementary", { name: "History" }) ??
  screen.getByRole("dialog", { name: "History" });
const findPanel = () => waitFor(panel);

const reads = (calls: Call[], prefix: string) =>
  calls.filter(
    ({ method, path }) => method === "GET" && path.startsWith(prefix),
  ).length;

describe("PNL-2 History (design-spec 6.0.5)", () => {
  test("the header's 🕘 opens the screen's changes: who, when, the item, the kind, and the words before and after", async () => {
    const user = userEvent.setup();
    const calls = panelApi();
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await within(body).findByText("Manual · Changed");
    expect(body.textContent).toContain("01 WHO");
    expect(body.textContent).toContain("Paolo Gonzaga");
    // The changed word is struck through before and underlined after (4.5 DiffText).
    expect(within(body).getByText("Bacolod").tagName).toBe("DEL");
    expect(within(body).getByText("Iloilo").tagName).toBe("INS");
    expect(body.textContent).toContain("Unclassified");
    expect(body.textContent).toContain("Assumption · Medium");
    // The screen's changes read 11's section (SDD 4章・6.3).
    expect(
      calls.some(
        ({ path }) =>
          path.startsWith("/api/v1/history?") &&
          path.includes("containerType=validation") &&
          path.includes(`containerId=${validationId}`) &&
          path.includes("sectionKeys=01"),
      ),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "History" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("complementary", { name: "History" }),
      ).toBeNull(),
    );
  });

  test("an item's 🕘 opens its changes, and Revert to this point puts it back and reads the screen again", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      write: (call) =>
        call.path === `/api/v1/history/${manualId}/revert`
          ? Response.json({
              entry: null,
              target: {
                value: null,
                deleted: false,
                lockVersion: 3,
                updatedAt: null,
                updatedBy: null,
              },
            })
          : undefined,
    });
    renderApp(base);
    await user.click(
      await screen.findByRole("button", { name: "History of 01 WHO" }),
    );
    const body = await findPanel();
    await within(body).findByText("On 01 WHO");
    expect(
      calls.some(
        ({ path }) =>
          path.startsWith("/api/v1/history?") &&
          path.includes("targetType=validation_answer") &&
          path.includes("targetKey=V.01.WHO"),
      ),
    ).toBe(true);
    const questionReads = reads(calls, `${validationPath}/questions/01`);
    const historyReads = reads(calls, "/api/v1/history?");
    await user.click(
      within(body).getByRole("button", {
        name: "Revert to this point, 01 WHO",
      }),
    );
    await waitFor(() =>
      expect(reads(calls, `${validationPath}/questions/01`)).toBeGreaterThan(
        questionReads,
      ),
    );
    expect(reads(calls, "/api/v1/history?")).toBeGreaterThan(historyReads);
    expect(
      calls.some(
        ({ method, path }) =>
          method === "POST" && path === `/api/v1/history/${manualId}/revert`,
      ),
    ).toBe(true);
  });

  test("a deleted row reads Undo delete; an operation's first row alone has Undo the whole operation", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      entries: [
        row("a0000000-0000-4000-8000-000000000003", {
          batchId,
          source: "ai_import",
        }),
        row("a0000000-0000-4000-8000-000000000004", {
          batchId,
          source: "ai_import",
          label: "01 WHY_THEM",
          target: {
            ...whoTarget,
            key: "V.01.WHY_THEM",
          } as HistoryEntry["target"],
        }),
        row("a0000000-0000-4000-8000-000000000005", {
          action: "delete",
          after: null,
        }),
      ],
      write: (call) =>
        call.path === `/api/v1/history/batches/${batchId}/revert`
          ? apiError(409, "ALREADY_REVERTED")
          : undefined,
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await within(body).findAllByText("AI import · Changed");
    const undo = within(body).getAllByRole("button", {
      name: /^Undo the whole operation/,
    });
    expect(undo).toHaveLength(1);
    expect(
      within(body).getByRole("button", { name: "Undo delete of 01 WHO" }),
    ).toBeTruthy();
    expect(body.textContent).toContain("Manual · Deleted");
    const historyReads = reads(calls, "/api/v1/history?");
    await user.click(undo[0] as HTMLElement);
    // Undone elsewhere first: it says so and reads the changes again (6.0.5).
    await within(body).findByText("This was already undone");
    await waitFor(() =>
      expect(reads(calls, "/api/v1/history?")).toBeGreaterThan(historyReads),
    );
  });

  test("a copy's first row asks before deleting the copy, then opens 6; a refusal says why", async () => {
    const user = userEvent.setup();
    let refuse = true;
    const calls = panelApi({
      entries: [
        row(manualId, {
          batchId,
          source: "duplicate",
          action: "create",
          before: null,
        }),
      ],
      write: (call) => {
        if (call.path !== `/api/v1/history/batches/${batchId}/revert`) return;
        return refuse
          ? apiError(409, "UNDO_BLOCKED")
          : Response.json({ reverted: 12, batchId });
      },
    });
    const router = renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await within(body).findByText("Duplicate · Added");
    await user.click(
      within(body).getByRole("button", { name: /^Undo the whole operation/ }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete the copied idea?",
    });
    expect(ask.textContent).toContain(
      `${home.idea.name} and everything copied into it will be deleted. This can't be undone.`,
    );
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByText(
        "Something was added after this was created, so it cannot be undone",
      ),
    ).toBeTruthy();
    refuse = false;
    await user.click(
      within(panel()).getByRole("button", {
        name: /^Undo the whole operation/,
      }),
    );
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Delete the copied idea?",
        }),
      ).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${workspaceId}/ideas`),
    );
    expect(
      calls.filter(
        ({ method, path }) =>
          method === "POST" &&
          path === `/api/v1/history/batches/${batchId}/revert`,
      ),
    ).toHaveLength(2);
  });

  test("a plan draft's first row asks Delete this plan draft? and opens its idea's 13", async () => {
    const user = userEvent.setup();
    panelApi({
      entries: [
        row(manualId, {
          batchId,
          source: "plan_draft",
          action: "create",
          before: null,
        }),
      ],
      write: (call) =>
        call.path === `/api/v1/history/batches/${batchId}/revert`
          ? Response.json({ reverted: 30, batchId })
          : undefined,
    });
    const router = renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: /^Undo the whole operation/,
      }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this plan draft?",
    });
    expect(ask.textContent).toContain(
      "This plan draft and everything in it will be deleted. This can't be undone.",
    );
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe(ideaPath));
  });

  test("an undone creation and a template update say what they did; the undone one has no buttons", async () => {
    const user = userEvent.setup();
    panelApi({
      entries: [
        row("a0000000-0000-4000-8000-000000000006", {
          target: { type: "idea", id: home.idea.id, key: null },
          label: "Piaya Gift Box (copy)",
          action: "delete",
          source: "revert",
          before: null,
          after: null,
          // The API says false (SDD 5.11); the panel does not lean on it.
          revertible: true,
        }),
        row("a0000000-0000-4000-8000-000000000007", {
          batchId,
          target: {
            type: "template_version",
            id: validationId,
            key: null,
          },
          label: "Template version",
          source: "template_migration",
          before: { versionId: "v1", versionNumber: 1 },
          after: { versionId: "v2", versionNumber: 2 },
        }),
      ],
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await within(body).findByText("Duplicate undone · Deleted");
    expect(body.textContent).toContain("Template updated to v2");
    // The migration is undone as a whole only (6.0.7); the undone copy never comes back.
    expect(
      within(body)
        .getAllByRole("button", { name: /^(Revert|Undo)/ })
        .map(({ textContent }) => textContent),
    ).toEqual(["Undo the whole operation"]);
  });

  test("refusals say why under the row: busy, a name taken, gone; the list is read again when gone", async () => {
    const user = userEvent.setup();
    const answers: Record<string, () => Response> = {
      [`/api/v1/history/batches/${batchId}/revert`]: () =>
        apiError(409, "BUSY"),
      [`/api/v1/history/${manualId}/revert`]: () => apiError(409, "NAME_TAKEN"),
      "/api/v1/history/a0000000-0000-4000-8000-000000000008/revert": () =>
        apiError(404, "NOT_FOUND"),
    };
    const calls = panelApi({
      entries: [
        row("a0000000-0000-4000-8000-000000000009", {
          batchId,
          source: "ai_import",
          label: "01 WHY_THEM",
          target: {
            ...whoTarget,
            key: "V.01.WHY_THEM",
          } as HistoryEntry["target"],
        }),
        row(manualId, {
          label: "01 BEHAVIOR",
          target: {
            ...whoTarget,
            key: "V.01.BEHAVIOR",
          } as HistoryEntry["target"],
        }),
        row("a0000000-0000-4000-8000-000000000008"),
      ],
      write: (call) => answers[call.path]?.(),
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: /^Undo the whole operation/,
      }),
    );
    await within(body).findByText(
      "Something is being changed right now. Try again.",
    );
    await user.click(
      within(body).getByRole("button", {
        name: "Revert to this point, 01 BEHAVIOR",
      }),
    );
    await within(body).findByText("This name is already used");
    // One failure shows at a time: the row that failed last.
    expect(
      within(body).queryByText(
        "Something is being changed right now. Try again.",
      ),
    ).toBeNull();
    const historyReads = reads(calls, "/api/v1/history?");
    await user.click(
      within(body).getByRole("button", {
        name: "Revert to this point, 01 WHO",
      }),
    );
    await within(body).findByText("It no longer exists");
    await waitFor(() =>
      expect(reads(calls, "/api/v1/history?")).toBeGreaterThan(historyReads),
    );
  });

  test("a revert refused as archived turns the panel read-only with the notice", async () => {
    const user = userEvent.setup();
    panelApi({ write: () => apiError(409, "ARCHIVED") });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: "Revert to this point, 01 WHO",
      }),
    );
    await within(body).findByText(
      "This idea is archived. Restore it to make changes.",
    );
    expect(
      within(body).queryByRole("button", { name: /^Revert to this point/ }),
    ).toBeNull();
  });

  test("an unexpected failure opens the small dialog with the Ref; Retry sends it again (6.0.6)", async () => {
    const user = userEvent.setup();
    const calls = panelApi({ write: () => apiError(500, "INTERNAL") });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: "Revert to this point, 01 WHO",
      }),
    );
    const failed = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(failed.textContent).toContain("Ref: 8f14e45f");
    expect(within(failed).getByRole("button", { name: "Close" })).toBeTruthy();
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, path }) =>
            method === "POST" && path === `/api/v1/history/${manualId}/revert`,
        ),
      ).toHaveLength(2),
    );
  });

  test("a copy's undo that meets another write says so in a toast and stays", async () => {
    const user = userEvent.setup();
    panelApi({
      entries: [
        row(manualId, {
          batchId,
          source: "duplicate",
          action: "create",
          before: null,
        }),
      ],
      write: () => apiError(409, "BUSY"),
    });
    const router = renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: /^Undo the whole operation/,
      }),
    );
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Delete the copied idea?",
        }),
      ).getByRole("button", { name: "Delete" }),
    );
    expect(
      await screen.findByText(
        "Something is being changed right now. Try again.",
      ),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe(base);
  });

  describe("one revert at a time, online only (6.0.5「操作のボタン」)", () => {
    const importId = "a0000000-0000-4000-8000-00000000000b";
    const deletedId = "a0000000-0000-4000-8000-00000000000c";
    /**
     * An AI import's change of 01 WHY_THEM, Paolo's of 01 WHO and a deleted 01 BEHAVIOR:
     * Revert and Undo the whole operation, Revert, Undo delete.
     */
    const entries = [
      row(importId, {
        batchId,
        source: "ai_import",
        label: "01 WHY_THEM",
        target: {
          ...whoTarget,
          key: "V.01.WHY_THEM",
        } as HistoryEntry["target"],
      }),
      row(manualId),
      row(deletedId, {
        action: "delete",
        after: null,
        label: "01 BEHAVIOR",
        target: {
          ...whoTarget,
          key: "V.01.BEHAVIOR",
        } as HistoryEntry["target"],
      }),
    ];
    const reverted = () =>
      Response.json({
        entry: null,
        target: {
          value: null,
          deleted: false,
          lockVersion: 3,
          updatedAt: null,
          updatedBy: null,
        },
      });
    const reverts = (calls: Call[]) =>
      calls
        .filter(
          ({ method, path }) =>
            method === "POST" && path.startsWith("/api/v1/history/"),
        )
        .map(({ path }) => path);

    /** Opens the screen's changes and finds the rows' buttons. */
    async function buttons(user: ReturnType<typeof userEvent.setup>) {
      renderApp(base);
      await user.click(await screen.findByRole("button", { name: "History" }));
      const body = await findPanel();
      const who = await within(body).findByRole("button", {
        name: "Revert to this point, 01 WHO",
      });
      const whyThem = within(body).getByRole("button", {
        name: "Revert to this point, 01 WHY_THEM",
      });
      /** Whether each of the four buttons is disabled, in the list's order. */
      const states = () =>
        within(body)
          .getAllByRole("button", { name: /^(Revert|Undo)/ })
          .map((button) => button.hasAttribute("disabled"));
      expect(states()).toEqual([false, false, false, false]);
      return { body, who, whyThem, states };
    }

    test("while one sends, the other Revert and Undo cannot be pressed, nor it again", async () => {
      const user = userEvent.setup();
      let answer: (response: Response) => void = () => {};
      const calls = panelApi({
        entries,
        write: (call) =>
          call.path === `/api/v1/history/${manualId}/revert`
            ? new Promise((resolve) => {
                answer = resolve;
              })
            : undefined,
      });
      const { body, who, states } = await buttons(user);
      await user.click(who);
      // Its own shows it sends (isPending), the others are disabled.
      await waitFor(() => expect(states()).toEqual([true, true, false, true]));
      for (const button of within(body).getAllByRole("button", {
        name: /^(Revert|Undo)/,
      })) {
        await user.click(button);
      }
      expect(reverts(calls)).toEqual([`/api/v1/history/${manualId}/revert`]);
      answer(reverted());
      await waitFor(() =>
        expect(states()).toEqual([false, false, false, false]),
      );
    });

    test("offline none can be pressed; back online they can", async () => {
      const user = userEvent.setup();
      const onLine = vi.spyOn(navigator, "onLine", "get");
      try {
        const calls = panelApi({ entries, write: reverted });
        const { who, states } = await buttons(user);
        onLine.mockReturnValue(false);
        act(() => {
          window.dispatchEvent(new Event("offline"));
        });
        await waitFor(() => expect(states()).toEqual([true, true, true, true]));
        await user.click(who);
        expect(reverts(calls)).toEqual([]);
        onLine.mockReturnValue(true);
        act(() => {
          window.dispatchEvent(new Event("online"));
        });
        await waitFor(() =>
          expect(states()).toEqual([false, false, false, false]),
        );
      } finally {
        onLine.mockRestore();
      }
    });

    test("over the rate limit, the wait shows under the row pressed, without Retry", async () => {
      const user = userEvent.setup();
      panelApi({
        entries,
        write: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
      });
      const { body, who, whyThem } = await buttons(user);
      await user.click(whyThem);
      const wait = await within(body).findByText(
        "Too many attempts. Try again in 1 minute.",
      );
      // Under 01 WHY_THEM's buttons, before the next row's (document order).
      expect(
        whyThem.compareDocumentPosition(wait) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        wait.compareDocumentPosition(who) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(body).queryByRole("button", { name: "Retry" })).toBeNull();
      expect(
        screen.queryByRole("alertdialog", { name: /Something went wrong/ }),
      ).toBeNull();
    });
  });

  describe("a revert whose panel closed, or whose screen was left, while it was on its way (6.0.5・6.0.6)", () => {
    const revertPath = `/api/v1/history/${manualId}/revert`;
    const reverted = () =>
      Response.json({
        entry: null,
        target: {
          value: null,
          deleted: false,
          lockVersion: 3,
          updatedAt: null,
          updatedBy: null,
        },
      });

    /**
     * Opens the screen's changes, presses `button` and closes the panel (or leaves the
     * screen) while the revert is held; `first` answers it (null: no answer comes), and
     * `later` any Retry.
     */
    async function closeWhileReverting({
      first,
      later = () => undefined,
      entries,
      button = "Revert to this point, 01 WHO",
      leave = false,
    }: {
      first: () => Response | null;
      later?: () => Response | undefined;
      entries?: HistoryEntry[];
      button?: string | RegExp;
      leave?: boolean;
    }) {
      const user = userEvent.setup();
      let release = () => {};
      let isFirst = true;
      const calls = panelApi({
        ...(entries === undefined ? {} : { entries }),
        write: () => {
          if (!isFirst) return later();
          isFirst = false;
          return new Promise<Response>((resolve, reject) => {
            release = () => {
              const answered = first();
              if (answered === null) reject(new TypeError("Failed to fetch"));
              else resolve(answered);
            };
          });
        },
      });
      const router = renderApp(base);
      await user.click(await screen.findByRole("button", { name: "History" }));
      const body = await findPanel();
      await user.click(
        await within(body).findByRole("button", { name: button }),
      );
      const posts = () =>
        calls.filter(
          ({ method, path }) =>
            method === "POST" && path.startsWith("/api/v1/history/"),
        );
      await waitFor(() => expect(posts()).toHaveLength(1));
      if (leave) {
        await router.navigate({ href: ideaPath });
      } else {
        await user.click(within(body).getByRole("button", { name: "Close" }));
      }
      await waitFor(() => expect(body.isConnected).toBe(false));
      return { user, calls, router, posts, answer: async () => release() };
    }

    test("no answer comes: a toast says Couldn't save, and its Retry sends the same revert", async () => {
      let isFailing = true;
      const { user, posts, answer } = await closeWhileReverting({
        first: () => null,
        later: () => (isFailing ? undefined : reverted()),
      });
      const toast = await toastAfter("Couldn't save", answer);
      isFailing = false;
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(posts().map(({ path }) => path)).toEqual([
          revertPath,
          revertPath,
        ]),
      );
    });

    test("the screen left, then unexpected (500): Something went wrong with its Ref and Retry in a toast, not the small dialog", async () => {
      const { user, router, answer } = await closeWhileReverting({
        first: () => apiError(500, "INTERNAL"),
        leave: true,
      });
      const toast = await toastAfter(
        "Something went wrong. Ref: 8f14e45f",
        answer,
      );
      expect(within(toast).getByRole("button", { name: "Retry" })).toBeTruthy();
      expect(
        screen.queryByRole("alertdialog", {
          name: "Alert Something went wrong",
        }),
      ).toBeNull();
      expect(router.state.location.pathname).toBe(ideaPath);
      // Toasts outlive the test (test/api.tsx): the later ones look for these words too.
      await user.click(within(toast).getByRole("button", { name: "Close" }));
    });

    test("undone elsewhere first: This was already undone in a toast, without Retry, and the screen read again", async () => {
      const { user, calls, answer } = await closeWhileReverting({
        first: () => apiError(409, "ALREADY_REVERTED"),
      });
      const questionReads = reads(calls, `${validationPath}/questions/01`);
      const toast = await toastAfter("This was already undone", answer);
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      await waitFor(() =>
        expect(reads(calls, `${validationPath}/questions/01`)).toBeGreaterThan(
          questionReads,
        ),
      );
      await user.click(within(toast).getByRole("button", { name: "Close" }));
    });

    test("a name taken: its words in a toast, without Retry", async () => {
      const { user, answer } = await closeWhileReverting({
        first: () => apiError(409, "NAME_TAKEN"),
      });
      const toast = await toastAfter("This name is already used", answer);
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      await user.click(within(toast).getByRole("button", { name: "Close" }));
    });

    test("Undo the whole operation meets another write: its words in a toast, without Retry", async () => {
      const { user, posts, answer } = await closeWhileReverting({
        entries: [row(manualId, { batchId, source: "ai_import" })],
        button: /^Undo the whole operation/,
        first: () => apiError(409, "BUSY"),
      });
      expect(posts()[0]?.path).toBe(
        `/api/v1/history/batches/${batchId}/revert`,
      );
      const toast = await toastAfter(
        "Something is being changed right now. Try again.",
        answer,
      );
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      await user.click(within(toast).getByRole("button", { name: "Close" }));
    });

    test("refused as archived, or as gone: Couldn't save with the reason in a toast, without Retry", async () => {
      const archived = await closeWhileReverting({
        first: () => apiError(409, "ARCHIVED"),
      });
      const toast = await toastAfter(
        "Couldn't save. It's archived.",
        archived.answer,
      );
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
      const gone = await closeWhileReverting({
        first: () => apiError(404, "NOT_FOUND"),
      });
      const goneToast = await toastAfter(
        "Couldn't save. It no longer exists.",
        gone.answer,
      );
      expect(
        within(goneToast).queryByRole("button", { name: "Retry" }),
      ).toBeNull();
    });
  });

  test("a network failure says Couldn't save with Retry under the row", async () => {
    const user = userEvent.setup();
    panelApi({ write: () => Promise.reject(new TypeError("Failed to fetch")) });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", {
        name: "Revert to this point, 01 WHO",
      }),
    );
    await within(body).findByText("Couldn't save");
    expect(within(body).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("Undo the whole operation takes an AI import back and reads the screen again", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      entries: [row(manualId, { batchId, source: "ai_import" })],
      write: (call) =>
        call.path === `/api/v1/history/batches/${batchId}/revert`
          ? Response.json({
              reverted: 1,
              batchId: "b0000000-0000-4000-8000-000000000002",
            })
          : undefined,
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    const questionReads = reads(calls, `${validationPath}/questions/01`);
    await user.click(
      await within(body).findByRole("button", {
        name: /^Undo the whole operation/,
      }),
    );
    await waitFor(() =>
      expect(reads(calls, `${validationPath}/questions/01`)).toBeGreaterThan(
        questionReads,
      ),
    );
  });

  test("the idea's own changes open on 13 only: on 11 its target opens nothing", async () => {
    panelApi();
    renderApp(`${base}?panel=history&target=idea:${home.idea.id}`);
    await screen.findByRole("button", { name: "History" });
    await screen.findByText("Who is the primary paying customer?");
    expect(screen.queryByRole("complementary", { name: "History" })).toBeNull();
  });

  test("an open panel reads the changes again once the screen saves", async () => {
    const user = userEvent.setup();
    const calls = panelApi();
    renderApp(`${base}?q=V.01.WHO`);
    await user.click(
      await screen.findByRole("button", { name: "History of 01 WHO" }),
    );
    await within(await findPanel()).findByText("Manual · Changed");
    const historyReads = reads(calls, "/api/v1/history?");
    await user.type(
      screen.getByRole("textbox", { name: "Answer to WHO" }),
      "Students",
    );
    await waitFor(
      () =>
        expect(reads(calls, "/api/v1/history?")).toBeGreaterThan(historyReads),
      { timeout: 4000 },
    );
  });

  test("Show more reads the next page under the first", async () => {
    const user = userEvent.setup();
    const calls = panelApi({
      more: [
        row("a0000000-0000-4000-8000-00000000000a", {
          action: "create",
          before: null,
          after: {
            text: "Students",
            fau: null,
            confidence: null,
            evidenceIds: [],
          },
        }),
      ],
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await user.click(
      await within(body).findByRole("button", { name: "Show more" }),
    );
    await within(body).findByText("Students");
    expect(body.textContent).toContain("Manual · Changed");
    expect(
      calls.some(
        ({ path }) =>
          path.startsWith("/api/v1/history?") && path.includes("cursor=50"),
      ),
    ).toBe(true);
    expect(
      within(body).queryByRole("button", { name: "Show more" }),
    ).toBeNull();
  });

  test("Viewers read the changes without buttons; an archived idea says why", async () => {
    const user = userEvent.setup();
    panelApi({
      me: as("viewer"),
      entries: [row(manualId, { revertible: false })],
    });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const body = await findPanel();
    await within(body).findByText("Manual · Changed");
    expect(
      within(body).queryByRole("button", { name: /to this point/ }),
    ).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    panelApi({ archived: true });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    const archived = await findPanel();
    await within(archived).findByText(
      "This idea is archived. Restore it to make changes.",
    );
    expect(
      within(archived).queryByRole("button", { name: /to this point/ }),
    ).toBeNull();
  });

  test("with no changes it says No changes yet", async () => {
    const user = userEvent.setup();
    panelApi({ entries: [] });
    renderApp(base);
    await user.click(await screen.findByRole("button", { name: "History" }));
    expect(
      await within(await findPanel()).findByText("No changes yet"),
    ).toBeTruthy();
  });
});
