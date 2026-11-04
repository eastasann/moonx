import type { Me, Role } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
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

  test("in one pane, a link with ?selected= opens that idea's summary; ← goes back to the list (design-spec 6.8)", async () => {
    for (const width of [820, 390]) {
      setViewport(width);
      ideasApi();
      const router = renderApp(`/w/${workspaceId}/ideas?selected=${bowl.id}`);
      expect(
        await screen.findByRole("heading", {
          level: 2,
          name: "Bacolod Health Bowl",
        }),
      ).toBeTruthy();
      // One pane: the summary in place of the list.
      expect(screen.queryByRole("grid", { name: "Ideas" })).toBeNull();
      expect(
        screen.getByRole("button", { name: "Open validation" }),
      ).toBeTruthy();
      // The pattern's ← on a tablet, the header's on a phone (4.1 D).
      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: "Back to Ideas" }));
      expect(await screen.findByRole("grid", { name: "Ideas" })).toBeTruthy();
      expect(router.state.location.search).not.toHaveProperty("selected");
      expect(
        screen.queryByRole("heading", {
          level: 2,
          name: "Bacolod Health Bowl",
        }),
      ).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
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

  test("a proposer who left reads as a former member, in the row and beside the list (design-spec 6.16)", async () => {
    setViewport(1440);
    const former = {
      ...bowl.proposer,
      displayName: "Kenji Mori",
      badge: "former_member" as const,
    };
    stubApi(({ method, path }) => {
      if (path === "/api/v1/me") return Response.json(ana);
      if (
        method === "GET" &&
        path.startsWith(`/api/v1/workspaces/${workspaceId}/ideas?`)
      ) {
        return Response.json({
          items: [{ ...bowl, proposer: former }],
          nextCursor: null,
          hiddenDroppedCount: 0,
        });
      }
      if (path === `/api/v1/workspaces/${workspaceId}/members`) {
        return Response.json({ items: [] });
      }
      if (path === `/api/v1/ideas/${bowl.id}/validation`) {
        const data = validationHome();
        return Response.json({
          ...data,
          idea: { ...data.idea, proposer: former },
        });
      }
      return undefined;
    });
    renderApp(`/w/${workspaceId}/ideas`);
    const [row] = await screen.findAllByRole("row");
    expect(row?.textContent).toContain(
      "Validation · Kenji Mori (former member) ·",
    );
    expect(
      await screen.findByText(
        "Stage: Validation · Kenji Mori (former member)",
        { exact: false },
      ),
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
    const user = userEvent.setup();
    const emptyHeading = () =>
      screen.findByRole("heading", {
        name: "No ideas yet. Write down the first one. You can have many.",
      });
    ideasApi({ items: [], hidden: 0 });
    renderApp(`/w/${workspaceId}/ideas`);
    // The message's own New idea (IllustratedMessage), besides the list header's.
    const message = (await emptyHeading()).parentElement as HTMLElement;
    await user.click(within(message).getByRole("button", { name: "New idea" }));
    expect(
      await screen.findByRole("dialog", { name: "New idea" }),
    ).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    ideasApi({ me: as("viewer"), items: [], hidden: 0 });
    renderApp(`/w/${workspaceId}/ideas`);
    await emptyHeading();
    expect(screen.queryByRole("button", { name: "New idea" })).toBeNull();
  });

  test("the filters and the search change the list in place: Back goes to 5", async () => {
    const user = userEvent.setup();
    ideasApi();
    const router = renderApp(`/w/${workspaceId}`);
    await act(() => router.navigate({ href: `/w/${workspaceId}/ideas` }));
    await screen.findByRole("grid", { name: "Ideas" });
    const entries = router.history.length;
    await user.click(screen.getByRole("button", { name: /^Stage/ }));
    await user.click(await screen.findByRole("option", { name: "Planning" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ stage: "planning" }),
    );
    await user.click(screen.getByRole("button", { name: /^Sort/ }));
    await user.click(await screen.findByRole("option", { name: "Name" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ sort: "name" }),
    );
    await user.click(screen.getByRole("link", { name: "Show" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ decision: "all" }),
    );
    await user.type(
      screen.getByRole("searchbox", { name: "Search ideas" }),
      "Piaya",
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ q: "Piaya" }),
    );
    expect(router.history.length).toBe(entries);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/w/${workspaceId}`),
    );
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

  /** Types the required fields of M1 and presses Create. */
  async function create(dialog: HTMLElement) {
    const user = userEvent.setup();
    await user.type(
      within(dialog).getByRole("textbox", { name: /^Name/ }),
      "Taho",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: /^One-line concept/ }),
      "Taho by bike.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Create" }));
    return user;
  }

  const posts = (calls: Call[]) =>
    calls.filter(
      ({ method, path }) =>
        method === "POST" && path === `/api/v1/workspaces/${workspaceId}/ideas`,
    );

  const typed = { name: "Taho", oneLineConcept: "Taho by bike." };

  test("the network or an API that is down: Couldn't save and Retry in M1, what was typed kept; Retry sends it again", async () => {
    for (const fail of [
      (): Response => {
        throw new TypeError("Failed to fetch");
      },
      // A bare 503 from the front of Cloud Run (SDD 8.1).
      () => new Response(null, { status: 503 }),
    ]) {
      let tries = 0;
      const calls = ideasApi({
        create: () => {
          tries += 1;
          return tries === 1 ? fail() : apiError(500, "INTERNAL");
        },
      });
      renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
      const dialog = await screen.findByRole("dialog", { name: "New idea" });
      const user = await create(dialog);
      expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
      expect(
        within(dialog).getByRole("textbox", { name: /^Name/ }),
      ).toHaveProperty("value", "Taho");
      expect(screen.queryByRole("alertdialog")).toBeNull();
      await user.click(within(dialog).getByRole("button", { name: "Retry" }));
      await waitFor(() => expect(posts(calls)).toHaveLength(2));
      expect(posts(calls).map(({ body }) => body)).toEqual([
        { ...typed, proposedSolution: "" },
        { ...typed, proposedSolution: "" },
      ]);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test("an unexpected failure: the small dialog with its Ref; Retry sends again, Close closes M1", async () => {
    const calls = ideasApi({ create: () => apiError(500, "INTERNAL") });
    const router = renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    const dialog = await screen.findByRole("dialog", { name: "New idea" });
    const user = await create(dialog);
    const failed = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    // The request id's first 8 characters, not all of it (design-spec 6.0.6).
    expect(within(failed).getByText("Ref: 8f14e45f")).toBeTruthy();
    await user.click(within(failed).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(posts(calls)).toHaveLength(2));
    expect(posts(calls)[1]?.body).toEqual(posts(calls)[0]?.body);
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Something went wrong/,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "New idea" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("modal");
  });

  test("too many attempts: the wait in M1, what was typed kept", async () => {
    ideasApi({
      create: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
    });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    const dialog = await screen.findByRole("dialog", { name: "New idea" });
    await create(dialog);
    expect(
      await within(dialog).findByText(
        "Too many attempts. Try again in 1 minute.",
      ),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("textbox", { name: /^One-line concept/ }),
    ).toHaveProperty("value", "Taho by bike.");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  test("refused for good: Couldn't save and 6.0.2's reason in M1; a 422 naming a field says so under it too", async () => {
    ideasApi({ create: () => apiError(403, "FORBIDDEN") });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    let dialog = await screen.findByRole("dialog", { name: "New idea" });
    await create(dialog);
    expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
    expect(
      within(dialog).getByText("You don't have access to this"),
    ).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    cleanup();
    vi.unstubAllGlobals();
    ideasApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "name", message: "too long" }],
        }),
    });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    dialog = await screen.findByRole("dialog", { name: "New idea" });
    await create(dialog);
    expect(await within(dialog).findByText("Couldn't save")).toBeTruthy();
    const name = within(dialog).getByRole("textbox", { name: /^Name/ });
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(within(dialog).getAllByText("Check the format")).toHaveLength(2);
    // Changing the refused field asks the API again: the send's failure goes with it.
    await userEvent.setup().type(name, "s");
    await waitFor(() =>
      expect(within(dialog).queryByText("Check the format")).toBeNull(),
    );
    expect(within(dialog).queryByText("Couldn't save")).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Retry" })).toBeNull();
  });

  test("a Viewer opening M1's URL sees no dialog", async () => {
    ideasApi({ me: as("viewer") });
    renderApp(`/w/${workspaceId}/ideas?modal=new-idea`);
    await screen.findAllByRole("row");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
