import type { HistoryEntry, Me, PlanHome, Role } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
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
 * The API of 20: `home` answers P2 GET (a version's when asked), `write` the writes,
 * `history` H1 and `threads` C1.
 */
function planApi({
  me = ana,
  home = planHome(),
  version,
  ideaArchived = false,
  history = [],
  threads = [],
  write = (_call: Call): Response | Promise<Response> | undefined => undefined,
}: {
  me?: Me;
  home?: PlanHome;
  version?: PlanHome;
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
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
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
      return Response.json({ items: plans });
    }
    if (method === "GET" && path === api) return Response.json(current);
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

  test("M5 says why when the decision is no longer Proceed", async () => {
    const user = userEvent.setup();
    const calls = planApi({
      write: (call) =>
        call.path === `/api/v1/ideas/${ideaId}/plans`
          ? apiError(409, "DECISION_NOT_PROCEED")
          : undefined,
    });
    renderApp(planPath("?modal=create-plan"));
    const dialog = await screen.findByRole("dialog", {
      name: "Create plan draft",
    });
    await within(dialog).findByRole("textbox", { name: /Plan name/ });
    await user.click(
      within(dialog).getByRole("button", { name: "Create draft" }),
    );
    expect(
      await within(dialog).findByText(
        "The latest decision is no longer Proceed.",
      ),
    ).toBeTruthy();
    // The screen reads the decision again only once M5 closes: read now, it would take
    // M5 and its reason away.
    const reads = calls.filter(({ path }) => path === api).length;
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.getByText("The latest decision is no longer Proceed."),
    ).toBeTruthy();
    expect(calls.filter(({ path }) => path === api)).toHaveLength(reads);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(calls.filter(({ path }) => path === api).length).toBeGreaterThan(
        reads,
      ),
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

  test("the header's list names each thread's item: a sub-item, an execution item, the idea", async () => {
    const user = userEvent.setup();
    const comment = (id: string, target: object, body: string) => ({
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
    });
    planApi({
      threads: [
        comment(
          "c0000000-0000-4000-8000-000000000001",
          { type: "plan_answer", id: planId, key: "P.01.1" },
          "Shorter, please.",
        ),
        comment(
          "c0000000-0000-4000-8000-000000000002",
          {
            type: "execution_item",
            id: "5e0c0000-0000-4000-8000-000000000001",
            key: null,
          },
          "Who owns this?",
        ),
        comment(
          "c0000000-0000-4000-8000-000000000003",
          { type: "idea", id: ideaId, key: null },
          "Nice.",
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
  });
});
