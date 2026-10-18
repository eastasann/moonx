import type { Me, Role } from "@moonx/schemas";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, renderApp, stubApi } from "../test/api";
import { ideaSummary, validationHome, workspaceId } from "../test/ideas";

// 6 Ideas and M1 (design-spec 6.8・3.8).

/** happy-dom's window, whose viewport a test sets. */
const setViewport = (width: number) =>
  act(() =>
    (
      window as unknown as {
        happyDOM: {
          setViewport: (size: { width: number; height: number }) => void;
        };
      }
    ).happyDOM.setViewport({ width, height: 900 }),
  );

afterEach(() => {
  vi.unstubAllGlobals();
  setViewport(1024);
});

const piaya = ideaSummary(
  "a2809bdc-f3d5-4f7f-b5db-afef39019de0",
  "Piaya Gift Box Delivery",
  { latestDecision: "proceed", stage: "planning" },
);
const bowl = validationHome().idea;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

function ideasApi({
  me = ana,
  items = [piaya, bowl],
  hidden = 1,
  create = () => apiError(500, "INTERNAL"),
}: {
  me?: Me;
  items?: unknown[];
  hidden?: number;
  create?: () => Response;
} = {}) {
  return stubApi(({ method, path }) => {
    if (path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/workspaces/${workspaceId}/ideas?`)
    ) {
      return Response.json({
        items,
        nextCursor: null,
        hiddenDroppedCount: hidden,
      });
    }
    if (
      method === "POST" &&
      path === `/api/v1/workspaces/${workspaceId}/ideas`
    ) {
      return create();
    }
    if (path === `/api/v1/workspaces/${workspaceId}/members`) {
      return Response.json({ items: [] });
    }
    if (path === `/api/v1/ideas/${bowl.id}/validation`) {
      return Response.json(validationHome());
    }
    if (path === `/api/v1/ideas/${piaya.id}/validation`) {
      return Response.json({
        ...validationHome({ id: piaya.id, name: piaya.name }),
        decisions: [],
      });
    }
    return undefined;
  });
}

describe("6 Ideas (design-spec 6.8)", () => {
  test("rows: decision, stage, proposer, checks and what they miss; the hidden Drop ones", async () => {
    const calls = ideasApi();
    renderApp(`/w/${workspaceId}/ideas`);
    const list = await screen.findByRole("grid", { name: "Ideas" });
    const rows = await within(list).findAllByRole("row");
    expect(rows[0]?.textContent).toContain("Piaya Gift Box Delivery");
    expect(rows[0]?.textContent).toContain("Proceed");
    expect(rows[0]?.textContent).toContain("Planning · Ana Villanueva");
    expect(rows[1]?.textContent).toContain(
      "Missing: Startup & monthly costs, Permits",
    );
    expect(screen.getByText(/1 dropped idea hidden/)).toBeTruthy();
    expect(document.title).toBe("Ideas · BCDX · moonx");
    // The default filters (SDD 5.6 I1).
    expect(calls.find(({ path }) => path.includes("/ideas?"))?.path).toContain(
      "decision=not_dropped",
    );
  });

  test("an Owner gets New idea and each row's ⋯", async () => {
    ideasApi();
    renderApp(`/w/${workspaceId}/ideas`);
    await screen.findAllByRole("row");
    expect(
      screen.getAllByRole("button", { name: "New idea" }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: "More for Piaya Gift Box Delivery" }),
    ).toBeTruthy();
  });

  test("a Viewer gets neither New idea nor the rows' ⋯", async () => {
    ideasApi({ me: as("viewer") });
    renderApp(`/w/${workspaceId}/ideas`);
    await screen.findAllByRole("row");
    expect(screen.queryByRole("button", { name: "New idea" })).toBeNull();
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
  });

  test("in one pane, a row opens its 13 (design-spec 6.8: the phone's list)", async () => {
    setViewport(820);
    ideasApi();
    const router = renderApp(`/w/${workspaceId}/ideas`);
    const user = userEvent.setup();
    const row = (await screen.findAllByRole("row"))[1] as HTMLElement;
    await user.click(row);
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${bowl.id}`,
      ),
    );
  });

  test("beside the list, the first idea until a row is chosen; then the row's, in the URL", async () => {
    setViewport(1440);
    ideasApi();
    const router = renderApp(`/w/${workspaceId}/ideas`);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Piaya Gift Box Delivery",
      }),
    ).toBeTruthy();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("row"))[1] as HTMLElement);
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Bacolod Health Bowl",
      }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ selected: bowl.id });
    expect(screen.getByText(/Latest decision: Hold on Oct 10/)).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Open validation" }),
    ).toBeTruthy();
  });

  test("a search longer than I1 takes says why and is not sent", async () => {
    const calls = ideasApi();
    renderApp(`/w/${workspaceId}/ideas`);
    await screen.findAllByRole("row");
    const user = userEvent.setup();
    await user.click(screen.getByRole("searchbox", { name: "Search ideas" }));
    await user.paste("a".repeat(201));
    expect(
      await screen.findByText("Too long. Shorten to 200 characters."),
    ).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(calls.some(({ path }) => path.includes("q=aaa"))).toBe(false);
  });

  test("empty: why the screen is there and New idea; a Viewer the words only", async () => {
    ideasApi({ items: [], hidden: 0 });
    renderApp(`/w/${workspaceId}/ideas`);
    expect(
      await screen.findByRole("heading", {
        name: "No ideas yet. Write down the first one. You can have many.",
      }),
    ).toBeTruthy();
  });
});

describe("M1 New idea (design-spec 3.8・6.8)", () => {
  test("Create waits for the required fields; no published template says so where it is", async () => {
    ideasApi({ create: () => apiError(409, "TEMPLATE_NOT_PUBLISHED") });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    const dialog = await screen.findByRole("dialog", { name: "New idea" });
    const create = within(dialog).getByRole("button", { name: "Create" });
    expect(create.hasAttribute("disabled")).toBe(true);
    const user = userEvent.setup();
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Name/ }),
      "Taho",
    );
    expect(create.hasAttribute("disabled")).toBe(true);
    await user.type(
      within(dialog).getByRole("textbox", { name: /^One-line concept/ }),
      "Taho by bike.",
    );
    await waitFor(() => expect(create.hasAttribute("disabled")).toBe(false));
    await user.click(create);
    expect(
      await within(dialog).findByText(
        "Templates aren't ready yet. Ask your administrator.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("a Viewer opening M1's URL sees no dialog", async () => {
    ideasApi({ me: as("viewer") });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    await screen.findAllByRole("row");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
