import type {
  Me,
  SelfAnalysisHome,
  TemplateMigrationPreview,
} from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import * as sentry from "../lib/sentry";
import {
  ana,
  apiError,
  type Call,
  cleanupThenRestoreFocus,
  readAgainOnFocus,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  incomeSection,
  otherTeam,
  personal,
  sectionRead,
  selfAnalysisId,
  selfHome,
  viewerOfBcdx,
  whySection,
} from "../test/selfAnalysis";

// 10 Self Analysis and M6 Share (design-spec 6.11・3.8, SDD 5.8 S1・S4・S5).

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const path = `/w/${workspaceId}/self-analysis`;
const api = "/api/v1/me/self-analysis";

/** T1 of Ana's self-analysis, from v1 to v3 (SDD 5.12). */
const preview: TemplateMigrationPreview = {
  from: { versionNumber: 1 },
  to: { versionId: "7d7d7d7d-0000-4000-8000-000000000003", versionNumber: 3 },
  carried: 1,
  hiddenQuestions: [],
  addedQuestions: 0,
  addedCostRows: [],
};
const previewPath = `/api/v1/template-migrations/preview?targetType=self_analysis&targetId=${selfAnalysisId}`;

/**
 * The API of 10: S1 answers `home` (or `read`, whose promise holds it back); `write`
 * answers S1 PATCH, S4 and S5. The comments 10's 💬 lists are none, and T1 moves to v3.
 */
function homeApi({
  me = ana,
  home = selfHome(),
  read,
  write = (_call: Call): Response | undefined => undefined,
}: {
  me?: Me;
  home?: SelfAnalysisHome;
  read?: () => Response | Promise<Response>;
  /** Answers S1 PATCH, S4 and S5; a promise holds the answer back. */
  write?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path: url } = call;
    if (method === "GET" && url === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && url === "/api/v1/me") return Response.json(me);
    if (method === "GET" && url === api) return read?.() ?? Response.json(home);
    if (method === "GET" && url === `${api}/sections/WHY`) {
      return Response.json(
        sectionRead(
          whySection,
          whySection.questions.map(({ key }) => answer(key)),
        ),
      );
    }
    if (url.startsWith(api)) return write(call);
    if (method === "GET" && url.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    if (method === "GET" && url === previewPath) return Response.json(preview);
    return undefined;
  });
}

/** A promise of nothing, and what lets it go. */
function hold() {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { held, release };
}

const sent = (calls: Call[], method: string, url: string) =>
  calls.filter((call) => call.method === method && call.path === url);

