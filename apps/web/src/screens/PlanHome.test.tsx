import type {
  HistoryEntry,
  Me,
  PlanHome,
  PlanSummary,
  Role,
} from "@moonx/schemas";
import { focusManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
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
  anaRef,
  ideaId,
  planHome,
  planId,
  planItem,
  planPath,
  plans,
  versionId,
} from "../test/plans";
import { home as ideaHome } from "../test/validation";

// 20 Plan home, M3, M4, M5 and Rename plan (design-spec 6.12・3.8, SDD 5.9 P1–P8).

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const api = `/api/v1/plans/${planId}`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const goNoGoContext = {
  conditions: {
    launchIf: "Ten orders a day for two weeks.",
    delayIf: null,
    stopIf: "No permit by March.",
  },
  keyMetrics: ideaHome.keyMetrics,
  currentVersion: planHome().versions[0],
  hasChangesSinceVersion: true,
  history: [],
};

/**
 * The API of 20: `home` answers P2 GET (a version's when asked), `ideaPlans` P1 GET,
 * `write` the writes, `history` H1 and `threads` C1. `me` and `read` may change what U1
 * and P2 GET answer while the test runs; a promise from `read` holds P2 GET back.
 */
function planApi({
  me = ana,
  home = planHome(),
  read,
  version,
  ideaPlans = plans,
  ideaArchived = false,
  history = [],
  threads = [],
  write = (_call: Call): Response | Promise<Response> | undefined => undefined,
}: {
  me?: Me | (() => Me);
  home?: PlanHome;
  /** P2 GET of the plan as it is now, in place of `home` and its saves. */
  read?: () => PlanHome | Promise<PlanHome>;
  version?: PlanHome;
  /** The idea's plans, the archived ones included (P1 GET `includeArchived=true`). */
  ideaPlans?: PlanSummary[];
  ideaArchived?: boolean;
  history?: HistoryEntry[];
  threads?: unknown[];
  write?: (call: Call) => Response | Promise<Response> | undefined;
} = {}) {
  // P2 GET answers the plan as the last P2 PATCH left it.
  let current = home;
  return stubApi((call) => {
    const { method, path } = call;
    if (method === "PATCH" && path === api) {
      return (async () => {
        const answered = await write(call);
        if (answered?.ok) current = (await answered.clone().json()) as PlanHome;
        return answered ?? new Response(null, { status: 404 });
      })();
    }
    const user = typeof me === "function" ? me() : me;
    if (method === "GET" && path === "/api/v1/me") return Response.json(user);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(user);
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return Response.json({
        ...ideaHome,
        idea: { ...ideaHome.idea, archived: ideaArchived },
      });
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${ideaId}/plans?includeArchived=true`
    ) {
      return Response.json({ items: ideaPlans });
    }
    if (method === "GET" && path === api) {
      return (async () => Response.json((await read?.()) ?? current))();
    }
    if (method === "GET" && path === `${api}?versionId=${versionId}`) {
      return Response.json(version ?? home);
    }
    if (method === "GET" && path.startsWith(`${api}/items/`)) {
      const itemNo = Number(path.split("/items/")[1]?.split("?")[0]);
      return Response.json(planItem(itemNo));
    }
    if (method === "GET" && path === `${api}/go-no-go-context`) {
      return Response.json(goNoGoContext);
    }
    if (method === "GET" && path.startsWith(`${api}/execution-items`)) {
      return Response.json({
        items: [
          {
            id: "5e0c0000-0000-4000-8000-000000000001",
            type: "milestone",
            title: "Business decision",
          },
        ],
      });
    }
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${workspaceId}/members`
    ) {
      return Response.json({
        items: [
          {
            user: anaRef,
            email: null,
            role: "owner",
            joinedAt: "2026-01-01T00:00:00.000Z",
            isPersonalOwner: false,
          },
        ],
      });
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads, unresolvedCount: threads.length });
    }
    if (method === "GET" && path.startsWith("/api/v1/history?")) {
      return Response.json({ items: history, nextCursor: null });
    }
    if (method !== "GET") return write(call);
    return undefined;
  });
}

const sent = (calls: Call[], method: string, url: string) =>
  calls.filter((call) => call.method === method && call.path === url);

