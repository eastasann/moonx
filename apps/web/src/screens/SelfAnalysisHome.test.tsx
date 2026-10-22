import type { Me, SelfAnalysisHome } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  incomeSection,
  otherTeam,
  personal,
  selfAnalysisId,
  selfHome,
  viewerOfBcdx,
  whySection,
} from "../test/selfAnalysis";

// 10 Self Analysis and M6 Share (design-spec 6.11・3.8, SDD 5.8 S1・S4・S5).

afterEach(() => {
  vi.unstubAllGlobals();
});

const path = `/w/${workspaceId}/self-analysis`;
const api = "/api/v1/me/self-analysis";

/** The API of 10: S1 answers `home`; `write` answers S1 PATCH, S4 and S5. */
function homeApi({
  me = ana,
  home = selfHome(),
  read,
  write = (_call: Call): Response | undefined => undefined,
}: {
  me?: Me;
  home?: SelfAnalysisHome;
  read?: () => Response;
  /** Answers S1 PATCH, S4 and S5; a promise holds the answer back. */
  write?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  return stubApi((call) => {
    const { method, path: url } = call;
    if (method === "GET" && url === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && url === "/api/v1/me") return Response.json(me);
    if (method === "GET" && url === api) return read?.() ?? Response.json(home);
    if (method === "GET" && url === `${api}/sections/WHY`) {
      return Response.json({
        section: whySection,
        answers: whySection.questions.map(({ key }) => answer(key)),
      });
    }
    if (url.startsWith(api)) return write(call);
    return undefined;
  });
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