describe("10 Self Analysis (design-spec 6.11)", () => {
  test("how far it is, where it is shared, the template and the sections; Continue opens the first empty question", async () => {
    const user = userEvent.setup();
    homeApi();
    const router = renderApp(path);
    expect(
      await screen.findByText("In progress · 1 / 3 answered"),
    ).toBeTruthy();
    const status = screen.getByRole("region", { name: "Status" });
    expect(within(status).getByText("1 / 3 answered")).toBeTruthy();
    expect(within(status).getByText("BCDX")).toBeTruthy();
    expect(within(status).getByText("v1")).toBeTruthy();
    const sections = screen.getByRole("list", { name: "Sections" });
    expect(
      within(sections)
        .getByRole("link", { name: /PERSONAL INCOME/ })
        .getAttribute("href"),
    ).toBe(`${path}/INCOME`);
    expect(within(sections).getByText("1/2")).toBeTruthy();
    // The navigation's Self Analysis is the page open now (5章).
    expect(
      screen
        .getAllByRole("link", { name: "Self Analysis" })
        .some((link) => link.getAttribute("aria-current") === "page"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${path}/WHY`),
    );
    expect(router.state.location.search).toMatchObject({ q: "SA.WHY.2" });
  });

  test("counts of a hundred or more are written in full, the thousands grouped (design-spec 1.2)", async () => {
    homeApi({
      home: selfHome({
        answered: 120,
        total: 1234,
        sections: [{ key: "WHY", title: "WHY", answered: 100, total: 1001 }],
      }),
    });
    renderApp(path);
    expect(
      await screen.findByText("In progress · 120 / 1,234 answered"),
    ).toBeTruthy();
    const status = screen.getByRole("region", { name: "Status" });
    expect(within(status).getByText("120 / 1,234 answered")).toBeTruthy();
    const sections = screen.getByRole("list", { name: "Sections" });
    expect(within(sections).getByText("100/1,001")).toBeTruthy();
  });

  test("not started: what it is for, and Start", async () => {
    homeApi({
      home: selfHome({
        status: "not_started",
        answered: 0,
        shares: [],
        firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.1" },
      }),
    });
    renderApp(path);
    expect(
      await screen.findByText(
        "Answer 3 questions at your own pace. Only you can see your answers until you share them.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start" })).toBeTruthy();
    // Shared with nowhere and not done: nothing to share yet (6.11).
    expect(
      screen.getByRole("button", { name: "Share" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  test("Mark as done asks while questions are empty, then marks it anyway", async () => {
    const user = userEvent.setup();
    const calls = homeApi({
      write: (call) =>
        call.path === `${api}/complete`
          ? Response.json(selfHome({ status: "done" }))
          : undefined,
    });
    renderApp(path);
    await user.click(
      await screen.findByRole("button", { name: "Mark as done" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "2 questions are empty. Mark as done anyway?",
    });
    expect(sent(calls, "POST", `${api}/complete`)).toHaveLength(0);
    await user.click(
      within(dialog).getByRole("button", { name: "Mark as done" }),
    );
    expect(await screen.findByRole("button", { name: "Reopen" })).toBeTruthy();
    expect(sent(calls, "POST", `${api}/complete`)[0]?.body).toEqual({
      confirmEmpty: true,
    });
  });

  test("all answered: Mark as done at once, and Reopen takes it back", async () => {
    const user = userEvent.setup();
    const calls = homeApi({
      home: selfHome({ answered: 3, firstUnanswered: null }),
      write: (call) =>
        call.path === `${api}/complete`
          ? Response.json(selfHome({ status: "done", answered: 3 }))
          : call.path === `${api}/reopen`
            ? Response.json(selfHome({ answered: 3 }))
            : undefined,
    });
    renderApp(path);
    await user.click(
      await screen.findByRole("button", { name: "Mark as done" }),
    );
    await user.click(await screen.findByRole("button", { name: "Reopen" }));
    expect(
      await screen.findByRole("button", { name: "Mark as done" }),
    ).toBeTruthy();
    expect(sent(calls, "POST", `${api}/complete`)[0]?.body).toEqual({});
    expect(sent(calls, "POST", `${api}/reopen`)).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("questions emptied since it was read: asks with the count the API has", async () => {
    const user = userEvent.setup();
    homeApi({
      home: selfHome({ answered: 3, firstUnanswered: null }),
      write: (call) =>
        call.path === `${api}/complete`
          ? apiError(409, "HAS_EMPTY_QUESTIONS", { emptyCount: 1 })
          : undefined,
    });
    renderApp(path);
    await user.click(
      await screen.findByRole("button", { name: "Mark as done" }),
    );
    expect(
      await screen.findByRole("alertdialog", {
        name: "1 question is empty. Mark as done anyway?",
      }),
    ).toBeTruthy();
  });

  test("no published template: says so in Start's place", async () => {
    homeApi({ read: () => apiError(409, "TEMPLATE_NOT_PUBLISHED") });
    renderApp(path);
    const words = await screen.findByText(
      "Templates aren't ready yet. Ask your administrator.",
    );
    expect(screen.getByRole("region", { name: "Status" }).contains(words)).toBe(
      true,
    );
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "My Self Analysis",
    );
    expect(screen.queryByRole("button", { name: "Start" })).toBeNull();
  });

  test("a block that fails to render says so alone: the other block and the navigation stay (SDD 8.2)", async () => {
    // React logs what a boundary catches; the failure is the test's point.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "3f2a9c1d0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    homeApi({
      home: selfHome({
        // A section's title that is no text: what S1 never sends (SDD 5.8).
        sections: [
          {
            key: "WHY",
            title: {} as unknown as string,
            answered: 1,
            total: 2,
          },
        ],
      }),
    });
    renderApp(path);
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Something went wrong",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 3f2a9c1d")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Sections" })).toBeNull();
    const status = screen.getByRole("region", { name: "Status" });
    expect(within(status).getByText("1 / 3 answered")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "My Self Analysis" }),
    ).toBeTruthy();
    // The side navigation and the TabBar alike (the width picks one).
    for (const nav of screen.getAllByRole("navigation", { name: "Main" })) {
      expect(
        within(nav)
          .getByRole("link", { name: "Self Analysis" })
          .getAttribute("aria-current"),
      ).toBe("page");
    }
  });

  test("Team opens 12; AI ▼ comes back to 10", async () => {
    const user = userEvent.setup();
    homeApi();
    const router = renderApp(path);
    await user.click(await screen.findByRole("button", { name: /AI/ }));
    expect(
      screen
        .getByRole("menuitem", { name: "Export for AI" })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ai/export?source=self_analysis&returnTo=${encodeURIComponent(path)}`,
    );
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Team" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${workspaceId}/team`),
    );
  });

  test("⋯ Change currency saves the chosen one, warned it converts nothing", async () => {
    const user = userEvent.setup();
    const calls = homeApi({
      write: (call) =>
        call.method === "PATCH"
          ? Response.json(selfHome({ currency: "USD" }))
          : undefined,
    });
    renderApp(path);
    await user.click(
      await screen.findByRole("button", { name: "More for My Self Analysis" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Change currency" }));
    const dialog = await screen.findByRole("dialog", { name: "Currency" });
    expect(
      within(dialog).getByText(
        "Changing the currency does not convert amounts you already entered.",
      ),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: /Currency/ }));
    await user.click(await screen.findByRole("option", { name: /^USD/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sent(calls, "PATCH", api)[0]?.body).toEqual({ currency: "USD" });
  });

  test("a Viewer of this workspace is taken to their personal workspace's 10", async () => {
    homeApi({ me: viewerOfBcdx });
    const router = renderApp(path);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${personal.id}/self-analysis`,
      ),
    );
    expect(
      await screen.findByText("In progress · 1 / 3 answered"),
    ).toBeTruthy();
  });

  test("the header's 💬 lists every thread with the workspace it is from", async () => {
    const author = {
      id: "6f1c2b3a-0000-4000-8000-000000000002",
      displayName: "Paolo Gonzaga",
      avatarUrl: null,
      badge: null,
    };
    const calls = stubApi((call) => {
      const { method, path: url } = call;
      if (method === "GET" && url === "/api/v1/me") return Response.json(ana);
      if (method === "PATCH" && url === "/api/v1/me") return Response.json(ana);
      if (method === "GET" && url === api) return Response.json(selfHome());
      if (method === "GET" && url.startsWith(`${api}/sections/`)) {
        const key = url.split("/").at(-1);
        return key === "WHY"
          ? Response.json({
              section: whySection,
              answers: whySection.questions.map(({ key: question }) =>
                answer(question),
              ),
            })
          : apiError(404, "NOT_FOUND");
      }
      if (method === "GET" && url.startsWith("/api/v1/comments?")) {
        return Response.json({
          threads: [
            {
              root: {
                id: "c0000000-0000-4000-8000-000000000001",
                workspace: otherTeam,
                target: {
                  type: "self_analysis_answer",
                  id: selfAnalysisId,
                  key: "SA.WHY.1",
                },
                parentId: null,
                author,
                body: "A strong reason.",
                mentions: [],
                resolvedAt: null,
                resolvedBy: null,
                editedAt: null,
                deleted: false,
                createdAt: "2026-10-20T01:00:00Z",
              },
              replies: [],
            },
          ],
          unresolvedCount: 1,
        });
      }
      return undefined;
    });
    renderApp(
      `${path}?panel=comments&target=container:self_analysis:${selfAnalysisId}`,
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    expect(await within(panel).findByText("A strong reason.")).toBeTruthy();
    expect(
      await within(panel).findByText("WHY Q1 · From Bacolod Makers"),
    ).toBeTruthy();
    // A screen's list outside an idea takes no new thread (6.0.4).
    expect(within(panel).queryByRole("textbox")).toBeNull();
    expect(
      calls.some(
        ({ path: url }) =>
          url.startsWith("/api/v1/comments?") &&
          url.includes("containerType=self_analysis") &&
          url.includes(`containerId=${selfAnalysisId}`),
      ),
    ).toBe(true);
  });
});

describe("10's Mark as done and Reopen failures (design-spec 6.0.6)", () => {
  const done = selfHome({ status: "done", answered: 3, firstUnanswered: null });
  const allAnswered = selfHome({ answered: 3, firstUnanswered: null });

  test.each([
    {
      failure: "500: Something went wrong with its Ref",
      answer: () => apiError(500, "INTERNAL"),
      words: "Something went wrong. Ref: 8f14e45f",
    },
    {
      failure: "429: the wait",
      answer: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
      words: "Too many attempts. Try again in 1 minute.",
    },
  ])(
    "Mark as done answered $failure in a toast; Retry sends it again",
    async ({ answer, words }) => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = homeApi({
        home: allAnswered,
        write: (call) => {
          if (call.path !== `${api}/complete`) return undefined;
          attempts += 1;
          return attempts === 1 ? answer() : Response.json(done);
        },
      });
      renderApp(path);
      const markDone = await screen.findByRole("button", {
        name: "Mark as done",
      });
      const toast = await toastAfter(words, () => user.click(markDone));
      // Still not done: the press can be made again, and Retry makes it.
      expect(screen.getByRole("button", { name: "Mark as done" })).toBeTruthy();
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      expect(
        await screen.findByRole("button", { name: "Reopen" }),
      ).toBeTruthy();
      expect(
        sent(calls, "POST", `${api}/complete`).map(({ body }) => body),
      ).toEqual([{}, {}]);
    },
  );

  test("Mark as done after asking: Retry sends it as asked, empty questions and all", async () => {
    const user = userEvent.setup();
    let attempts = 0;
    const calls = homeApi({
      write: (call) => {
        if (call.path !== `${api}/complete`) return undefined;
        attempts += 1;
        return attempts === 1
          ? apiError(500, "INTERNAL")
          : Response.json(selfHome({ status: "done" }));
      },
    });
    renderApp(path);
    await user.click(
      await screen.findByRole("button", { name: "Mark as done" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "2 questions are empty. Mark as done anyway?",
    });
    const toast = await toastAfter("Something went wrong. Ref: 8f14e45f", () =>
      user.click(within(dialog).getByRole("button", { name: "Mark as done" })),
    );
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Reopen" })).toBeTruthy();
    expect(
      sent(calls, "POST", `${api}/complete`).map(({ body }) => body),
    ).toEqual([{ confirmEmpty: true }, { confirmEmpty: true }]);
  });

  test.each([
    {
      failure: "500: Something went wrong with its Ref",
      answer: () => apiError(500, "INTERNAL"),
      words: "Something went wrong. Ref: 8f14e45f",
    },
    {
      failure: "429: the wait",
      answer: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 2700 }),
      words: "Too many attempts. Try again in 45 minutes.",
    },
  ])(
    "Reopen answered $failure in a toast; Retry sends it again",
    async ({ answer, words }) => {
      const user = userEvent.setup();
      let attempts = 0;
      const calls = homeApi({
        home: done,
        write: (call) => {
          if (call.path !== `${api}/reopen`) return undefined;
          attempts += 1;
          return attempts === 1 ? answer() : Response.json(allAnswered);
        },
      });
      renderApp(path);
      const reopen = await screen.findByRole("button", { name: "Reopen" });
      const toast = await toastAfter(words, () => user.click(reopen));
      expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      expect(
        await screen.findByRole("button", { name: "Mark as done" }),
      ).toBeTruthy();
      expect(sent(calls, "POST", `${api}/reopen`)).toHaveLength(2);
    },
  );
});

describe("PNL-2 on 10 (design-spec 6.0.5)", () => {
  test("the header's 🕘: every change, its fields named as on 11, amounts in the self analysis's currency", async () => {
    const calls = stubApi((call) => {
      const { method, path: url } = call;
      if (method === "GET" && url === "/api/v1/me") return Response.json(ana);
      if (method === "PATCH" && url === "/api/v1/me") return Response.json(ana);
      if (method === "GET" && url === api) {
        return Response.json(selfHome({ currency: "USD" }));
      }
      const section = [whySection, incomeSection].find(
        ({ key }) => url === `${api}/sections/${key}`,
      );
      if (method === "GET" && section !== undefined) {
        return Response.json({
          section,
          answers: section.questions.map(({ key }) => answer(key)),
        });
      }
      if (method === "GET" && url.startsWith("/api/v1/history?")) {
        return Response.json({
          items: [
            {
              id: "e0000000-0000-4000-8000-000000000001",
              batchId: null,
              target: {
                type: "self_analysis_answer",
                id: selfAnalysisId,
                key: "SA.INCOME.1",
              },
              label: "INCOME Q15",
              action: "update",
              source: "manual",
              before: { text: "Rent", amount: 30000 },
              after: { text: "Rent and school", amount: 35000 },
              changedBy: {
                id: ana.id,
                displayName: ana.displayName,
                avatarUrl: null,
                badge: null,
              },
              changedAt: "2026-10-20T01:00:00Z",
              revertible: true,
            },
          ],
          nextCursor: null,
        });
      }
      return undefined;
    });
    renderApp(
      `${path}?panel=history&target=container:self_analysis:${selfAnalysisId}`,
    );
    const panel = await screen.findByRole("complementary", {
      name: "History",
    });
    expect(await within(panel).findByText("INCOME Q15")).toBeTruthy();
    expect(within(panel).getByText("Amount")).toBeTruthy();
    expect(within(panel).getByText("$30,000")).toBeTruthy();
    expect(within(panel).getByText("$35,000")).toBeTruthy();
    // Once its questions are read, the reason is named as its field.
    expect(await within(panel).findByText("Why this amount?")).toBeTruthy();
    expect(
      within(panel).getByRole("button", {
        name: "Revert to this point, INCOME Q15",
      }),
    ).toBeTruthy();
    expect(
      calls.some(
        ({ path: url }) =>
          url.startsWith("/api/v1/history?") &&
          url.includes("containerType=self_analysis") &&
          url.includes(`containerId=${selfAnalysisId}`) &&
          !url.includes("sectionKeys"),
      ),
    ).toBe(true);
  });
});

describe("M6 Share (design-spec 3.8・6.11)", () => {
  test("the team workspaces, the shared ones ticked and who reads them; Save sends them all", async () => {
    const user = userEvent.setup();
    let current = selfHome({ status: "done" });
    const calls = homeApi({
      read: () => Response.json(current),
      write: (call) => {
        if (call.path !== `${api}/shares`) return undefined;
        current = {
          ...current,
          shares: [
            ...current.shares,
            { workspace: otherTeam, sharedAt: "2026-10-22T01:00:00Z" },
          ],
        };
        return Response.json(current);
      },
    });
    renderApp(path);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    expect(
      within(dialog).getByText(
        "Owners and Members of the workspaces you choose can read your answers and comment on them. Viewers can't.",
      ),
    ).toBeTruthy();
    const bcdx = within(dialog).getByRole("checkbox", { name: "BCDX" });
    const other = within(dialog).getByRole("checkbox", {
      name: otherTeam.name,
    });
    expect((bcdx as HTMLInputElement).checked).toBe(true);
    expect((other as HTMLInputElement).checked).toBe(false);
    await user.click(other);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sent(calls, "PUT", `${api}/shares`)[0]?.body).toEqual({
      workspaceIds: [workspaceId, otherTeam.id],
    });
    expect(await screen.findByText("BCDX, Bacolod Makers")).toBeTruthy();
  });

  test("reopened: a share is only taken off until it is done again", async () => {
    const user = userEvent.setup();
    homeApi();
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    expect(
      within(dialog).getByText(
        "Mark your self analysis as done to share it with more workspaces.",
      ),
    ).toBeTruthy();
    const bcdx = within(dialog).getByRole("checkbox", { name: "BCDX" });
    expect(bcdx.hasAttribute("disabled")).toBe(false);
    expect(
      within(dialog)
        .getByRole("checkbox", { name: otherTeam.name })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(bcdx);
    expect((bcdx as HTMLInputElement).checked).toBe(false);
  });

  test("a refusal says why where Save is, and reads 10 again", async () => {
    const user = userEvent.setup();
    const calls = homeApi({
      home: selfHome({ status: "done" }),
      write: (call) =>
        call.path === `${api}/shares`
          ? apiError(422, "NOT_SHAREABLE")
          : undefined,
    });
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "You can no longer share with one of these workspaces. Check the list and save again.",
      ),
    ).toBeTruthy();
    await waitFor(() => expect(sent(calls, "GET", api).length).toBe(2));
  });

  test("a workspace refused and gone from the re-read list is not sent again", async () => {
    const user = userEvent.setup();
    let current = selfHome({ status: "done" });
    let refuse = true;
    const calls = homeApi({
      read: () => Response.json(current),
      write: (call) => {
        if (call.path !== `${api}/shares`) return undefined;
        if (refuse) {
          // Made a Viewer of it meanwhile: no longer shareable (SDD 5.8 S5).
          refuse = false;
          current = {
            ...current,
            shareableWorkspaces: current.shareableWorkspaces.slice(0, 1),
          };
          return apiError(422, "NOT_SHAREABLE");
        }
        return Response.json(current);
      },
    });
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    await user.click(
      within(dialog).getByRole("checkbox", { name: otherTeam.name }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await within(dialog).findByText(
      "You can no longer share with one of these workspaces. Check the list and save again.",
    );
    await waitFor(() =>
      expect(
        within(dialog).queryByRole("checkbox", { name: otherTeam.name }),
      ).toBeNull(),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(sent(calls, "PUT", `${api}/shares`).map(({ body }) => body)).toEqual(
      [
        { workspaceIds: [workspaceId, otherTeam.id] },
        { workspaceIds: [workspaceId] },
      ],
    );
  });

  test("reopened elsewhere before Save: M6 stays and says why it was refused", async () => {
    const user = userEvent.setup();
    let current = selfHome({ status: "done", shares: [] });
    homeApi({
      read: () => Response.json(current),
      write: (call) => {
        if (call.path !== `${api}/shares`) return undefined;
        current = { ...current, status: "in_progress" };
        return apiError(422, "MUST_BE_DONE_TO_SHARE");
      },
    });
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    await user.click(within(dialog).getByRole("checkbox", { name: "BCDX" }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText(
        "Mark your self analysis as done before you share it with another workspace.",
      ),
    ).toBeTruthy();
    // 10 read again: not done, so nothing can be added now.
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("checkbox", { name: "BCDX" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    expect(screen.getByRole("dialog", { name: "Share" })).toBeTruthy();
  });

  test("while Save is on its way, it does not close", async () => {
    const user = userEvent.setup();
    let release: (response: Response) => void = () => {};
    homeApi({
      home: selfHome({ status: "done" }),
      write: (call) =>
        call.path === `${api}/shares`
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : undefined,
    });
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      within(dialog)
        .getByRole("button", { name: "Cancel" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("dialog", { name: "Share" })).toBeTruthy();
    release(Response.json(selfHome({ status: "done" })));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  test("no team workspace: says to join one, with nothing to save", async () => {
    homeApi({
      home: selfHome({ status: "done", shares: [], shareableWorkspaces: [] }),
    });
    renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    expect(
      within(dialog).getByText(
        "Join a team workspace to share your self analysis",
      ),
    ).toBeTruthy();
    // That line alone (6.11).
    expect(within(dialog).queryByText(/Owners and Members/)).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
  });
});

describe("M6's and M8's URLs on 10 (SDD 4章 ?modal=share・update-template)", () => {
  afterEach(cleanupThenRestoreFocus);

  const panel = {
    panel: "comments",
    target: `container:self_analysis:${selfAnalysisId}`,
  };
  const panelSearch = new URLSearchParams(panel).toString();

  test("M6 before it is done, shared nowhere: nothing, and once 10 is read its URL goes in place of the entry, the panel kept; Mark as done then opens nothing", async () => {
    const user = userEvent.setup();
    const allAnswered = selfHome({
      answered: 3,
      firstUnanswered: null,
      shares: [],
    });
    homeApi({
      home: allAnswered,
      write: (call) =>
        call.path === `${api}/complete`
          ? Response.json({ ...allAnswered, status: "done" })
          : undefined,
    });
    const router = renderApp(`${path}?modal=share&${panelSearch}`);
    await screen.findByText("In progress · 3 / 3 answered");
    await waitFor(() => expect(router.state.location.search).toEqual(panel));
    expect(router.history.length).toBe(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Mark as done" }));
    expect(await screen.findByRole("button", { name: "Reopen" })).toBeTruthy();
    // Share opens it now, but its URL is gone: nothing opens unasked.
    expect(
      screen.getByRole("button", { name: "Share" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("M6 asked while a cached 10 is read again: the URL keeps it, and it opens once the read says done", async () => {
    let current = selfHome({ shares: [] });
    let read: Promise<void> | null = null;
    const calls = homeApi({
      read: () =>
        read === null
          ? Response.json(current)
          : read.then(() => Response.json(current)),
    });
    const router = renderApp(`${path}/WHY`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    const { held, release } = hold();
    read = held;
    // Marked as done in another tab.
    current = selfHome({ status: "done", shares: [] });
    const reads = sent(calls, "GET", api).length;
    await act(() => router.navigate({ href: `${path}?modal=share` }));
    await waitFor(() => expect(sent(calls, "GET", api).length).toBe(reads + 1));
    // The cached 10 meanwhile: not done, shared nowhere.
    expect(
      await screen.findByText("In progress · 1 / 3 answered"),
    ).toBeTruthy();
    expect(router.state.location.search).toEqual({ modal: "share" });
    expect(screen.queryByRole("dialog")).toBeNull();
    release();
    expect(await screen.findByRole("dialog", { name: "Share" })).toBeTruthy();
  });

  test("M6 open, then 10 read again reopened elsewhere and shared nowhere: it stays until closed", async () => {
    const user = userEvent.setup();
    let current = selfHome({ status: "done", shares: [] });
    homeApi({ read: () => Response.json(current) });
    const router = renderApp(`${path}?modal=share`);
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    current = selfHome({ shares: [] });
    readAgainOnFocus();
    // M6 as 10 reads now: nothing to add before it is done again. A Save the API refuses
    // meanwhile says why in it ("reopened elsewhere before Save", above).
    expect(
      await within(dialog).findByText(
        "Mark your self analysis as done to share it with more workspaces.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "Share" })).toBe(dialog);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.search).toEqual({});
  });

  test.each([
    { about: "without about", search: "modal=update-template" },
    {
      about: "about another self analysis",
      search:
        "modal=update-template&about=self_analysis:5a5a5a5a-0000-4000-8000-000000000009",
    },
  ])(
    "M8 $about: nothing, and once 10 is read its URL goes in place of the entry, the panel kept",
    async ({ search }) => {
      const calls = homeApi();
      const router = renderApp(`${path}?${search}&${panelSearch}`);
      await screen.findByText("In progress · 1 / 3 answered");
      await waitFor(() => expect(router.state.location.search).toEqual(panel));
      expect(router.history.length).toBe(1);
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(sent(calls, "GET", previewPath)).toEqual([]);
    },
  );

  test("M8 asked while 10 is first read: the URL keeps it, and it opens once 10 is read", async () => {
    const { held, release } = hold();
    const about = `self_analysis:${selfAnalysisId}`;
    const calls = homeApi({
      read: () =>
        held.then(() =>
          Response.json(
            selfHome({
              template: {
                versionId: "7d7d7d7d-0000-4000-8000-000000000001",
                versionNumber: 1,
                newerVersion: {
                  versionId: preview.to.versionId,
                  versionNumber: 3,
                },
              },
            }),
          ),
        ),
    });
    const router = renderApp(`${path}?modal=update-template&about=${about}`);
    await waitFor(() => expect(sent(calls, "GET", api)).toHaveLength(1));
    expect(router.state.location.search).toEqual({
      modal: "update-template",
      about,
    });
    release();
    const dialog = await screen.findByRole("dialog", {
      name: "Update template",
    });
    expect(
      await within(dialog).findByText("Move from v1 to v3 of the template."),
    ).toBeTruthy();
  });

  test.each([
    { modal: "M6", search: "modal=share" },
    {
      modal: "M8",
      search: `modal=update-template&about=self_analysis:${selfAnalysisId}`,
    },
  ])(
    "no published template: $modal opens nothing, and its URL goes once that is read",
    async ({ search }) => {
      homeApi({ read: () => apiError(409, "TEMPLATE_NOT_PUBLISHED") });
      const router = renderApp(`${path}?${search}`);
      await screen.findByText(
        "Templates aren't ready yet. Ask your administrator.",
      );
      await waitFor(() => expect(router.state.location.search).toEqual({}));
      expect(router.history.length).toBe(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );
});

describe("a Save of 10's dialogs on its way when Back closes them (design-spec 6.0.6)", () => {
  const both = selfHome({
    status: "done",
    shares: [
      {
        workspace: { id: workspaceId, name: "BCDX" },
        sharedAt: "2026-10-01T01:00:00Z",
      },
      { workspace: otherTeam, sharedAt: "2026-10-22T01:00:00Z" },
    ],
  });
  const reopened = selfHome();

  /**
   * Opens M6 from Share on a done 10, adds Bacolod Makers and saves; Back closes M6
   * while S5 is held. Let go, S5 answers `first` and S1 reads `then`; S5 answers `later`
   * after, if given, else shares with both.
   */
  async function backWhileSharing(
    first: () => Response,
    then: SelfAnalysisHome = selfHome({ status: "done" }),
    later?: () => Response,
  ) {
    const user = userEvent.setup();
    let current = selfHome({ status: "done" });
    const { held, release } = hold();
    let attempts = 0;
    const calls = homeApi({
      read: () => Response.json(current),
      write: (call) => {
        if (call.path !== `${api}/shares`) return undefined;
        attempts += 1;
        if (attempts > 1) {
          if (later !== undefined) return later();
          current = both;
          return Response.json(both);
        }
        return held.then(() => {
          current = then;
          return first();
        });
      },
    });
    const router = renderApp(path);
    await user.click(await screen.findByRole("button", { name: "Share" }));
    const dialog = await screen.findByRole("dialog", { name: "Share" });
    await user.click(
      within(dialog).getByRole("checkbox", { name: otherTeam.name }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await act(async () => router.history.back());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(router.state.location.pathname).toBe(path);
    expect(router.state.location.search).toEqual({});
    return { user, calls, router, release };
  }

  const shareSends = (calls: Call[]) =>
    sent(calls, "PUT", `${api}/shares`).map(({ body }) => body);
  const chosen = { workspaceIds: [workspaceId, otherTeam.id] };

  test("M6: a Save that goes through shares, and neither opens M6 again nor leaves 10", async () => {
    const { calls, router, release } = await backWhileSharing(
      () => Response.json(both),
      both,
    );
    release();
    expect(await screen.findByText("BCDX, Bacolod Makers")).toBeTruthy();
    expect(shareSends(calls)).toEqual([chosen]);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.state.location.pathname).toBe(path);
  });

  test.each([
    {
      failure: "the network",
      answer: (): Response => {
        throw new TypeError("Failed to fetch");
      },
      words: "Couldn't save",
    },
    {
      failure: "an API that is down, with its Ref",
      answer: () => apiError(503, "UPSTREAM_UNAVAILABLE"),
      words: "Couldn't save. Ref: 8f14e45f",
    },
    {
      failure: "an unexpected 500",
      answer: () => apiError(500, "INTERNAL"),
      words: "Something went wrong. Ref: 8f14e45f",
    },
  ])(
    "M6: $failure says so in a toast; Retry sends the same choice again and shares it",
    async ({ answer, words }) => {
      const { user, calls, release } = await backWhileSharing(answer);
      const toast = await toastAfter(words, async () => release());
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      expect(await screen.findByText("BCDX, Bacolod Makers")).toBeTruthy();
      expect(shareSends(calls)).toEqual([chosen, chosen]);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  test("M6: the toast's Retry refused as reopened meanwhile: its words in a toast without Retry, and 10 read again", async () => {
    const { user, calls, release } = await backWhileSharing(
      (): Response => {
        throw new TypeError("Failed to fetch");
      },
      reopened,
      () => apiError(422, "MUST_BE_DONE_TO_SHARE"),
    );
    const toast = await toastAfter("Couldn't save", async () => release());
    const reads = sent(calls, "GET", api).length;
    const refused = await toastAfter(
      "Mark your self analysis as done before you share it with another workspace.",
      () => user.click(within(toast).getByRole("button", { name: "Retry" })),
    );
    expect(within(refused).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() =>
      expect(sent(calls, "GET", api).length).toBeGreaterThan(reads),
    );
    expect(
      await screen.findByText("In progress · 1 / 3 answered"),
    ).toBeTruthy();
    expect(shareSends(calls)).toEqual([chosen, chosen]);
  });

  /** The failures a screen or a toast says, to tell a new one from those already shown. */
  const failures = () =>
    screen.queryAllByText(/^(Couldn't save|Something went wrong)/);

  test("M6: the toast's Retry finds the session ended: the sign-in screen, and no failure of its own", async () => {
    const { user, router, release } = await backWhileSharing(
      (): Response => {
        throw new TypeError("Failed to fetch");
      },
      undefined,
      () => apiError(401, "UNAUTHENTICATED"),
    );
    const toast = await toastAfter("Couldn't save", async () => release());
    const before = new Set(failures());
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(failures().filter((words) => !before.has(words))).toEqual([]);
  });

  test("M6: refused as reopened meanwhile, its words in a toast without Retry, and 10 read again", async () => {
    const { calls, release } = await backWhileSharing(
      () => apiError(422, "MUST_BE_DONE_TO_SHARE"),
      reopened,
    );
    const reads = sent(calls, "GET", api).length;
    const toast = await toastAfter(
      "Mark your self analysis as done before you share it with another workspace.",
      async () => release(),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() =>
      expect(sent(calls, "GET", api).length).toBeGreaterThan(reads),
    );
    expect(
      await screen.findByText("In progress · 1 / 3 answered"),
    ).toBeTruthy();
    expect(shareSends(calls)).toEqual([chosen]);
  });

  /**
   * Opens Change currency on 10, come to from 11, chooses USD and saves; Back leaves 10
   * while S1 PATCH is held. Let go, it answers `first`; `later` answers any after.
   */
  async function backWhileChangingCurrency(
    first: () => Response,
    later: () => Response = () => Response.json(selfHome({ currency: "USD" })),
  ) {
    const user = userEvent.setup();
    const { held, release } = hold();
    let attempts = 0;
    const calls = homeApi({
      write: (call) => {
        if (call.method !== "PATCH") return undefined;
        attempts += 1;
        return attempts === 1 ? held.then(first) : later();
      },
    });
    const router = renderApp(`${path}/WHY`);
    await screen.findByRole("textbox", { name: "Answer to Q1" });
    await act(() => router.navigate({ href: path }));
    await user.click(
      await screen.findByRole("button", {
        name: "More for My Self Analysis",
      }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Change currency" }));
    const dialog = await screen.findByRole("dialog", { name: "Currency" });
    await user.click(within(dialog).getByRole("button", { name: /Currency/ }));
    await user.click(await screen.findByRole("option", { name: /^USD/ }));
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await act(async () => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`${path}/WHY`),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    return { user, calls, router, release };
  }

  test.each([
    {
      failure: "the network",
      answer: (): Response => {
        throw new TypeError("Failed to fetch");
      },
      words: "Couldn't save",
    },
    {
      failure: "an unexpected 500",
      answer: () => apiError(500, "INTERNAL"),
      words: "Something went wrong. Ref: 8f14e45f",
    },
  ])(
    "Change currency, 10 left by Back: $failure says so in a toast; Retry sends the same currency again",
    async ({ answer, words }) => {
      const { user, calls, release } = await backWhileChangingCurrency(answer);
      const toast = await toastAfter(words, async () => release());
      await user.click(within(toast).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(sent(calls, "PATCH", api).map(({ body }) => body)).toEqual([
          { currency: "USD" },
          { currency: "USD" },
        ]),
      );
    },
  );

  test("Change currency, 10 left by Back: the toast's Retry finds the session ended: the sign-in screen, and no failure of its own", async () => {
    const { user, router, release } = await backWhileChangingCurrency(
      (): Response => {
        throw new TypeError("Failed to fetch");
      },
      () => apiError(401, "UNAUTHENTICATED"),
    );
    const toast = await toastAfter("Couldn't save", async () => release());
    const before = new Set(failures());
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    expect(failures().filter((words) => !before.has(words))).toEqual([]);
  });
});
