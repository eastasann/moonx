import type { ExecutionItem, HistoryEntry, Me, Role } from "@moonx/schemas";
import { focusManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { SLOW_LOADING_MS } from "../components/states";
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
  anaRef,
  executionItem,
  ideaId,
  planHome,
  planId,
  planPath,
} from "../test/plans";
import { home as ideaHome } from "../test/validation";

// 22 Execution (design-spec 6.13, SDD 5.9 P9–P11).

afterEach(() => {
  vi.unstubAllGlobals();
});

const api = `/api/v1/plans/${planId}`;
const base = `/w/${workspaceId}/ideas/${ideaId}/plans/${planId}/execution`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const kenji = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950f",
  displayName: "Kenji Reyes",
  avatarUrl: null,
  badge: null,
};

const decision = executionItem(
  "milestone",
  "5e0c0000-0000-4000-8000-000000000001",
  "Business decision",
  { goal: "Decide to go", sortOrder: 0, fromPreset: true },
);
const setup = executionItem(
  "milestone",
  "5e0c0000-0000-4000-8000-000000000002",
  "Legal / company setup",
  { dueDate: "2026-09-30", overdue: true, sortOrder: 1, commentCount: 2 },
);
const before30 = executionItem(
  "launch",
  "5e0c0000-0000-4000-8000-000000000011",
  "30 days before launch",
  { launchTiming: "t_minus_30", sortOrder: 0 },
);
const flyers = executionItem(
  "launch",
  "5e0c0000-0000-4000-8000-000000000012",
  "Print flyers",
  { launchTiming: "t_minus_30", sortOrder: 1 },
);
const opening = executionItem(
  "launch",
  "5e0c0000-0000-4000-8000-000000000013",
  "Launch day",
  { launchTiming: "launch_day", sortOrder: 2 },
);
const revenue = executionItem(
  "kpi",
  "5e0c0000-0000-4000-8000-000000000021",
  "Revenue",
  { kpiArea: "Financial", kpiTarget: "₱150,000 / month", sortOrder: 0 },
);
const repeat = executionItem(
  "kpi",
  "5e0c0000-0000-4000-8000-000000000022",
  "Repeat Rate",
  { kpiArea: "Customer", sortOrder: 1 },
);
const quote = executionItem(
  "next_action",
  "5e0c0000-0000-4000-8000-000000000031",
  "Get supplier quote",
  {
    dueDate: "2026-10-13",
    overdue: true,
    assignee: { user: kenji },
  },
);
const venue = executionItem(
  "next_action",
  "5e0c0000-0000-4000-8000-000000000032",
  "Book venue",
  { dueDate: "2026-10-30", status: "doing", assignee: { user: anaRef } },
);

const everything = () => [
  decision,
  setup,
  before30,
  flyers,
  opening,
  revenue,
  repeat,
  quote,
  venue,
];