describe("20 Plan home (design-spec 6.12)", () => {
  test("the header, the key numbers, Go / No-Go, the versions, execution and the items", async () => {
    planApi({ home: planHome({ latestDecision: "hold" }) });
    renderApp(planPath());
    expect(
      await screen.findByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Version: v1 For advisors + changes · Updated Oct 1"),
    ).toBeTruthy();
    expect(screen.getByText("Latest decision is Hold.")).toBeTruthy();
    expect(
      (
        screen.getByRole("textbox", {
          name: "Business Name",
        }) as HTMLInputElement
      ).value,
    ).toBe("Health Bowl Co.");
    expect(
      (screen.getByRole("textbox", { name: "Prepared by" }) as HTMLInputElement)
        .value,
    ).toBe("Ana");
    const numbers = screen.getByRole("region", { name: "Key numbers" });
    expect(within(numbers).getByText("From validation")).toBeTruthy();
    expect(
      within(numbers)
        .getByRole("link", { name: "Edit in validation" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${ideaId}/economics`);
    const goNoGo = screen.getByRole("region", { name: "Go / No-Go" });
    expect(within(goNoGo).getByText("Delay")).toBeTruthy();
    expect(goNoGo.textContent).toContain("Sep 28 · Ana Villanueva");
    expect(
      within(goNoGo)
        .getByRole("link", { name: "See all Go / No-Go decisions" })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/decisions?kind=go_no_go&idea=${ideaId}`);
    expect(
      screen
        .getByRole("link", { name: /v1 For advisors/ })
        .getAttribute("href"),
    ).toBe(planPath(`?version=${versionId}`));
    const execution = screen.getByRole("region", { name: "Execution" });
    expect(within(execution).getByText("1 item overdue")).toBeTruthy();
    expect(
      within(execution).getByText("2 items due in the next 7 days"),
    ).toBeTruthy();
    expect(
      within(execution)
        .getByRole("link", { name: "Open Execution" })
        .getAttribute("href"),
    ).toBe(planPath("/execution"));
    const partA = screen.getByRole("list", { name: "Part A: Business Case" });
    const summary = within(partA).getAllByRole("listitem")[0];
    expect(summary?.textContent).toContain("1 Executive Summary");
    expect(summary?.textContent).toContain("5/6");
    expect(summary?.textContent).toContain("Uses your validation");
    expect(summary?.textContent).toContain("2 comments");
    // Each item opens 21.
    expect(
      within(partA)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([planPath("/items/1"), planPath("/items/2")]);
    expect(
      screen.getByRole("region", { name: "Part B: Execution Plan" })
        .textContent,
    ).toContain("0 / 1");
    expect(
      screen.getByRole("button", { name: "Record Go / No-Go" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save version" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pitch Deck" })).toBeTruthy();
  });

  test("a draft not yet changed says where to start", async () => {
    planApi({
      home: planHome({
        draftOnly: true,
        latestVersion: null,
        hasChangesSinceVersion: false,
        versions: [],
        latestGoNoGo: null,
      }),
    });
    renderApp(planPath());
    expect(
      await screen.findByText(
        "Start with the items marked [V]. They already have your validation data.",
      ),
    ).toBeTruthy();
    expect(screen.getByText(/^No version saved · Updated/)).toBeTruthy();
    expect(screen.getByText("Not recorded yet")).toBeTruthy();
    expect(screen.getByText("No versions saved yet")).toBeTruthy();
  });

  test("Business Name and Prepared by save as typed, with the header's version", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.method === "PATCH" && call.path === api
          ? Response.json(
              planHome({
                businessName: "Bowl Co.",
                lockVersion: 5,
              }),
            )
          : undefined,
    });
    renderApp(planPath());
    const field = await screen.findByRole("textbox", { name: "Business Name" });
    await user.clear(field);
    await user.type(field, "Bowl Co.");
    await user.tab();
    await waitFor(() =>
      expect(sent(calls, "PATCH", api).at(-1)?.body).toEqual({
        businessName: "Bowl Co.",
        lockVersion: 4,
      }),
    );
  });

  test("the plan switch lists the plans, the archived under Archived, and Add plan opens M5", async () => {
    const user = userEvent.setup();
    planApi();
    const router = renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "Switch plan" }),
    );
    const menu = screen.getByRole("menu");
    expect(
      within(menu)
        .getByRole("menuitem", { name: "Plan A" })
        .getAttribute("href"),
    ).toBe(planPath());
    const archived = within(menu).getByRole("group", { name: "Archived" });
    expect(
      within(archived).getByRole("menuitem", { name: "Plan B" }),
    ).toBeTruthy();
    await user.click(within(menu).getByRole("menuitem", { name: "Add plan" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        modal: "create-plan",
      }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Create plan draft" }),
    ).toBeTruthy();
  });

  test("the plan switch says so when the plans could not be read, and reads them again", async () => {
    const user = userEvent.setup();
    let failing = true;
    const calls = planApi();
    // P1 fails once; the rest answer as before.
    const answer = vi.mocked(fetch).getMockImplementation();
    vi.mocked(fetch).mockImplementation(async (input, init) => {
      const url = new URL(
        String(input instanceof Request ? input.url : input),
        "http://localhost",
      );
      if (failing && url.pathname === `/api/v1/ideas/${ideaId}/plans`) {
        failing = false;
        return apiError(500, "INTERNAL");
      }
      return (answer as typeof fetch)(input, init);
    });
    renderApp(planPath());
    const toggle = await screen.findByRole("button", { name: "Switch plan" });
    await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
    await user.click(toggle);
    await user.click(
      screen.getByRole("menuitem", {
        name: "Couldn't load the plans. Try again",
      }),
    );
    await waitFor(() =>
      expect(
        calls.filter(({ path }) => path.includes("plans?includeArchived=true")),
      ).toHaveLength(1),
    );
    await user.click(screen.getByRole("button", { name: "Switch plan" }));
    expect(await screen.findByRole("group", { name: "Archived" })).toBeTruthy();
  });

  test("a Viewer reads it: no tools, the header as text, the numbers opened in validation", async () => {
    planApi({ me: as("viewer") });
    renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    expect(
      screen.getByText("Business Name: Health Bowl Co. · Prepared by: Ana"),
    ).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Business Name" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Record Go / No-Go" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
    expect(
      screen.getByRole("link", { name: "Open in validation" }),
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Switch plan" }));
    expect(screen.queryByRole("menuitem", { name: "Add plan" })).toBeNull();
  });

  test.each([
    ["the latest decision is Hold", { latestDecision: "hold" as const }],
    ["the plan is archived", { archived: true }],
    ["the idea is archived", { ideaArchived: true }],
  ])(
    "no Add plan, and ?modal=create-plan opens no M5, when %s",
    async (_, extra) => {
      const user = userEvent.setup();
      planApi({
        home: planHome(extra),
        ideaArchived: "ideaArchived" in extra,
      });
      renderApp(planPath("?modal=create-plan"));
      const toggle = await screen.findByRole("button", { name: "Switch plan" });
      // 20 and its plans are read: an M5 the URL asked for would be open by now.
      await waitFor(() => expect(toggle.hasAttribute("disabled")).toBe(false));
      expect(
        screen.queryByRole("dialog", { name: "Create plan draft" }),
      ).toBeNull();
      await user.click(toggle);
      const menu = screen.getByRole("menu");
      expect(
        within(menu).getByRole("menuitem", { name: "Plan A" }),
      ).toBeTruthy();
      expect(
        within(menu).queryByRole("menuitem", { name: "Add plan" }),
      ).toBeNull();
    },
  );

  test("Pitch Deck opens 23 for every role, on the version open", async () => {
    const user = userEvent.setup();
    planApi();
    const router = renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    await user.click(screen.getByRole("button", { name: "Pitch Deck" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(planPath("/pitch")),
    );
    cleanup();

    planApi({ me: as("viewer") });
    const asViewer = renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    await user.click(screen.getByRole("button", { name: "Pitch Deck" }));
    await waitFor(() =>
      expect(asViewer.state.location.pathname).toBe(planPath("/pitch")),
    );
    cleanup();

    planApi({
      version: planHome({ viewingVersion: planHome().latestVersion }),
    });
    const onVersion = renderApp(planPath(`?version=${versionId}`));
    await screen.findByText("Viewing v1 For advisors (read only)");
    await user.click(screen.getByRole("button", { name: "Pitch Deck" }));
    await waitFor(() =>
      expect(onVersion.state.location.href).toBe(
        planPath(`/pitch?version=${versionId}`),
      ),
    );
  });

  test("an archived plan: the notice with Restore, read only, and its panels say so", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      home: planHome({ archived: true }),
      history: [
        {
          id: "a0000000-0000-4000-8000-000000000011",
          batchId: null,
          target: { type: "business_plan", id: planId, key: null },
          label: "Plan A",
          action: "update",
          source: "manual",
          before: { name: "Plan A", businessName: "", preparedBy: "Ana" },
          after: {
            name: "Plan A",
            businessName: "Health Bowl Co.",
            preparedBy: "Ana",
          },
          changedBy: anaRef,
          changedAt: "2026-10-01T02:00:00.000Z",
          revertible: true,
        },
      ],
      write: (call) =>
        call.path === `${api}/restore` ? Response.json(plans[0]) : undefined,
    });
    renderApp(planPath());
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
    // 23 shows an archived plan's deck (6.12).
    expect(screen.getByRole("button", { name: "Pitch Deck" })).toBeTruthy();
    expect(screen.queryByRole("textbox", { name: "Business Name" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "History" }));
    const panel = await waitFor(
      () =>
        screen.queryByRole("complementary", { name: "History" }) ??
        screen.getByRole("dialog", { name: "History" }),
    );
    expect(
      await within(panel).findByText(
        "This plan is archived. Restore it to make changes.",
      ),
    ).toBeTruthy();
    expect(within(panel).getByText("Health Bowl Co.")).toBeTruthy();
    expect(
      within(panel).queryByRole("button", { name: /Revert to this point/ }),
    ).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/restore`)).toHaveLength(1),
    );
  });

  test("a saved version opens read only, with the way back to the latest", async () => {
    planApi({
      version: planHome({
        viewingVersion: planHome().latestVersion,
        businessName: "Health Bowl",
        date: "2026-09-20T02:00:00.000Z",
      }),
    });
    renderApp(planPath(`?version=${versionId}`));
    expect(
      await screen.findByText("Viewing v1 For advisors (read only)"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Show the latest" })
        .getAttribute("href"),
    ).toBe(planPath());
    expect(
      screen.getByText("Version: v1 For advisors · Saved Sep 20"),
    ).toBeTruthy();
    expect(screen.getByText("As saved in this version")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Record Go / No-Go" }),
    ).toBeNull();
    expect(
      screen.getByText("Business Name: Health Bowl · Prepared by: Ana"),
    ).toBeTruthy();
    // The version open is not a link to itself; its items open 21 on it.
    const versions = screen.getByRole("list", { name: "Versions" });
    expect(within(versions).queryAllByRole("link")).toHaveLength(0);
    expect(
      within(screen.getByRole("list", { name: "Part B: Execution Plan" }))
        .getByRole("link", { name: /13 Ownership/ })
        .getAttribute("href"),
    ).toBe(planPath(`/items/13?version=${versionId}`));
    expect(versions.textContent).toContain("Viewing · Sep 20 · Ana Villanueva");
  });

  test("a version saved by someone who left names them with (former member) (6.16)", async () => {
    const base = planHome();
    planApi({
      home: planHome({
        versions: base.versions.map((version) => ({
          ...version,
          savedBy: { ...anaRef, badge: "former_member" as const },
        })),
      }),
    });
    renderApp(planPath());
    const versions = await screen.findByRole("list", { name: "Versions" });
    expect(versions.textContent).toContain(
      "Sep 20 · Ana Villanueva (former member)",
    );
  });

  test("another workspace's plan, or one of another idea, is not shown under this URL", async () => {
    planApi({
      home: planHome({ ideaId: "aaaaaaaa-0000-4000-8000-000000000000" }),
    });
    renderApp(planPath());
    expect(await screen.findByText("Not found. Check the link.")).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    planApi({
      home: planHome({ workspaceId: "aaaaaaaa-0000-4000-8000-000000000001" }),
    });
    renderApp(planPath());
    expect(
      await screen.findByText("You don't have access to this"),
    ).toBeTruthy();
  });
});

describe("20 when something fails (design-spec 6.0.6, SDD 8.2)", () => {
  /** The side navigation and the TabBar alike (the width picks one), on Ideas. */
  const expectNavigation = () => {
    const navs = screen.getAllByRole("navigation", { name: "Main" });
    expect(navs).not.toHaveLength(0);
    for (const nav of navs) {
      expect(
        within(nav)
          .getByRole("link", { name: "Ideas" })
          .getAttribute("aria-current"),
      ).toBe("page");
    }
  };

  test("a block that fails to render says so alone: the other blocks and the navigation stay", async () => {
    // React logs what a boundary catches; the failure is the test's point.
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "3f2a9c1d0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    const [saved] = planHome().versions;
    planApi({
      home: planHome({
        // A version's name that is no text: what P2 never sends (SDD 5.9).
        versions: saved === undefined ? [] : [{ ...saved, name: {} as string }],
      }),
    });
    renderApp(planPath());
    expect(
      await screen.findByRole("heading", {
        level: 3,
        name: "Something went wrong",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 3f2a9c1d")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Versions" })).toBeNull();
    for (const block of [
      "Key numbers",
      "Part A: Business Case",
      "Part B: Execution Plan",
      "Go / No-Go",
      "Execution",
    ]) {
      expect(screen.getByRole("region", { name: block })).toBeTruthy();
    }
    expect(
      screen.getByRole("heading", { level: 1, name: "Plan A" }),
    ).toBeTruthy();
    expectNavigation();
  });

  test("a screen that fails to render keeps the frame and its navigation, with the Ref", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(sentry, "reportError").mockReturnValue(
      "9d2b7c1a0b8e4f5aa1b2c3d4e5f6a7b8",
    );
    // No parts: what P2 never sends (SDD 5.9), and the hub cannot be drawn.
    planApi({
      home: planHome({ parts: null as unknown as PlanHome["parts"] }),
    });
    renderApp(planPath());
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Something went wrong",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Ref: 9d2b7c1a")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(sentry.reportError).toHaveBeenCalledOnce();
    expectNavigation();
    // The frame's header keeps its way back and the breadcrumbs.
    expect(
      screen
        .getAllByRole("link", { name: "Ideas" })
        .some(
          (link) => link.getAttribute("href") === `/w/${workspaceId}/ideas`,
        ),
    ).toBe(true);
  });

  test("Archive plan refused as archived: says why without Retry, and 20 reads it again as archived", async () => {
    const user = userEvent.setup();
    let isArchived = false;
    const calls = planApi({
      read: () => planHome({ archived: isArchived }),
      write: (call) => {
        if (call.path !== `${api}/archive`) return undefined;
        // Archived elsewhere since 20 was read.
        isArchived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "More for Plan A" }),
    );
    const reads = sent(calls, "GET", api).length;
    const toast = await toastAfter("Couldn't save. It's archived.", () =>
      user.click(screen.getByRole("menuitem", { name: "Archive plan" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    expect(sent(calls, "GET", api).length).toBeGreaterThan(reads);
    expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
    expect(sent(calls, "POST", `${api}/archive`)).toHaveLength(1);
  });

  test("Restore refused once the role is Viewer: says why without Retry, and 20 reads it again read only", async () => {
    const user = userEvent.setup();
    let me: Me = ana;
    const calls = planApi({
      me: () => me,
      home: planHome({ archived: true }),
      write: (call) => {
        if (call.path !== `${api}/restore`) return undefined;
        // Made a Viewer since 20 was read.
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(planPath());
    const restore = await screen.findByRole("button", { name: "Restore" });
    const toast = await toastAfter(
      "Couldn't save. You don't have access to this.",
      () => user.click(restore),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    // A Viewer has no Restore (6.12「案のアーカイブ」).
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Restore" })).toBeNull(),
    );
    expect(screen.getByText("This plan is archived")).toBeTruthy();
    expect(sent(calls, "POST", `${api}/restore`)).toHaveLength(1);
  });
});

describe("M3, M4, M5 and Rename plan", () => {
  test("M3 saves v2 by default, then says so", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.method === "POST" && call.path === `${api}/versions`
          ? Response.json(
              {
                id: "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a21",
                versionNumber: 2,
                name: (call.body as { name: string }).name,
                savedBy: anaRef,
                savedAt: "2026-10-22T02:00:00.000Z",
              },
              { status: 201 },
            )
          : undefined,
    });
    const router = renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "Save version" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Save version" });
    const name = within(dialog).getByRole("textbox", { name: /Version name/ });
    expect((name as HTMLInputElement).value).toBe("v2");
    await user.clear(name);
    // A required field empty: the decision waits (6.0.6), and the field says why.
    expect(within(dialog).getByText("Can't be empty")).toBeTruthy();
    expect(
      within(dialog)
        .getByRole("button", { name: "Save version" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.type(name, "v2 For the bank");
    await user.click(
      within(dialog).getByRole("button", { name: "Save version" }),
    );
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/versions`)[0]?.body).toEqual({
        name: "v2 For the bank",
      }),
    );
    expect(
      (await screen.findAllByText("v2 For the bank saved")).length,
    ).toBeGreaterThan(0);
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  test("M4 shows the conditions and the version, asks to save one first, and needs a choice and a reason", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.method === "POST" && call.path === `${api}/go-no-go`
          ? Response.json({ entry: {}, stage: "planning" }, { status: 201 })
          : undefined,
    });
    const router = renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "Record Go / No-Go" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Record Go / No-Go",
    });
    expect(
      await within(dialog).findByText("Ten orders a day for two weeks."),
    ).toBeTruthy();
    expect(
      within(dialog).getByText("We delay if").nextSibling?.textContent,
    ).toBe("Empty");
    expect(
      within(dialog).getByText(
        "The plan has changed since v1 For advisors was saved. Save a version first?",
      ),
    ).toBeTruthy();
    const record = () => within(dialog).getByRole("button", { name: "Record" });
    // Both are required: Record waits for a choice and a reason (6.0.6).
    expect(record().hasAttribute("disabled")).toBe(true);
    await user.click(within(dialog).getByRole("radio", { name: "Delay" }));
    expect(record().hasAttribute("disabled")).toBe(true);
    const why = within(dialog).getByRole("textbox", { name: /Why\?/ });
    await user.type(why, " ");
    expect(within(dialog).getByText("Can't be empty")).toBeTruthy();
    await user.clear(why);
    await user.type(why, "Permits first.");
    await user.click(record());
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/go-no-go`)[0]?.body).toEqual({
        value: "delay",
        reason: "Permits first.",
      }),
    );
    await waitFor(() => expect(router.state.location.search).toEqual({}));
    expect(
      (await screen.findAllByText("Go / No-Go recorded")).length,
    ).toBeGreaterThan(0);
  });

  test("M4's Save a version opens M3; back from it, M4 keeps its choice and reason", async () => {
    const user = userEvent.setup();
    planApi();
    const router = renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "Record Go / No-Go" }),
    );
    let dialog = await screen.findByRole("dialog", {
      name: "Record Go / No-Go",
    });
    await user.click(within(dialog).getByRole("radio", { name: "Stop" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: /Why\?/ }),
      "No permit.",
    );
    await user.click(
      await within(dialog).findByRole("link", { name: "Save a version" }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        modal: "save-version",
      }),
    );
    const save = await screen.findByRole("dialog", { name: "Save version" });
    await user.click(within(save).getByRole("button", { name: "Cancel" }));
    dialog = await screen.findByRole("dialog", { name: "Record Go / No-Go" });
    expect(
      (within(dialog).getByRole("radio", { name: "Stop" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /Why\?/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("No permit.");
  });

  test("M5 names it after the plans in use, archived ones too, and opens the new plan's 20", async () => {
    const user = userEvent.setup();
    const created = "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a40";
    let taken = true;
    const calls = planApi({
      write: (call) => {
        if (
          call.method !== "POST" ||
          call.path !== `/api/v1/ideas/${ideaId}/plans`
        ) {
          return undefined;
        }
        if (taken) {
          taken = false;
          return apiError(409, "NAME_TAKEN");
        }
        return Response.json(planHome({ id: created, name: "Plan C" }), {
          status: 201,
        });
      },
    });
    const router = renderApp(planPath("?modal=create-plan"));
    const dialog = await screen.findByRole("dialog", {
      name: "Create plan draft",
    });
    const name = await within(dialog).findByRole("textbox", {
      name: /Plan name/,
    });
    expect((name as HTMLInputElement).value).toBe("Plan C");
    await user.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    expect(
      await within(dialog).findByText("This name is already used"),
    ).toBeTruthy();
    await user.type(name, " ");
    expect(within(dialog).queryByText("This name is already used")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${ideaId}/plans/${created}`,
      ),
    );
    expect(
      sent(calls, "POST", `/api/v1/ideas/${ideaId}/plans`).map(
        ({ body }) => body,
      ),
    ).toEqual([{ name: "Plan C" }, { name: "Plan C " }]);
  });

  test("M5 says why when the decision is no longer Proceed; 20 reads it again behind M5, which stays until closed", async () => {
    const user = userEvent.setup();
    let decision: PlanHome["latestDecision"] = "proceed";
    const calls = planApi({
      read: () => planHome({ latestDecision: decision }),
      write: (call) => {
        if (call.path !== `/api/v1/ideas/${ideaId}/plans`) return undefined;
        // Hold recorded since 20 was read.
        decision = "hold";
        return apiError(409, "DECISION_NOT_PROCEED");
      },
    });
    renderApp(planPath("?modal=create-plan"));
    const dialog = await screen.findByRole("dialog", {
      name: "Create plan draft",
    });
    await within(dialog).findByRole("textbox", { name: /Plan name/ });
    const reads = sent(calls, "GET", api).length;
    await user.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    expect(
      await within(dialog).findByText(
        "The latest decision is no longer Proceed.",
      ),
    ).toBeTruthy();
    await waitFor(() =>
      expect(sent(calls, "GET", api).length).toBeGreaterThan(reads),
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByRole("dialog", { name: "Create plan draft" })).toBe(
      dialog,
    );
    expect(
      within(dialog).getByText("The latest decision is no longer Proceed."),
    ).toBeTruthy();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  /** P1's plans by these names, the first being 20's, none archived. */
  const named = (names: string[]): PlanSummary[] =>
    names.map((name, index) => ({
      id:
        index === 0
          ? planId
          : `3d6f0a2c-5b1e-4c8d-9a7f-${String(index).padStart(12, "0")}`,
      name,
      archived: false,
      latestVersion: null,
      hasChangesSinceVersion: false,
      latestGoNoGo: null,
    }));
  const alphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map(
    (letter) => `Plan ${letter}`,
  );

  test.each([
    ["the first letter left free between two", ["Plan A", "Plan C"], "Plan B"],
    ["AA once A to Z are used", alphabet, "Plan AA"],
    ["AB after AA", [...alphabet, "Plan AA"], "Plan AB"],
    // Plan A was renamed Main: its old name is free again.
    ["a renamed plan's old name", ["Main", "Plan B"], "Plan A"],
  ])("M5's name before it is typed is %s", async (_, names, expected) => {
    planApi({
      home: planHome({ name: names[0] }),
      ideaPlans: named(names),
    });
    renderApp(planPath("?modal=create-plan"));
    const dialog = await screen.findByRole("dialog", {
      name: "Create plan draft",
    });
    const name = await within(dialog).findByRole("textbox", {
      name: /Plan name/,
    });
    expect((name as HTMLInputElement).value).toBe(expected);
  });

  test("M5 with no published plan template says 6.0.6's words above Create draft, which can no longer be pressed", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.path === `/api/v1/ideas/${ideaId}/plans`
          ? apiError(409, "TEMPLATE_NOT_PUBLISHED")
          : undefined,
    });
    renderApp(planPath("?modal=create-plan"));
    const dialog = await screen.findByRole("dialog", {
      name: "Create plan draft",
    });
    const name = await within(dialog).findByRole("textbox", {
      name: /Plan name/,
    });
    const create = within(dialog).getByRole("button", { name: "Create draft" });
    await user.click(create);
    const words = await within(dialog).findByText(
      "Templates aren't ready yet. Ask your administrator.",
    );
    expect(
      words.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(create.hasAttribute("disabled")).toBe(true);
    // Another name does not make a template: Create draft stays off.
    await user.type(name, " 2");
    expect(create.hasAttribute("disabled")).toBe(true);
    await user.click(create);
    expect(sent(calls, "POST", `/api/v1/ideas/${ideaId}/plans`)).toHaveLength(
      1,
    );
  });

  test("Rename plan: a name in use says so; a new one is saved with the header's version", async () => {
    const user = userEvent.setup();
    let taken = true;
    const calls = planApi({
      write: (call) => {
        if (call.method !== "PATCH" || call.path !== api) return undefined;
        if (taken) {
          taken = false;
          return apiError(409, "NAME_TAKEN");
        }
        return Response.json(planHome({ name: "Plan Z", lockVersion: 5 }));
      },
    });
    renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "More for Plan A" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Rename plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename plan" });
    const name = within(dialog).getByRole("textbox", { name: /Plan name/ });
    await user.clear(name);
    await user.type(name, "Plan B");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(
      await within(dialog).findByText("This name is already used"),
    ).toBeTruthy();
    await user.clear(name);
    await user.type(name, "Plan Z");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull(),
    );
    expect(sent(calls, "PATCH", api).at(-1)?.body).toEqual({
      name: "Plan Z",
      lockVersion: 4,
    });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Plan Z" }),
    ).toBeTruthy();
  });

  /**
   * Opens Rename plan, lets `meanwhile` change the header the page reads, waits until the
   * page shows it (`shown`), and saves `typed`.
   */
  async function renameAfter(
    meanwhile: (home: PlanHome) => void,
    shown: () => boolean,
    typed: string,
    write: (call: Call) => Response | undefined,
  ) {
    const user = userEvent.setup();
    const home = planHome();
    const calls = planApi({ home, write });
    renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "More for Plan A" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "Rename plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename plan" });
    // The window's focus reads 20 again (TanStack Query's refetch on focus).
    meanwhile(home);
    try {
      readAgainOnFocus();
      await waitFor(() => expect(shown()).toBe(true));
    } finally {
      act(() => focusManager.setFocused(undefined));
    }
    const name = within(dialog).getByRole("textbox", { name: /Plan name/ });
    await user.clear(name);
    await user.type(name, typed);
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    return { user, calls };
  }

  test("Rename plan: someone else's header save since it opened asks; Overwrite sends the name alone", async () => {
    const paolo = { ...anaRef, id: crypto.randomUUID(), displayName: "Paolo" };
    let refused = false;
    const { user, calls } = await renameAfter(
      (home) =>
        Object.assign(home, {
          name: "Plan T",
          lockVersion: 5,
          updatedBy: paolo,
        }),
      () => document.querySelector("h1")?.textContent === "Plan T",
      "Plan Z",
      (call) => {
        if (call.method !== "PATCH" || call.path !== api) return undefined;
        if ((call.body as { force?: boolean }).force === true) {
          return Response.json(planHome({ name: "Plan Z", lockVersion: 6 }));
        }
        refused = true;
        return apiError(409, "CONFLICT", {
          current: {
            value: { name: "Plan T" },
            lockVersion: 5,
            updatedAt: new Date().toISOString(),
            updatedBy: paolo,
          },
        });
      },
    );
    await user.click(
      await screen.findByRole("button", { name: "Overwrite with mine" }),
    );
    expect(refused).toBe(true);
    expect(sent(calls, "PATCH", api).map(({ body }) => body)).toEqual([
      { name: "Plan Z", lockVersion: 4 },
      { name: "Plan Z", lockVersion: 4, force: true },
    ]);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull(),
    );
  });

  test("Rename plan: Load theirs closes and reads 20 again", async () => {
    const paolo = { ...anaRef, id: crypto.randomUUID(), displayName: "Paolo" };
    const { user, calls } = await renameAfter(
      (home) =>
        Object.assign(home, {
          name: "Plan T",
          lockVersion: 5,
          updatedBy: paolo,
        }),
      () => document.querySelector("h1")?.textContent === "Plan T",
      "Plan Y",
      (call) =>
        call.method === "PATCH" && call.path === api
          ? apiError(409, "CONFLICT", {
              current: {
                value: { name: "Plan T" },
                lockVersion: 5,
                updatedAt: new Date().toISOString(),
                updatedBy: paolo,
              },
            })
          : undefined,
    );
    const reads = calls.filter(
      ({ method, path }) => method === "GET" && path === api,
    ).length;
    await user.click(
      await screen.findByRole("button", { name: "Load theirs" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull(),
    );
    await waitFor(() =>
      expect(
        calls.filter(({ method, path }) => method === "GET" && path === api)
          .length,
      ).toBeGreaterThan(reads),
    );
  });

  test("Rename plan: the page's own header save while it is open does not ask", async () => {
    const { calls } = await renameAfter(
      (home) =>
        Object.assign(home, {
          businessName: "Health Bowl Co.",
          lockVersion: 5,
          updatedBy: anaRef,
        }),
      () =>
        [...document.querySelectorAll("input")].some(
          (input) => input.value === "Health Bowl Co.",
        ),
      "Plan Z",
      (call) =>
        call.method === "PATCH" && call.path === api
          ? Response.json(planHome({ name: "Plan Z", lockVersion: 6 }))
          : undefined,
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull(),
    );
    expect(sent(calls, "PATCH", api).map(({ body }) => body)).toEqual([
      { name: "Plan Z", lockVersion: 5 },
    ]);
  });

  test("Rename plan: Save waits for this page's header save on its way, then sends the version it left", async () => {
    const user = userEvent.setup();
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = planApi({
      write: (call) => {
        if (call.method !== "PATCH" || call.path !== api) return undefined;
        const body = call.body as { businessName?: string; name?: string };
        if (body.businessName !== undefined) {
          const businessName = body.businessName;
          return held.then(() =>
            Response.json(
              planHome({ businessName, lockVersion: 5, updatedBy: anaRef }),
            ),
          );
        }
        return Response.json(planHome({ name: body.name, lockVersion: 6 }));
      },
    });
    renderApp(planPath());
    await user.type(
      await screen.findByRole("textbox", { name: /Business Name/ }),
      " Co.",
    );
    // Pressing ⋯ leaves the field, which sends it at once.
    await user.click(screen.getByRole("button", { name: "More for Plan A" }));
    await user.click(screen.getByRole("menuitem", { name: "Rename plan" }));
    const dialog = await screen.findByRole("dialog", { name: "Rename plan" });
    const name = within(dialog).getByRole("textbox", { name: /Plan name/ });
    await user.clear(name);
    await user.type(name, "Plan Z");
    const save = within(dialog).getByRole("button", { name: "Save" });
    expect(save.hasAttribute("disabled")).toBe(true);
    act(() => release());
    await waitFor(() => expect(save.hasAttribute("disabled")).toBe(false));
    await user.click(save);
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull(),
    );
    expect(
      sent(calls, "PATCH", api)
        .map(({ body }) => body)
        .filter((body) => "name" in (body as object)),
    ).toEqual([{ name: "Plan Z", lockVersion: 5 }]);
  });

  test("Archive plan from ⋯", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.path === `${api}/archive` ? Response.json(plans[0]) : undefined,
    });
    renderApp(planPath());
    await user.click(
      await screen.findByRole("button", { name: "More for Plan A" }),
    );
    expect(
      screen
        .getByRole("menuitem", { name: "Export for AI" })
        .getAttribute("href"),
    ).toContain(
      `/w/${workspaceId}/ai/export?source=business_plan&id=${planId}`,
    );
    await user.click(screen.getByRole("menuitem", { name: "Archive plan" }));
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/archive`)).toHaveLength(1),
    );
  });
});

const modalTitles = {
  "save-version": "Save version",
  "go-no-go": "Record Go / No-Go",
  "create-plan": "Create plan draft",
} as const;

type User = ReturnType<typeof userEvent.setup>;

/**
 * How each of 20's dialogs that sends opens (by its button, as a person does) and sends,
 * and what its send answers when it goes through.
 */
const dialogs = {
  M3: {
    title: "Save version",
    open: async (user: User) => {
      await user.click(
        await screen.findByRole("button", { name: "Save version" }),
      );
    },
    send: (user: User, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole("button", { name: "Save version" })),
    method: "POST",
    path: `${api}/versions`,
    ok: (call: Call) =>
      Response.json(
        {
          id: "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a21",
          versionNumber: 2,
          name: (call.body as { name: string }).name,
          savedBy: anaRef,
          savedAt: "2026-10-22T02:00:00.000Z",
        },
        { status: 201 },
      ),
    done: "v2 saved",
  },
  M4: {
    title: "Record Go / No-Go",
    open: async (user: User) => {
      await user.click(
        await screen.findByRole("button", { name: "Record Go / No-Go" }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Record Go / No-Go",
      });
      await user.click(within(dialog).getByRole("radio", { name: "Delay" }));
      await user.type(
        within(dialog).getByRole("textbox", { name: /Why\?/ }),
        "Permits first.",
      );
    },
    send: (user: User, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole("button", { name: "Record" })),
    method: "POST",
    path: `${api}/go-no-go`,
    ok: () => Response.json({ entry: {}, stage: "planning" }, { status: 201 }),
    done: "Go / No-Go recorded",
  },
  M5: {
    title: "Create plan draft",
    open: async (user: User) => {
      await user.click(
        await screen.findByRole("button", { name: "Switch plan" }),
      );
      await user.click(
        within(screen.getByRole("menu")).getByRole("menuitem", {
          name: "Add plan",
        }),
      );
      const dialog = await screen.findByRole("dialog", {
        name: "Create plan draft",
      });
      await within(dialog).findByRole("textbox", { name: /Plan name/ });
    },
    send: (user: User, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole("button", { name: "Create draft" })),
    method: "POST",
    path: `/api/v1/ideas/${ideaId}/plans`,
    ok: () =>
      Response.json(
        planHome({
          id: "3d6f0a2c-5b1e-4c8d-9a7f-2e4b6c8d0a40",
          name: "Plan C",
        }),
        { status: 201 },
      ),
    done: null,
  },
  "Rename plan": {
    title: "Rename plan",
    open: async (user: User) => {
      await user.click(
        await screen.findByRole("button", { name: "More for Plan A" }),
      );
      await user.click(screen.getByRole("menuitem", { name: "Rename plan" }));
      const dialog = await screen.findByRole("dialog", { name: "Rename plan" });
      const name = within(dialog).getByRole("textbox", { name: /Plan name/ });
      await user.clear(name);
      await user.type(name, "Plan Z");
    },
    send: (user: User, dialog: HTMLElement) =>
      user.click(within(dialog).getByRole("button", { name: "Save" })),
    method: "PATCH",
    path: api,
    ok: () => Response.json(planHome({ name: "Plan Z", lockVersion: 5 })),
    done: null,
  },
} as const;

describe("20's modals of the URL and dialogs while they may not open (SDD 4章, design-spec 6.0.6)", () => {
  afterEach(cleanupThenRestoreFocus);

  test.each(["save-version", "go-no-go"] as const)(
    "%s's URL on a saved version: nothing opens, and once 20 is read the URL drops it in place, keeping the version",
    async (modal) => {
      planApi({
        version: planHome({ viewingVersion: planHome().latestVersion }),
      });
      const router = renderApp(
        planPath(`?version=${versionId}&modal=${modal}`),
      );
      await screen.findByText("Viewing v1 For advisors (read only)");
      await waitFor(() =>
        expect(router.state.location.search).toEqual({ version: versionId }),
      );
      expect(router.history.length).toBe(1);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  test.each(Object.entries(modalTitles))(
    "%s's URL on an archived plan: nothing opens and the URL drops it; Restore then opens nothing",
    async (modal, title) => {
      const user = userEvent.setup();
      let isArchived = true;
      planApi({
        read: () => planHome({ archived: isArchived }),
        write: (call) => {
          if (call.path !== `${api}/restore`) return undefined;
          isArchived = false;
          return Response.json({});
        },
      });
      const router = renderApp(planPath(`?modal=${modal}`));
      const restore = await screen.findByRole("button", { name: "Restore" });
      await waitFor(() => expect(router.state.location.search).toEqual({}));
      expect(router.history.length).toBe(1);
      await user.click(restore);
      // Read again as it is now: its tools are back, and no modal with them.
      await screen.findByRole("button", { name: "Record Go / No-Go" });
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(screen.queryByRole("dialog", { name: title })).toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  test.each(Object.entries(modalTitles))(
    "%s's URL while a cached read of 20 is read again: kept until that read answers, which then opens it",
    async (modal, title) => {
      let read: () => PlanHome | Promise<PlanHome> = () =>
        planHome({ archived: true });
      planApi({ read: () => read() });
      const router = renderApp(planPath());
      await screen.findByRole("button", { name: "Restore" });
      let release = () => {};
      const restored = new Promise<PlanHome>((resolve) => {
        release = () => resolve(planHome());
      });
      read = () => restored;
      readAgainOnFocus();
      await act(() => router.navigate({ href: planPath(`?modal=${modal}`) }));
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(router.state.location.search).toEqual({ modal });
      expect(screen.queryByRole("dialog")).toBeNull();
      release();
      expect(await screen.findByRole("dialog", { name: title })).toBeTruthy();
      expect(router.state.location.search).toEqual({ modal });
    },
  );

  test.each(Object.keys(dialogs) as (keyof typeof dialogs)[])(
    "%s opened, then 20 read again as archived: it stays until closed, and its send says why in it",
    async (key) => {
      const { title, open, send, method, path } = dialogs[key];
      const user = userEvent.setup();
      let isArchived = false;
      planApi({
        read: () => planHome({ archived: isArchived }),
        write: (call) =>
          call.method === method && call.path === path
            ? apiError(409, "ARCHIVED")
            : undefined,
      });
      renderApp(planPath());
      await open(user);
      const dialog = await screen.findByRole("dialog", { name: title });
      isArchived = true;
      readAgainOnFocus();
      await screen.findByText("This plan is archived");
      expect(screen.getByRole("dialog", { name: title })).toBe(dialog);
      await send(user, dialog);
      expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
      expect(within(dialog).getByText("It's archived")).toBeTruthy();
      await user.keyboard("{Escape}");
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: title })).toBeNull(),
      );
    },
  );

  test("M4 opened, then archived: its Save a version still opens M3, and closing M3 opens M4 again with its choice", async () => {
    const user = userEvent.setup();
    let isArchived = false;
    planApi({ read: () => planHome({ archived: isArchived }) });
    const router = renderApp(planPath());
    await dialogs.M4.open(user);
    const goNoGo = screen.getByRole("dialog", { name: "Record Go / No-Go" });
    isArchived = true;
    readAgainOnFocus();
    await screen.findByText("This plan is archived");
    await user.click(
      await within(goNoGo).findByRole("link", { name: "Save a version" }),
    );
    const save = await screen.findByRole("dialog", { name: "Save version" });
    expect(router.state.location.search).toEqual({ modal: "save-version" });
    await user.click(within(save).getByRole("button", { name: "Cancel" }));
    const again = await screen.findByRole("dialog", {
      name: "Record Go / No-Go",
    });
    expect(router.state.location.search).toEqual({ modal: "go-no-go" });
    expect(
      (within(again).getByRole("radio", { name: "Delay" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });
});

describe("a send of 20's dialogs that fails once Back closed it (design-spec 6.0.6「送っている間に閉じた送信の失敗」)", () => {
  const failures = {
    "a failure that may pass": {
      fail: (): Response => {
        throw new TypeError("Failed to fetch");
      },
      toast: "Couldn't save",
      retries: true,
    },
    "refused as archived": {
      fail: () => apiError(409, "ARCHIVED"),
      toast: "Couldn't save. It's archived.",
      retries: false,
    },
    unexpected: {
      fail: () => apiError(500, "INTERNAL"),
      toast: "Something went wrong. Ref: 8f14e45f",
      retries: true,
    },
  } as const;

  test.each(
    (Object.keys(dialogs) as (keyof typeof dialogs)[]).flatMap((key) =>
      (Object.keys(failures) as (keyof typeof failures)[]).map(
        (failure) => [key, failure] as const,
      ),
    ),
  )(
    "%s, %s: a toast says so, and its Retry (where it may pass) sends the same again",
    async (key, failure) => {
      vi.spyOn(sentry, "reportError").mockReturnValue(null);
      const { title, open, send, method, path, ok, done } = dialogs[key];
      const { fail, toast, retries } = failures[failure];
      const user = userEvent.setup();
      let release = () => {};
      const sends: Call[] = [];
      const calls = planApi({
        write: (call) => {
          if (call.method !== method || call.path !== path) return undefined;
          sends.push(call);
          if (sends.length > 1) return ok(call);
          return new Promise<Response>((resolve, reject) => {
            release = () => {
              try {
                resolve(fail());
              } catch (error) {
                reject(error);
              }
            };
          });
        },
      });
      // From 13, so that Back from Rename plan, which has no entry of its own, leaves 20.
      const router = renderApp(`/w/${workspaceId}/ideas/${ideaId}`);
      await screen.findByRole("heading", { level: 1 });
      await act(() => router.navigate({ href: planPath() }));
      await open(user);
      const dialog = await screen.findByRole("dialog", { name: title });
      await send(user, dialog);
      await waitFor(() => expect(sends).toHaveLength(1));
      act(() => router.history.back());
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: title })).toBeNull(),
      );
      const reads = calls.filter((call) => call.method === "GET").length;
      const shown = await toastAfter(toast, async () => {
        act(release);
      });
      const retry = within(shown).queryByRole("button", { name: "Retry" });
      if (!retries) {
        expect(retry).toBeNull();
        await waitFor(() =>
          expect(
            calls.filter((call) => call.method === "GET").length,
          ).toBeGreaterThan(reads),
        );
        return;
      }
      expect(retry).not.toBeNull();
      await user.click(retry as HTMLElement);
      await waitFor(() => expect(sends).toHaveLength(2));
      expect(sends[1]?.body).toEqual(sends[0]?.body);
      if (done !== null) {
        expect((await screen.findAllByText(done)).length).toBeGreaterThan(0);
      }
      expect(screen.queryByRole("dialog", { name: title })).toBeNull();
    },
  );
});

describe("what 20's M5 and Rename plan say and do once closed while they send (design-spec 6.0.6「送っている間に閉じた送信の失敗」)", () => {
  const savedVersion = planHome({ viewingVersion: planHome().latestVersion });
  const plansPath = `/api/v1/ideas/${ideaId}/plans`;
  const paolo = { ...anaRef, id: crypto.randomUUID(), displayName: "Paolo" };

  /**
   * 20's API whose `method` `path` send is held until the test answers it (`answer`). These
   * tests expect no second one (no Retry): it would fail unexpectedly.
   */
  function heldApi(method: string, path: string) {
    let release: (answer: () => Response) => void = () => {};
    const sends: Call[] = [];
    const calls = planApi({
      version: savedVersion,
      write: (call) => {
        if (call.method !== method || call.path !== path) return undefined;
        sends.push(call);
        if (sends.length > 1) return apiError(500, "INTERNAL");
        return new Promise<Response>((resolve) => {
          release = (answer) => resolve(answer());
        });
      },
    });
    return {
      calls,
      sends,
      answer: (response: () => Response) => act(() => release(response)),
    };
  }

  /** The reads of 20 (P2 GET): the plan as it is now, and the saved version. */
  const planReads = (calls: Call[]) =>
    calls.filter(
      ({ method, path }) =>
        method === "GET" &&
        (path === api || path === `${api}?versionId=${versionId}`),
    ).length;

  /** Opens M5 from the plan switch, presses Create draft with P1 POST held, then Back. */
  async function backFromM5(user: User) {
    const held = heldApi("POST", plansPath);
    const router = renderApp(planPath());
    await dialogs.M5.open(user);
    const dialog = screen.getByRole("dialog", { name: "Create plan draft" });
    await dialogs.M5.send(user, dialog);
    await waitFor(() => expect(held.sends).toHaveLength(1));
    act(() => router.history.back());
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Create plan draft" }),
      ).toBeNull(),
    );
    return { ...held, router };
  }

  test("M5's Create draft that goes through after Back makes the draft and reads 20 again, but does not open the new plan's 20", async () => {
    const user = userEvent.setup();
    const { calls, router, answer } = await backFromM5(user);
    const reads = planReads(calls);
    answer(dialogs.M5.ok);
    await waitFor(() => expect(planReads(calls)).toBeGreaterThan(reads));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(router.state.location.pathname).toBe(planPath());
    expect(router.state.location.search).toEqual({});
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test.each([
    ["a name in use", "NAME_TAKEN", "This name is already used", false],
    [
      "a decision no longer Proceed",
      "DECISION_NOT_PROCEED",
      "The latest decision is no longer Proceed.",
      true,
    ],
    [
      "no published plan template",
      "TEMPLATE_NOT_PUBLISHED",
      "Templates aren't ready yet. Ask your administrator.",
      false,
    ],
  ] as const)(
    "M5 closed by Back while Create draft is on its way, then %s: M5's words alone, without Retry",
    async (_, code, words, readsAgain) => {
      const user = userEvent.setup();
      const { calls, sends, answer } = await backFromM5(user);
      const reads = planReads(calls);
      const toast = await toastAfter(words, async () =>
        answer(() => apiError(409, code)),
      );
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      if (readsAgain) {
        await waitFor(() => expect(planReads(calls)).toBeGreaterThan(reads));
      }
      expect(sends).toHaveLength(1);
    },
  );

  test("Rename plan closes when Back opens the saved version 20 came from, and Forward to the latest does not open it again", async () => {
    const user = userEvent.setup();
    planApi({ version: savedVersion });
    const router = renderApp(planPath(`?version=${versionId}`));
    await screen.findByText("Viewing v1 For advisors (read only)");
    await act(() => router.navigate({ href: planPath() }));
    await dialogs["Rename plan"].open(user);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ version: versionId }),
    );
    await screen.findByText("Viewing v1 For advisors (read only)");
    expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull();
    act(() => router.history.forward());
    await screen.findByRole("button", { name: "More for Plan A" });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByRole("dialog", { name: "Rename plan" })).toBeNull();
  });

  test.each([
    [
      "a name in use",
      () => apiError(409, "NAME_TAKEN"),
      "This name is already used",
      false,
    ],
    [
      "someone else's header saved first",
      () =>
        apiError(409, "CONFLICT", {
          current: {
            value: { name: "Plan T" },
            lockVersion: 5,
            updatedAt: new Date().toISOString(),
            updatedBy: paolo,
          },
        }),
      // The title of the question Rename plan would have asked (ConflictAlert).
      "Paolo updated this plan header just now",
      true,
    ],
  ] as const)(
    "Rename plan's Save on its way when Back opens the saved version, then %s: those words alone, without Retry",
    async (_, fail, words, readsAgain) => {
      const user = userEvent.setup();
      const { calls, sends, answer } = heldApi("PATCH", api);
      const router = renderApp(planPath(`?version=${versionId}`));
      await screen.findByText("Viewing v1 For advisors (read only)");
      await act(() => router.navigate({ href: planPath() }));
      await dialogs["Rename plan"].open(user);
      await dialogs["Rename plan"].send(
        user,
        screen.getByRole("dialog", { name: "Rename plan" }),
      );
      await waitFor(() => expect(sends).toHaveLength(1));
      act(() => router.history.back());
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Rename plan" }),
        ).toBeNull(),
      );
      const reads = planReads(calls);
      const toast = await toastAfter(words, async () => answer(fail));
      expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
      if (readsAgain) {
        await waitFor(() => expect(planReads(calls)).toBeGreaterThan(reads));
      }
      expect(sends).toHaveLength(1);
      expect(router.state.location.search).toEqual({ version: versionId });
    },
  );
});

describe("20's panels", () => {
  const batchId = "b0000000-0000-4000-8000-000000000021";
  const draftRows: HistoryEntry[] = [
    {
      id: "a0000000-0000-4000-8000-000000000021",
      batchId,
      target: { type: "plan_answer", id: planId, key: "P.13.1" },
      label: "13 Ownership and capital",
      action: "create",
      source: "plan_draft",
      before: null,
      after: {
        text: null,
        rows: [{ name: "Ana", initial_ownership: 0.6, initial_capital: 50000 }],
      },
      changedBy: anaRef,
      changedAt: "2026-10-22T02:00:00.000Z",
      revertible: true,
    },
  ];

  test("the history words a table's rows by its columns; the draft's first row deletes it and opens 13", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      home: planHome({ draftOnly: true }),
      history: draftRows,
      write: (call) =>
        call.path === `/api/v1/history/batches/${batchId}/revert`
          ? Response.json({ reverted: 30, batchId })
          : undefined,
    });
    const router = renderApp(planPath());
    await user.click(await screen.findByRole("button", { name: "History" }));
    const panel = await waitFor(
      () =>
        screen.queryByRole("complementary", { name: "History" }) ??
        screen.getByRole("dialog", { name: "History" }),
    );
    expect(
      await within(panel).findByText(
        "Name: Ana · Initial ownership (%): 60% · Initial capital contribution: ₱50,000",
      ),
    ).toBeTruthy();
    expect(within(panel).getByText("Plan draft · Added")).toBeTruthy();
    expect(calls.some(({ path }) => path.startsWith(`${api}/items/13`))).toBe(
      true,
    );
    await user.click(
      within(panel).getByRole("button", { name: /^Undo the whole operation/ }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Delete this plan draft?",
    });
    await user.click(within(ask).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${ideaId}`,
      ),
    );
  });

  test("the header's list names each thread's item as C1 does: a sub-item, an execution item, the idea", async () => {
    const user = userEvent.setup();
    const comment = (
      id: string,
      target: object,
      body: string,
      label: string,
    ) => ({
      root: {
        id,
        workspace: { id: workspaceId, name: "BCDX" },
        target,
        parentId: null,
        author: anaRef,
        body,
        mentions: [],
        resolvedAt: null,
        resolvedBy: null,
        editedAt: null,
        deleted: false,
        createdAt: "2026-10-20T02:00:00.000Z",
      },
      replies: [],
      label,
    });
    const calls = planApi({
      threads: [
        comment(
          "c0000000-0000-4000-8000-000000000001",
          { type: "plan_answer", id: planId, key: "P.01.1" },
          "Shorter, please.",
          "01 What is the business?",
        ),
        comment(
          "c0000000-0000-4000-8000-000000000002",
          {
            type: "execution_item",
            id: "5e0c0000-0000-4000-8000-000000000001",
            key: null,
          },
          "Who owns this?",
          "Execution · Business decision",
        ),
        comment(
          "c0000000-0000-4000-8000-000000000003",
          { type: "idea", id: ideaId, key: null },
          "Nice.",
          ideaHome.idea.name,
        ),
      ],
    });
    renderApp(planPath());
    await user.click(await screen.findByRole("button", { name: /^Comments/ }));
    const panel = await waitFor(
      () =>
        screen.queryByRole("complementary", { name: "Comments" }) ??
        screen.getByRole("dialog", { name: "Comments" }),
    );
    expect(
      await within(panel).findByText("01 What is the business?"),
    ).toBeTruthy();
    expect(
      await within(panel).findByText("Execution · Business decision"),
    ).toBeTruthy();
    expect(within(panel).getByText(ideaHome.idea.name)).toBeTruthy();
    expect(
      within(panel).getByRole("textbox", {
        name: `Comment on ${ideaHome.idea.name}`,
      }),
    ).toBeTruthy();
    // One read for the names: no item (P4) nor the execution items (P9) for them.
    expect(
      calls.some(
        ({ method, path }) =>
          method === "GET" &&
          (path.includes("/items/") || path.includes("/execution-items")),
      ),
    ).toBe(false);
  });
});
