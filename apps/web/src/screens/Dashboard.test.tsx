import { formatDate, formatOverdue } from "@moonx/i18n";
import type { Activity, DueItem, Me, Role } from "@moonx/schemas";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkspaceContext } from "../components/workspace";
import { api, unwrap } from "../lib/api";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { ideaSummary, workspaceId } from "../test/ideas";
import { GettingStarted } from "./Dashboard";

const workspace = {
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  name: "BCDX",
  isPersonal: false,
  currency: "PHP",
};

const me: Me = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  email: "ana@bcdx.example",
  displayName: "Ana Villanueva",
  avatarUrl: null,
  timezone: "Asia/Manila",
  theme: "system",
  isAdmin: false,
  hasPassword: true,
  lastWorkspaceId: workspace.id,
  memberships: [{ workspace, role: "owner" }],
};

const renderAs = (role: Role, onFirstIdea = () => {}) =>
  render(
    <WorkspaceContext.Provider value={{ me, workspace, role }}>
      <GettingStarted onFirstIdea={onFirstIdea} />
    </WorkspaceContext.Provider>,
  );

const steps = () =>
  within(screen.getByRole("list", { name: "Getting started" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent);

describe("Getting started (design-spec 6.9)", () => {
  test("an Owner: the self analysis, inviting the team, the first idea", () => {
    renderAs("owner");
    expect(
      screen.getByRole("heading", { level: 2, name: "Getting started" }),
    ).toBeTruthy();
    expect(steps()).toEqual([
      "Start your self analysis",
      "Invite your team",
      "Write your first idea",
    ]);
  });

  test("the self analysis opens 10, inviting the team 9", () => {
    renderAs("owner");
    expect(
      screen
        .getByRole("link", { name: "Start your self analysis" })
        .getAttribute("href"),
    ).toBe(`/w/${workspace.id}/self-analysis`);
    expect(
      screen
        .getByRole("link", { name: "Invite your team" })
        .getAttribute("href"),
    ).toBe(`/w/${workspace.id}/settings`);
  });

  test("the first idea opens M1", async () => {
    const onFirstIdea = vi.fn();
    renderAs("member", onFirstIdea);
    await userEvent.click(screen.getByText("Write your first idea"));
    expect(onFirstIdea).toHaveBeenCalledOnce();
  });

  test("a Member does not invite", () => {
    renderAs("member");
    expect(steps()).toEqual([
      "Start your self analysis",
      "Write your first idea",
    ]);
  });

  test("a Viewer gets the one line only", () => {
    renderAs("viewer");
    expect(screen.queryByRole("list")).toBeNull();
    expect(
      screen.getByText(
        "This workspace has no ideas yet. They show up here once the team writes them.",
      ),
    ).toBeTruthy();
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const ref = (id: string, displayName: string) => ({
  id,
  displayName,
  avatarUrl: null,
  badge: null,
});
const paolo = ref("6fa459ea-ee8a-4ca4-894e-db77e160355e", "Paolo Gonzaga");
const kenji = ref("16fd2706-8baf-433b-82eb-8c7fada847da", "Kenji Mori");

const piaya = ideaSummary(
  "a2809bdc-f3d5-4f7f-b5db-afef39019de0",
  "Piaya Gift Box Delivery",
  { latestDecision: "proceed", stage: "planning" },
);
const bowl = ideaSummary(
  "ece58aa6-e77d-4895-b5cf-e8f366bd4e46",
  "Bacolod Health Bowl",
  { latestDecision: "hold" },
);
const planA = { id: "c56a4180-65aa-42ec-a945-5fd21dec0538", name: "Plan A" };

const overdue: DueItem = {
  id: "e4eaaaf2-d142-11e1-b3e4-080027620cdd",
  type: "kpi",
  title: "Weekly orders",
  dueDate: "2026-01-05",
  overdue: true,
  assignee: { user: paolo },
  isMine: false,
  idea: { id: piaya.id, name: piaya.name },
  plan: planA,
};
const mine: DueItem = {
  id: "9a3b1c2d-0000-4000-8000-000000000001",
  type: "milestone",
  title: "Sign the lease",
  dueDate: "2099-01-05",
  overdue: false,
  assignee: { name: "Landlord" },
  isMine: true,
  idea: { id: piaya.id, name: piaya.name },
  plan: planA,
};

const activity = (kind: Activity["kind"], summary: string): Activity => ({
  kind,
  actor: kenji,
  at: "2026-01-05T01:00:00.000Z",
  summary,
  idea: { id: bowl.id, name: bowl.name },
  plan: kind === "go_no_go" || kind === "version_saved" ? planA : null,
  link: { screen: 13, workspaceId, ideaId: bowl.id },
});

const moves = [
  activity("change", "01 WHO"),
  activity("comment", "Costs · Rent"),
  activity("decision", "hold"),
  activity("go_no_go", "delay"),
  activity("version_saved", "v1 For advisors"),
];

const selfAnalyses = [
  { user: ref(ana.id, ana.displayName), shared: true, status: "done" },
  { user: paolo, shared: true, status: "in_progress" },
  { user: kenji, shared: false, status: null },
];

const dashboard = `/api/v1/workspaces/${workspaceId}/dashboard`;

/** D1–D4 (SDD 5.6) as the blocks read them; `fail` makes one of them a 500. */
function dashboardApi({
  me = ana,
  ideas = { items: [piaya, bowl], droppedCount: 1 },
  due = [overdue, mine],
  moves: feed = moves,
  fail,
  write = () => new Response(null, { status: 204 }),
  firstIdeas,
}: {
  me?: Me;
  ideas?: { items: unknown[]; droppedCount: number };
  due?: DueItem[];
  moves?: Activity[];
  fail?: "ideas" | "due-soon" | "self-analyses" | "activity";
  /** The answer to a change (N3, marking every notification read). */
  write?: () => Response | Promise<Response>;
  /** What the first read of D1 waits for. */
  firstIdeas?: Promise<void>;
} = {}) {
  let ideasRead = 0;
  return stubApi(({ path }: Call) => {
    if (path === "/api/v1/me") return Response.json(me);
    if (fail !== undefined && path === `${dashboard}/${fail}`) {
      return apiError(500, "INTERNAL");
    }
    if (path === `${dashboard}/ideas`) {
      ideasRead += 1;
      return ideasRead === 1 && firstIdeas !== undefined
        ? firstIdeas.then(() => Response.json(ideas))
        : Response.json(ideas);
    }
    if (path === `${dashboard}/due-soon`) return Response.json({ items: due });
    if (path === `${dashboard}/self-analyses`) {
      return Response.json({ items: selfAnalyses });
    }
    if (path === `${dashboard}/activity`) return Response.json({ items: feed });
    if (path === "/api/v1/notifications/read-all") return write();
    return undefined;
  });
}

const list = (name: string) => screen.findByRole("list", { name });

describe("5 Dashboard (design-spec 6.9)", () => {
  test("Ideas: each opens its 13 with its stage, what it misses and its decision", async () => {
    dashboardApi();
    renderApp(`/w/${workspaceId}`);
    const ideas = await list("Ideas");
    const rows = within(ideas).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Piaya Gift Box Delivery"),
      expect.stringContaining("Bacolod Health Bowl"),
    ]);
    expect(rows[0]?.textContent).toContain("Planning · updated");
    expect(rows[0]?.textContent).toContain("Proceed");
    expect(rows[1]?.textContent).toContain(
      "Missing: Startup & monthly costs, Permits",
    );
    expect(
      within(ideas)
        .getByRole("link", { name: /Piaya Gift Box Delivery/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${piaya.id}`);
    expect(
      screen.getByText("Checks: ● done · ◐ partial · ○ not started"),
    ).toBeTruthy();
    expect(screen.getByText(/1 dropped idea hidden/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Show" }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas?decision=drop`);
    expect(document.title).toBe("Dashboard · BCDX · moonx");
  });

  test("Due soon: how long overdue, a date otherwise, the user's own marked; each opens 22 on its tab", async () => {
    dashboardApi();
    renderApp(`/w/${workspaceId}`);
    const due = await list("Due soon");
    const [late, own] = within(due).getAllByRole("listitem");
    expect(late?.textContent).toContain("Weekly orders");
    expect(late?.textContent).toContain(`${piaya.name} · ${paolo.displayName}`);
    expect(late?.textContent).toContain(
      formatOverdue(overdue.dueDate, { timeZone: ana.timezone }),
    );
    expect(late?.textContent).not.toContain("Yours");
    expect(own?.textContent).toContain("Sign the lease Yours");
    expect(own?.textContent).toContain(`${piaya.name} · Landlord`);
    expect(own?.textContent).toContain(
      formatDate(mine.dueDate, { timeZone: ana.timezone }),
    );
    expect(
      within(due)
        .getByRole("link", { name: /Weekly orders/ })
        .getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ideas/${piaya.id}/plans/${planA.id}/execution?tab=kpis&item=${overdue.id}`,
    );
  });

  test("Self analyses: a shared one opens 12 with its status, one not shared does not open", async () => {
    dashboardApi();
    renderApp(`/w/${workspaceId}`);
    const people = await list("Self analyses");
    const rows = within(people).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Shared · Done"),
      expect.stringContaining("Shared · In progress"),
      expect.stringContaining("Not shared"),
    ]);
    expect(
      within(people)
        .getByRole("link", { name: /Paolo Gonzaga/ })
        .getAttribute("href"),
    ).toBe(`/w/${workspaceId}/team/${paolo.id}`);
    expect(within(people).queryByRole("link", { name: /Kenji Mori/ })).toBe(
      null,
    );
  });

  test("Recent activity: who did what, where and when; each opens its item", async () => {
    dashboardApi();
    renderApp(`/w/${workspaceId}`);
    const feed = await list("Recent activity");
    const rows = within(feed).getAllByRole("listitem");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Kenji Mori changed 01 WHO"),
      expect.stringContaining("Kenji Mori commented on Costs · Rent"),
      expect.stringContaining("Kenji Mori recorded Hold"),
      expect.stringContaining("Kenji Mori recorded Go / No-Go: Delay"),
      expect.stringContaining("Kenji Mori saved the version “v1 For advisors”"),
    ]);
    expect(rows[0]?.textContent).toContain(bowl.name);
    expect(rows[3]?.textContent).toContain(`${bowl.name} · Plan A`);
    expect(
      within(feed)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual(moves.map(() => `/w/${workspaceId}/ideas/${bowl.id}`));
  });

  test("empty blocks say so", async () => {
    dashboardApi({ due: [], moves: [] });
    renderApp(`/w/${workspaceId}`);
    expect(
      await screen.findByText("Nothing is due in the next 7 days."),
    ).toBeTruthy();
    expect(
      await screen.findByText("Nothing has happened in this workspace yet."),
    ).toBeTruthy();
  });

  test("a workspace without ideas starts with Getting started, whose first idea opens M1", async () => {
    dashboardApi({ ideas: { items: [], droppedCount: 0 } });
    renderApp(`/w/${workspaceId}`);
    await userEvent.click(await screen.findByText("Write your first idea"));
    expect(
      await screen.findByRole("dialog", { name: "New idea" }),
    ).toBeTruthy();
  });

  test("only dropped ideas: the line to show them, not Getting started", async () => {
    dashboardApi({ ideas: { items: [], droppedCount: 2 } });
    renderApp(`/w/${workspaceId}`);
    expect(await screen.findByText(/2 dropped ideas hidden/)).toBeTruthy();
    expect(screen.queryByText("Getting started")).toBeNull();
  });

  test("a block that fails says so and leaves the others", async () => {
    dashboardApi({ fail: "due-soon" });
    renderApp(`/w/${workspaceId}`);
    await list("Ideas");
    const failed = await screen.findByRole("button", { name: "Retry" });
    expect(failed).toBeTruthy();
    expect(await list("Recent activity")).toBeTruthy();
    expect(await list("Self analyses")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Due soon" })).toBeNull();
  });

  test("a Viewer: no Self analyses, and the lead without them", async () => {
    const calls = dashboardApi({ me: as("viewer") });
    renderApp(`/w/${workspaceId}`);
    await list("Ideas");
    expect(
      screen.getByText("Ideas and what is due across the workspace."),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Self analyses" })).toBe(null);
    expect(calls.some(({ path }) => path.endsWith("/self-analyses"))).toBe(
      false,
    );
  });

  test("back within 30 seconds the lists show from the cache; a change of the user's, even one answered after coming back, has them read again (SDD 7.3)", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = dashboardApi({
      write: () => held.then(() => new Response(null, { status: 204 })),
    });
    const router = renderApp(`/w/${workspaceId}`);
    await list("Ideas");
    const asked = () =>
      calls.filter(({ path }) => path === `${dashboard}/ideas`).length;
    const go = (href: string) => act(() => router.navigate({ href }));
    expect(asked()).toBe(1);

    await go("/notifications");
    await go(`/w/${workspaceId}`);
    await list("Ideas");
    expect(asked()).toBe(1);

    // A change sent as the user leaves, answered once they are back.
    await go("/notifications");
    const change = unwrap(api().api.v1.notifications["read-all"].post());
    await go(`/w/${workspaceId}`);
    await list("Ideas");
    expect(asked()).toBe(1);
    await act(async () => {
      release();
      await change;
    });
    await waitFor(() => expect(asked()).toBe(2));
  });

  test("a list being read as a change of the user's goes through is read again after it", async () => {
    let release = () => {};
    const firstIdeas = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = dashboardApi({ firstIdeas });
    renderApp(`/w/${workspaceId}`);
    const asked = () =>
      calls.filter(({ path }) => path === `${dashboard}/ideas`).length;
    await waitFor(() => expect(asked()).toBe(1));

    await act(() => unwrap(api().api.v1.notifications["read-all"].post()));
    await waitFor(() => expect(asked()).toBe(2));
    await list("Ideas");
    release();
  });
});
