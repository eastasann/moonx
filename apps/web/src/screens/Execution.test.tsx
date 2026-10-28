import type { ExecutionItem, Me, Role } from "@moonx/schemas";
import { focusManager } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { anaRef, executionItem, ideaId, planHome, planId } from "../test/plans";
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
}: {
  me?: Me;
  items?: ExecutionItem[];
  archived?: boolean;
} = {}) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === `/api/v1/ideas/${ideaId}/validation`) {
      return Response.json(ideaHome);
    }
    if (method === "GET" && path === api) {
      return Response.json(planHome({ archived }));
    }
    if (method === "GET" && path === `${api}/execution-items`) {
      return Response.json({ items });
    }
    if (method === "POST" && path === `${api}/execution-items`) {
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
      const index = items.findIndex(({ id }) => id === one[1]);
      if (index === -1) return undefined;
      items.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (
      method === "GET" &&
      path === `/api/v1/workspaces/${workspaceId}/members`
    ) {
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
      return Response.json({ items: [], nextCursor: null });
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
});
