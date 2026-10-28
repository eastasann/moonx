import type { Me, Role } from "@moonx/schemas";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  members,
  otherTeam,
  paolosShared,
  people,
  selfAnalysisId,
} from "../test/selfAnalysis";

// 12 Team Self Analyses (design-spec 6.11, SDD 5.8 S6・S7).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/team`;
const list = `/api/v1/workspaces/${workspaceId}/self-analyses`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

function teamApi({
  me = ana,
  items = members.items,
  threads = [],
}: {
  me?: Me;
  items?: typeof members.items;
  threads?: unknown[];
} = {}) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (method === "GET" && path === list) return Response.json({ items });
    if (method === "GET" && path === `${list}/${people.paolo.id}`) {
      return Response.json(paolosShared);
    }
    if (method === "GET" && path === `${list}/${ana.id}`) {
      return Response.json({
        ...paolosShared,
        id: selfAnalysisId,
        user: { ...people.paolo, id: ana.id, displayName: ana.displayName },
      });
    }
    if (method === "GET" && path.startsWith("/api/v1/comments?")) {
      return Response.json({ threads, unresolvedCount: threads.length });
    }
    if (method === "GET" && path.includes("/mention-candidates?")) {
      return Response.json({ items: [] });
    }
    return undefined;
  });
}