/** The API of 22: the plan, its items, and what saves them. */
function executionApi({
  me = ana,
  items = everything(),
  archived = false,
  ideaArchived = false,
  patch,
  create,
  remove,
  history = [],
  members = true,
  holdReads,
}: {
  /** A function is asked at each call: the user may change behind the screen. */
  me?: Me | (() => Me);
  items?: ExecutionItem[];
  /** A function is asked at each call: the plan may be archived behind the screen. */
  archived?: boolean | (() => boolean);
  ideaArchived?: boolean;
  /** Answers P10 PATCH instead of keeping what it sends. */
  patch?: () => Response;
  /** Answers P9 POST; undefined makes the item and keeps it. */
  create?: () => Response | undefined;
  /** Answers P10 DELETE; undefined deletes. */
  remove?: () => Response | undefined;
  history?: HistoryEntry[];
  /** Whether W2 answers; else it never does. */
  members?: boolean;
  /** While it returns true, every read waits for good: the screen is not read again. */
  holdReads?: () => boolean;
} = {}) {
  const meNow = () => (typeof me === "function" ? me() : me);
  const archivedNow = () =>
    typeof archived === "function" ? archived() : archived;
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && holdReads?.() === true) {
      return new Promise<Response>(() => {});
    }
    if (method === "GET" && path === "/api/v1/me")
      return Response.json(meNow());
    if (method === "PATCH" && path === "/api/v1/me") {
      return Response.json(meNow());
    }
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return Response.json({
        ...ideaHome,
        idea: { ...ideaHome.idea, archived: ideaArchived },
      });
    }
    if (method === "GET" && path === api) {
      return Response.json(planHome({ archived: archivedNow(), ideaArchived }));
    }
    if (method === "GET" && path === `${api}/execution-items`) {
      return Response.json({ items });
    }
    if (method === "POST" && path === `${api}/execution-items`) {
      const answered = create?.();
      if (answered !== undefined) return answered;
      const body = call.body as Partial<ExecutionItem> & {
        type: ExecutionItem["type"];
        title: string;
      };
      const made = executionItem(
        body.type,
        "5e0c0000-0000-4000-8000-000000000099",
        body.title,
        { ...body, sortOrder: items.length },
      );
      items.push(made);
      return Response.json(made, { status: 201 });
    }
    if (method === "PUT" && path === `${api}/execution-items/order`) {
      return new Response(null, { status: 204 });
    }
    const one = path.match(/^\/api\/v1\/execution-items\/([\w-]+)$/);
    if (one !== null && method === "PATCH") {
      if (patch !== undefined) return patch();
      const found = items.find(({ id }) => id === one[1]);
      const body = call.body as Record<string, unknown> & {
        lockVersion: number;
      };
      return found === undefined
        ? undefined
        : Response.json({
            ...found,
            ...body,
            lockVersion: body.lockVersion + 1,
          });
    }
    if (one !== null && method === "DELETE") {
      const refused = remove?.();
      if (refused !== undefined) return refused;
      const index = items.findIndex(({ id }) => id === one[1]);
      if (index === -1) return undefined;
      items.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${workspaceId}/members`
    ) {
      if (!members) return new Promise<Response>(() => {});
      return Response.json({
        items: [anaRef, kenji].map((user, index) => ({
          user,
          email: null,
          role: index === 0 ? "owner" : "member",
          joinedAt: "2026-01-01T00:00:00.000Z",
          isPersonalOwner: false,
        })),
      });
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads: [], unresolvedCount: 0 });
    }
    if (method === "GET" && path.startsWith("/api/v1/history?")) {
      return Response.json({ items: history, nextCursor: null });
    }
    return undefined;
  });
}

const sent = (calls: Call[], method: string, path: string) =>
  calls.filter((call) => call.method === method && call.path === path);

describe("22 Execution (design-spec 6.13)", () => {
  test("opens on Milestones, the first beside the list, its fields saved as typed (P10)", async () => {
    const user = userEvent.setup();
    const calls = executionApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Execution" }),
    ).toBeTruthy();
    const tabs = await screen.findByRole("tablist", {
      name: "Execution lists",
    });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((tab) => tab.textContent),
    ).toEqual([
      "Milestones",
      "Launch",
      "KPIs",
      "Open Questions",
      "Next Actions",
    ]);
    const list = await screen.findByRole("grid", { name: "Milestones" });
    expect(within(list).getAllByRole("row")).toHaveLength(2);
    const overdue = within(list).getByRole("row", {
      name: /Legal \/ company setup/,
    });
    expect(within(overdue).getByText("Overdue")).toBeTruthy();
    expect(overdue.textContent).toContain("2 comments");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Business decision",
      }),
    ).toBeTruthy();
    await user.type(
      screen.getByRole("textbox", { name: "Exit Condition" }),
      "Agreed",
    );
    await waitFor(
      () =>
        expect(
          sent(calls, "PATCH", `/api/v1/execution-items/${decision.id}`)[0]
            ?.body,
        ).toEqual({ exitCondition: "Agreed", lockVersion: 1 }),
      { timeout: 3000 },
    );
  });

  test("Launch under its phases and KPIs under their Areas", async () => {
    executionApi();
    renderApp(`${base}?tab=launch`);
    expect(
      await screen.findByRole("grid", {
        name: "Launch · T−30",
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("grid", { name: "Launch · Launch day" }),
    ).toBeTruthy();
    cleanup();
    renderApp(`${base}?tab=kpis`);
    const financial = await screen.findByRole("grid", {
      name: "KPIs · Financial",
    });
    expect(financial.textContent).toContain("Target: ₱150,000 / month");
    expect(screen.getByRole("grid", { name: "KPIs · Customer" })).toBeTruthy();
  });

  test("a link with the item alone opens its tab and shows it (8, 5's Recent activity)", async () => {
    executionApi();
    renderApp(`${base}?item=${venue.id}`);
    expect(
      await screen.findByRole("heading", { level: 2, name: "Book venue" }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Next Actions" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  test("after such a link, the filters keep its tab; Overdue only lets go of the item", async () => {
    const user = userEvent.setup();
    executionApi();
    const router = renderApp(`${base}?item=${venue.id}`);
    await screen.findByRole("heading", { level: 2, name: "Book venue" });
    const filters = screen.getByRole("tabpanel");
    await user.click(within(filters).getByRole("button", { name: /Assignee/ }));
    await user.click(await screen.findByRole("option", { name: "Me" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        tab: "actions",
        assignee: "me",
      }),
    );
    expect(
      screen
        .getByRole("tab", { name: "Next Actions" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    // Overdue only lets go of the item shown, as the other filters do: Book venue is not
    // overdue.
    await user.click(
      within(screen.getByRole("tabpanel")).getByRole("button", {
        name: /Assignee/,
      }),
    );
    await user.click(await screen.findByRole("option", { name: "All" }));
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("assignee"),
    );
    await user.click(
      within(
        await screen.findByRole("grid", { name: "Next Actions" }),
      ).getByRole("row", { name: /Book venue/ }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ item: venue.id }),
    );
    await user.click(screen.getByRole("switch", { name: "Overdue only" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "actions" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Get supplier quote",
      }),
    ).toBeTruthy();
  });

  test("after such a link, a read without the item (deleted meanwhile) stays on its tab", async () => {
    const items = everything();
    executionApi({ items });
    const router = renderApp(`${base}?item=${venue.id}`);
    await screen.findByRole("heading", { level: 2, name: "Book venue" });
    items.splice(items.indexOf(venue), 1);
    // The window's focus reads the list again (TanStack Query's refetch on focus).
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(
      await screen.findByRole("heading", { level: 2, name: /Not found/ }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("tab", { name: "Next Actions" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    // The URL is left as the link wrote it.
    expect(router.state.location.search).toEqual({ item: venue.id });
    act(() => focusManager.setFocused(undefined));
  });

  test("an item of another tab named by the URL is Not found beside the list", async () => {
    executionApi();
    renderApp(`${base}?tab=milestones&item=${venue.id}`);
    expect(
      await screen.findByRole("heading", { level: 2, name: /Not found/ }),
    ).toBeTruthy();
  });

  test("Next Actions by due date, filtered by assignee, status and Overdue only", async () => {
    const user = userEvent.setup();
    executionApi();
    const router = renderApp(`${base}?tab=actions`);
    const list = await screen.findByRole("grid", { name: "Next Actions" });
    expect(
      within(list)
        .getAllByRole("row")
        .map((row) => row.textContent?.split(/To do|Doing/)[0]),
    ).toEqual(["Get supplier quote", "Book venue"]);
    // Next Actions keep their due-date order: no Reorder.
    await user.click(
      within(list).getByRole("button", { name: "More for Book venue" }),
    );
    expect(
      await screen.findByRole("menuitem", { name: "Delete" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitem", { name: "Reorder" })).toBeNull();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("switch", { name: "Overdue only" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("grid", { name: "Next Actions" })).getAllByRole(
          "row",
        ),
      ).toHaveLength(1),
    );
    // Overdue only is not in the URL (6.13).
    expect(router.state.location.search).toEqual({ tab: "actions" });
    await user.click(screen.getByRole("switch", { name: "Overdue only" }));

    const filters = screen.getByRole("tabpanel");
    await user.click(within(filters).getByRole("button", { name: /Assignee/ }));
    await user.click(await screen.findByRole("option", { name: "Me" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        tab: "actions",
        assignee: "me",
      }),
    );
    const mine = await screen.findByRole("grid", { name: "Next Actions" });
    await waitFor(() =>
      expect(within(mine).getAllByRole("row")).toHaveLength(1),
    );
    expect(mine.textContent).toContain("Book venue");

    await user.click(within(filters).getByRole("button", { name: /Status/ }));
    await user.click(await screen.findByRole("option", { name: "Done" }));
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "actions" }),
    );
  });

  test("Assignee lists the names typed on Next Actions once, and filters by one", async () => {
    const user = userEvent.setup();
    const typed = (id: string, title: string, name: string) =>
      executionItem("next_action", id, title, {
        dueDate: "2026-10-20",
        assignee: { name },
      });
    const items = [
      ...everything(),
      typed("5e0c0000-0000-4000-8000-000000000033", "Call Lito", "Lito"),
      typed("5e0c0000-0000-4000-8000-000000000034", "Pay Lito", "lito"),
      typed("5e0c0000-0000-4000-8000-000000000035", "Ask Mara", "Mara"),
    ];
    executionApi({ items });
    const router = renderApp(`${base}?tab=actions`);
    await screen.findByRole("grid", { name: "Next Actions" });
    await user.click(
      within(screen.getByRole("tabpanel")).getByRole("button", {
        name: /Assignee/,
      }),
    );
    const listbox = await screen.findByRole("listbox");
    expect(
      within(listbox)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["All", "Me", anaRef.displayName, "Kenji Reyes", "Lito", "Mara"]);
    await user.click(within(listbox).getByRole("option", { name: "Lito" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "actions",
        assigneeName: "Lito",
      }),
    );
    const list = await screen.findByRole("grid", { name: "Next Actions" });
    await waitFor(() =>
      expect(
        within(list)
          .getAllByRole("row")
          .map((row) => row.textContent?.split(/To do/)[0]),
      ).toEqual(["Call Lito", "Pay Lito"]),
    );
  });

  test("a typed name in the URL stays chosen once no Next Action has it", async () => {
    executionApi();
    renderApp(`${base}?tab=actions&assigneeName=Nora`);
    const filters = await screen.findByRole("tabpanel");
    await waitFor(() =>
      expect(
        within(filters).getByRole("button", { name: /Assignee/ }).textContent,
      ).toContain("Nora"),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
  });

  test("a save the API refused says so in the list's row too, with Retry (6.0.2)", async () => {
    const user = userEvent.setup();
    executionApi({ patch: () => apiError(409, "ARCHIVED") });
    renderApp(base);
    await screen.findByRole("heading", {
      level: 2,
      name: "Business decision",
    });
    await user.type(screen.getByRole("textbox", { name: "Goal" }), "!");
    const list = screen.getByRole("grid", { name: "Milestones" });
    const row = within(list).getByRole("row", { name: /Business decision/ });
    await waitFor(() => expect(row.textContent).toContain("Couldn't save"));
    expect(row.textContent).toContain("It's archived");
    expect(within(row).getByRole("button", { name: "Retry" })).toBeTruthy();
  });

  test("a change whose assignee's name takes over 10 seconds: Taking longer than usual in the list's place", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      executionApi({
        members: false,
        history: [
          {
            id: "a0000000-0000-4000-8000-000000000031",
            batchId: null,
            target: { type: "execution_item", id: decision.id, key: null },
            label: "Execution · Business decision",
            action: "update",
            source: "manual",
            before: { assigneeUserId: null },
            after: { assigneeUserId: kenji.id },
            changedBy: anaRef,
            changedAt: "2026-10-01T02:00:00.000Z",
            revertible: true,
          },
        ],
      });
      renderApp(
        `${base}?panel=history&target=container:business_plan:${planId}:execution`,
      );
      const panel = await screen.findByRole("complementary", {
        name: "History",
      });
      await within(panel).findAllByText("Execution · Business decision");
      act(() => vi.advanceTimersByTime(SLOW_LOADING_MS));
      expect(
        await within(panel).findByRole("heading", {
          name: "Taking longer than usual",
        }),
      ).toBeTruthy();
      expect(within(panel).getByRole("button", { name: "Retry" })).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  test("+ Add makes an item of the tab and shows it beside the list", async () => {
    const user = userEvent.setup();
    const calls = executionApi();
    const router = renderApp(`${base}?tab=questions`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Write down what you still need to find out, and why it matters.",
      }),
    ).toBeTruthy();
    await user.click(
      screen.getAllByRole("button", {
        name: "Add open question",
      })[0] as Element,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "New open question",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Open Question/ }),
      "Is the plaza busy on Sundays?",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    await waitFor(() =>
      expect(sent(calls, "POST", `${api}/execution-items`)[0]?.body).toEqual({
        type: "open_question",
        title: "Is the plaza busy on Sundays?",
        status: "open",
      }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Is the plaza busy on Sundays?",
      }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({
      tab: "questions",
      item: "5e0c0000-0000-4000-8000-000000000099",
    });
  });

  test("Reorder moves a launch step within its phase and sends the whole type (P11)", async () => {
    const user = userEvent.setup();
    const calls = executionApi();
    renderApp(`${base}?tab=launch`);
    const phase = await screen.findByRole("grid", {
      name: "Launch · T−30",
    });
    await user.click(
      within(phase).getByRole("button", { name: "More for Print flyers" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder launch steps",
    });
    // Only the phase's rows.
    expect(within(dialog).queryByText("Launch day")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Move Print flyers up" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(
        sent(calls, "PUT", `${api}/execution-items/order`)[0]?.body,
      ).toEqual({
        type: "launch",
        ids: [flyers.id, before30.id, opening.id],
      }),
    );
  });

  test("Delete asks first, then the item leaves the list and its detail", async () => {
    const user = userEvent.setup();
    const calls = executionApi();
    const router = renderApp(`${base}?item=${setup.id}`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Legal / company setup",
      }),
    ).toBeTruthy();
    const detailMenu = screen.getAllByRole("button", {
      name: "More for Legal / company setup",
    });
    await user.click(detailMenu.at(-1) as Element);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this milestone?",
    });
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        sent(calls, "DELETE", `/api/v1/execution-items/${setup.id}`),
      ).toHaveLength(1),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("grid", { name: "Milestones" })).getAllByRole(
          "row",
        ),
      ).toHaveLength(1),
    );
    expect(router.state.location.search).not.toHaveProperty("item", setup.id);
  });

  test("a Viewer reads: no + Add, no ⋯ to change, the fields as text", async () => {
    executionApi({ me: as("viewer") });
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Business decision",
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Goal" })).toBeNull();
    expect(screen.getByText("Decide to go")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  test("an archived plan says so and reads only", async () => {
    executionApi({ archived: true });
    renderApp(base);
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    await screen.findByRole("heading", { level: 2, name: "Business decision" });
    expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Goal" })).toBeNull();
  });

  test("an archived idea says so and reads only: no + Add, no Reorder or Delete, no field to change", async () => {
    const user = userEvent.setup();
    executionApi({ ideaArchived: true });
    renderApp(base);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    // The idea's notice alone (6.13: as 20's).
    expect(screen.queryByText("This plan is archived")).toBeNull();
    await screen.findByRole("heading", { level: 2, name: "Business decision" });
    expect(screen.getByText("Decide to go")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.queryAllByRole("combobox")).toEqual([]);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    // The row's ⋯ alone, with what reads: the detail has none.
    const menus = screen.getAllByRole("button", {
      name: "More for Business decision",
    });
    expect(menus).toHaveLength(1);
    await user.click(menus[0] as Element);
    const menu = await screen.findByRole("menu");
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((entry) => entry.textContent),
    ).toEqual(["Comments", "History"]);
  });

  test.each([
    ["a Viewer", { me: as("viewer") }],
    ["an archived plan", { archived: true }],
    ["an archived idea", { ideaArchived: true }],
  ])(
    "an empty tab says what it is for, and nothing more, to %s",
    async (_, options) => {
      executionApi(options);
      renderApp(`${base}?tab=questions`);
      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Write down what you still need to find out, and why it matters.",
        }),
      ).toBeTruthy();
      expect(
        within(screen.getByRole("tabpanel")).queryAllByRole("button"),
      ).toEqual([]);
      expect(
        screen.queryByRole("button", { name: "Add open question" }),
      ).toBeNull();
    },
  );

  test("an item added that the filters leave out clears them, and shows beside the list", async () => {
    const user = userEvent.setup();
    executionApi();
    const router = renderApp(`${base}?tab=actions&status=done`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
    const overdueOnly = screen.getByRole("switch", { name: "Overdue only" });
    await user.click(overdueOnly);
    await user.click(
      screen.getAllByRole("button", { name: "Add next action" })[0] as Element,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "New next action",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Action/ }),
      "Call the bank",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    // To do and with no date: neither Done nor overdue.
    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        tab: "actions",
        item: "5e0c0000-0000-4000-8000-000000000099",
      }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Call the bank" }),
    ).toBeTruthy();
    expect((overdueOnly as HTMLInputElement).checked).toBe(false);
    expect(
      within(screen.getByRole("grid", { name: "Next Actions" })).getByRole(
        "row",
        { name: /Call the bank/ },
      ),
    ).toBeTruthy();
  });

  test("another tab lets go of the filters and the item shown, in place of the history entry", async () => {
    const user = userEvent.setup();
    executionApi();
    const router = renderApp(planPath());
    await screen.findByRole("heading", { level: 1, name: "Plan A" });
    await act(() =>
      router.navigate({
        href: `${base}?tab=actions&assignee=me&item=${venue.id}`,
      }),
    );
    expect(
      await screen.findByRole("heading", { level: 2, name: "Book venue" }),
    ).toBeTruthy();
    const entries = router.history.length;
    await user.click(screen.getByRole("tab", { name: "Milestones" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "milestones" }),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Business decision",
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Next Actions" }));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "actions" }),
    );
    // The first of the list, all of it: not the item nor the assignee of before.
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Get supplier quote",
      }),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("grid", { name: "Next Actions" })).getAllByRole(
        "row",
      ),
    ).toHaveLength(2);
    // Overdue only, which the URL does not hold, goes too.
    await user.click(screen.getByRole("switch", { name: "Overdue only" }));
    await user.click(screen.getByRole("tab", { name: "Launch" }));
    await user.click(await screen.findByRole("tab", { name: "Next Actions" }));
    expect(
      (
        (await screen.findByRole("switch", {
          name: "Overdue only",
        })) as HTMLInputElement
      ).checked,
    ).toBe(false);
    expect(router.history.length).toBe(entries);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(planPath()),
    );
  });

  test("an assignee id the members do not have is A former member", async () => {
    executionApi();
    renderApp(
      `${base}?tab=actions&assignee=0f8fad5b-d9cb-469f-a165-708677289999`,
    );
    const filters = await screen.findByRole("tabpanel");
    await waitFor(() =>
      expect(
        within(filters).getByRole("button", { name: /Assignee/ }).textContent,
      ).toContain("A former member"),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Nothing matches these filters",
      }),
    ).toBeTruthy();
  });

  test("the header's 💬 and 🕘 read the screen's `execution`, the items' from their 💬 and 🕘", async () => {
    const user = userEvent.setup();
    const calls = executionApi();
    const router = renderApp(base);
    await screen.findByRole("heading", { level: 2, name: "Business decision" });
    await waitFor(() =>
      expect(
        calls.some(({ method, path }) => {
          if (method !== "GET" || !path.startsWith("/api/v1/comments?")) {
            return false;
          }
          const query = new URLSearchParams(path.split("?")[1]);
          return (
            query.get("containerType") === "business_plan" &&
            query.get("containerId") === planId &&
            query.get("sectionKeys") === "execution"
          );
        }),
      ).toBe(true),
    );
    await user.click(
      screen.getByRole("button", {
        name: "History of Execution · Business decision",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "history",
        target: `execution_item:${decision.id}`,
      }),
    );
  });
  /** Opens New open question on its tab and types one. */
  const newQuestion = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByRole("heading", {
      level: 2,
      name: "Write down what you still need to find out, and why it matters.",
    });
    await user.click(
      screen.getAllByRole("button", {
        name: "Add open question",
      })[0] as Element,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "New open question",
    });
    await user.type(
      within(dialog).getByRole("textbox", { name: /Open Question/ }),
      "Is the plaza busy on Sundays?",
    );
    return dialog;
  };

  test("a new item and an unexpected failure: the small dialog with its Ref (a dialog's rule, 6.0.6); Close closes New", async () => {
    const user = userEvent.setup();
    executionApi({ create: () => apiError(500, "INTERNAL") });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    // The request id's first 8 characters (SDD 8.2), not the whole id.
    expect(small.textContent).toContain("Ref: 8f14e45f");
    expect(small.textContent).not.toContain("8f14e45f-");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New open question" }),
      ).toBeNull(),
    );
  });

  test("a new item refused for a field: Couldn't save with the reason, and Check the format under the field", async () => {
    const user = userEvent.setup();
    executionApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "whyItMatters", message: "Too long" }],
        }),
    });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("Check the format");
    const why = within(dialog).getByRole("textbox", { name: "Why It Matters" });
    const described = (why.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Check the format");
  });

  test("a new item refused once the user is a Viewer: 22 reads again, read only", async () => {
    const user = userEvent.setup();
    let me = ana;
    executionApi({
      me: () => me,
      create: () => {
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    // Read again as a Viewer: + Add goes; the dialog stays to read, with what was typed
    // and why (design-spec 6.10・6.13), until it is closed.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Add open question" }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("dialog", { name: "New open question" }),
    ).toBeTruthy();
    const question = within(dialog).getByRole("textbox", {
      name: /Open Question/,
    });
    expect((question as HTMLInputElement).value).toBe(
      "Is the plaza busy on Sundays?",
    );
    expect(question.hasAttribute("readonly")).toBe(true);
    const alert = within(dialog).getByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("You don't have access to this");
    expect(
      within(alert)
        .getByRole("button", { name: "Retry" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(dialog)
        .getByRole("button", { name: "Add" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New open question" }),
      ).toBeNull(),
    );
  });

  test("a new item refused as the plan is archived meanwhile: 22 reads as archived; the dialog keeps what was typed and why", async () => {
    const user = userEvent.setup();
    let archived = false;
    executionApi({
      archived: () => archived,
      create: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    expect(
      screen.getByRole("dialog", { name: "New open question" }),
    ).toBeTruthy();
    const question = within(dialog).getByRole("textbox", {
      name: /Open Question/,
    });
    expect((question as HTMLInputElement).value).toBe(
      "Is the plaza busy on Sundays?",
    );
    expect(question.hasAttribute("readonly")).toBe(true);
    expect(within(dialog).getByRole("alert").textContent).toContain(
      "It's archived",
    );
  });

  test("a delete refused as the plan is archived: the reason without Retry, then 22 reads as archived (6.0.6)", async () => {
    const user = userEvent.setup();
    let archived = false;
    executionApi({
      archived: () => archived,
      remove: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?item=${setup.id}`);
    await screen.findByRole("heading", {
      level: 2,
      name: "Legal / company setup",
    });
    const detailMenu = screen.getAllByRole("button", {
      name: "More for Legal / company setup",
    });
    await user.click(detailMenu.at(-1) as Element);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this milestone?",
    });
    const toast = await toastAfter("Couldn't save. It's archived.", () =>
      user.click(within(question).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This plan is archived")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("textbox", { name: "Goal" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: "Add milestone" })).toBeNull();
  });
  /**
   * New open question refused for good: still open, read only, with what was typed and
   * Couldn't save with `reason`; its Add and Retry cannot send again.
   */
  const expectLocked = (dialog: HTMLElement, reason: string) => {
    const question = within(dialog).getByRole("textbox", {
      name: /Open Question/,
    });
    expect((question as HTMLInputElement).value).toBe(
      "Is the plaza busy on Sundays?",
    );
    expect(question.hasAttribute("readonly")).toBe(true);
    const alert = within(dialog).getByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain(reason);
    expect(
      within(alert)
        .getByRole("button", { name: "Retry" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      within(dialog)
        .getByRole("button", { name: "Add" })
        .hasAttribute("disabled"),
    ).toBe(true);
  };

  test("a new item refused as gone (404): the dialog locks at once, with what was typed and why; nothing more is sent", async () => {
    const user = userEvent.setup();
    const calls = executionApi({ create: () => apiError(404, "NOT_FOUND") });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("It no longer exists")).toBeTruthy();
    expectLocked(dialog, "It no longer exists");
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(sent(calls, "POST", `${api}/execution-items`)).toHaveLength(1);
  });

  test("a new item refused as archived: the dialog locks at once, before the screen read again answers", async () => {
    const user = userEvent.setup();
    let refused = false;
    const calls = executionApi({
      holdReads: () => refused,
      create: () => {
        refused = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?tab=questions`);
    const dialog = await newQuestion(user);
    await user.click(within(dialog).getByRole("button", { name: "Add" }));
    expect(await within(dialog).findByText("It's archived")).toBeTruthy();
    expectLocked(dialog, "It's archived");
    expect(screen.queryByText("This plan is archived")).toBeNull();
    expect(sent(calls, "POST", `${api}/execution-items`)).toHaveLength(1);
  });
});