describe("12 Team Self Analyses (design-spec 6.11)", () => {
  test("the members, the shared one beside the list to read with its amounts; Not shared ones are grey and still", async () => {
    const user = userEvent.setup();
    teamApi();
    const router = renderApp(base);
    const grid = await screen.findByRole("grid", { name: "Members" });
    const rows = within(grid).getAllByRole("row");
    expect(rows[0]?.textContent).toContain("Kenji Mori");
    expect(rows[0]?.textContent).toContain("Not shared");
    // No ›, and pressing it opens nothing (4.5 ListView).
    expect(rows[0]?.querySelector("svg")).toBeNull();
    expect(rows[1]?.textContent).toContain("Shared · Done");
    expect(rows[1]?.querySelector("svg")).not.toBeNull();
    // Beside the list, the first shared one (4.1 D).
    expect(
      await screen.findByText("To run a café students can afford."),
    ).toBeTruthy();
    const income = screen.getByRole("region", { name: "PERSONAL INCOME" });
    expect(income.textContent).toContain("₱45,000");
    expect(income.textContent).toContain("Rent and my sister's tuition.");
    expect(
      within(screen.getByRole("region", { name: "WHY" })).getByText("Empty"),
    ).toBeTruthy();
    // No history on 12 (6.11).
    expect(screen.queryByRole("button", { name: /History/ })).toBeNull();
    await user.click(within(grid).getByText("Kenji Mori"));
    expect(router.state.location.pathname).not.toContain(people.kenji.id);
  });

  test("an answer's 💬 opens its thread in this workspace", async () => {
    const user = userEvent.setup();
    const calls = teamApi();
    const router = renderApp(`${base}/${people.paolo.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: "Comments on WHY Q1, 2 comments",
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "comments",
        target: `self_analysis_answer:${paolosShared.id}:SA.WHY.1`,
      }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    expect(within(panel).getByText("On WHY Q1")).toBeTruthy();
    expect(
      within(panel).getByRole("textbox", { name: "Add a comment" }),
    ).toBeTruthy();
    expect(
      calls.some(
        ({ path }) =>
          path.startsWith("/api/v1/comments?") &&
          path.includes(`workspaceId=${workspaceId}`) &&
          path.includes("targetType=self_analysis_answer"),
      ),
    ).toBe(true);
  });

  test("the user's own row: its threads say the workspace each is from (6.0.4)", async () => {
    const user = userEvent.setup();
    teamApi({
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
            author: people.paolo,
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
    });
    renderApp(`${base}/${ana.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: "Comments on WHY Q1, 2 comments",
      }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Comments",
    });
    expect(
      await within(panel).findByText(`From ${otherTeam.name}`),
    ).toBeTruthy();
    // Shared here, where a new thread goes.
    expect(
      within(panel).getByRole("textbox", { name: "Add a comment" }),
    ).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: /Post to/ })).toBeNull();
  });

  test("no one shared: says so", async () => {
    teamApi({
      items: members.items.map((item) => ({
        ...item,
        shared: false,
        status: null,
      })),
    });
    renderApp(base);
    expect(
      await screen.findByText(
        "No one has shared their self analysis in this workspace yet.",
      ),
    ).toBeTruthy();
  });

  test("moving to another member keeps the header's list open, on theirs", async () => {
    const user = userEvent.setup();
    teamApi({
      items: [
        {
          user: {
            id: ana.id,
            displayName: ana.displayName,
            avatarUrl: null,
            badge: null,
          },
          shared: true,
          status: "done",
        },
        ...members.items,
      ],
    });
    const router = renderApp(
      `${base}/${people.paolo.id}?panel=comments&target=container:self_analysis:${paolosShared.id}`,
    );
    const before = await screen.findByRole("complementary", {
      name: "Comments",
    });
    const grid = await screen.findByRole("grid", { name: "Members" });
    await user.click(within(grid).getByText("Ana Villanueva"));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "comments",
        target: `container:self_analysis:${selfAnalysisId}`,
      }),
    );
    expect(router.state.location.pathname).toBe(`${base}/${ana.id}`);
    // The same panel all along: not closed and opened again, focus left where it was.
    expect(screen.getByRole("complementary", { name: "Comments" })).toBe(
      before,
    );
    expect(before.contains(document.activeElement)).toBe(false);
  });

  test("a panel on another member's answers or list opens nothing here, and stays as linked", async () => {
    teamApi();
    for (const target of [
      `self_analysis_answer:${selfAnalysisId}:SA.WHY.1`,
      `container:self_analysis:${selfAnalysisId}`,
    ]) {
      const router = renderApp(
        `${base}/${people.paolo.id}?panel=comments&target=${target}`,
      );
      expect(
        await screen.findByText("To run a café students can afford."),
      ).toBeTruthy();
      expect(
        screen.queryByRole("complementary", { name: "Comments" }),
      ).toBeNull();
      expect(router.state.location.search).toMatchObject({ target });
      cleanup();
    }
  });

  test("a question its display condition hides is not read (6.2)", async () => {
    stubApi((call: Call) => {
      const { method, path } = call;
      if (method === "GET" && path === "/api/v1/me") return Response.json(ana);
      if (method === "PATCH" && path === "/api/v1/me")
        return Response.json(ana);
      if (method === "GET" && path === list) {
        return Response.json({ items: members.items });
      }
      if (method === "GET" && path === `${list}/${people.paolo.id}`) {
        const [why, ...rest] = paolosShared.sections;
        if (why === undefined) throw new Error("No WHY");
        return Response.json({
          ...paolosShared,
          sections: [
            {
              ...why,
              questions: [
                ...why.questions,
                {
                  ...why.questions[0],
                  key: "SA.WHY.3",
                  title: "Q2b",
                  prompt: "Only when Q2 is Yes",
                  displayCondition: { "SA.WHY.2": ["Yes"] },
                },
              ],
            },
            ...rest,
          ],
        });
      }
      return undefined;
    });
    renderApp(`${base}/${people.paolo.id}`);
    expect(
      await screen.findByText("To run a café students can afford."),
    ).toBeTruthy();
    expect(screen.queryByText("Only when Q2 is Yes")).toBeNull();
  });

  test("a Viewer has no access, and no Self Analysis in the navigation", async () => {
    const calls = teamApi({ me: as("viewer") });
    renderApp(base);
    expect(
      await screen.findByRole("heading", {
        name: "You don't have access to this",
      }),
    ).toBeTruthy();
    // A state without a name is titled moonx alone (6.0.1).
    await waitFor(() => expect(document.title).toBe("moonx"));
    expect(screen.queryByRole("link", { name: "Self Analysis" })).toBeNull();
    expect(calls.some(({ path }) => path === list)).toBe(false);
  });
});
