import type { Assumption, Me, Risk, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import { assumption, home, risk, validationId } from "../test/validation";

// 16 Assumptions & Risks (design-spec 6.10).

afterEach(() => {
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/assumptions`;
const listPath = (list: string) =>
  `/api/v1/validations/${validationId}/${list}`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const believe = assumption(
  "6a1b2c3d-0000-4000-8000-000000000001",
  "Workers order twice a week.",
  { confidence: "low", sortOrder: 0 },
);
const costs = assumption(
  "6a1b2c3d-0000-4000-8000-000000000002",
  "Ingredients cost 35% of the price.",
  { sortOrder: 1 },
);
const rain = risk(
  "7a1b2c3d-0000-4000-8000-000000000001",
  "Lunch demand drops on rainy days.",
  { probability: "high", impact: "medium" },
);
const prices = risk(
  "7a1b2c3d-0000-4000-8000-000000000002",
  "Ingredient prices rise.",
  { probability: "medium", impact: "high" },
);

/** The id the fake API gives a new assumption. */
const madeId = "6a1b2c3d-0000-4000-8000-000000000009";

/** The API of 16 over the two lists. */
function listsApi({
  me = ana,
  archived = false,
  assumptions = [believe, costs],
  risks = [prices, rain],
  remove,
}: {
  me?: Me;
  archived?: boolean;
  remove?: () => Response | undefined;
  assumptions?: Assumption[];
  risks?: Risk[];
} = {}) {
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") return Response.json(me);
    if (method === "PATCH" && path === "/api/v1/me") return Response.json(me);
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({ ...home, idea: { ...home.idea, archived } });
    }
    if (method === "GET" && path === listPath("assumptions")) {
      return Response.json({ items: assumptions });
    }
    if (method === "GET" && path === listPath("risks")) {
      return Response.json({ items: risks });
    }
    if (method === "POST" && path === listPath("assumptions")) {
      const made = assumption(
        madeId,
        (call.body as { statement: string }).statement,
        {
          ...(call.body as Partial<Assumption>),
          sortOrder: assumptions.length,
        },
      );
      assumptions.push(made);
      return Response.json(made, { status: 201 });
    }
    const one = path.match(/^\/api\/v1\/(assumptions|risks)\/([\w-]+)$/);
    if (one !== null && method === "DELETE") {
      const refused = remove?.();
      if (refused !== undefined) return refused;
      const rows: (Assumption | Risk)[] =
        one[1] === "assumptions" ? assumptions : risks;
      const index = rows.findIndex(({ id }) => id === one[2]);
      if (index === -1) return undefined;
      rows.splice(index, 1);
      return new Response(null, { status: 204 });
    }
    if (one !== null && method === "PATCH") {
      const rows: (Assumption | Risk)[] =
        one[1] === "assumptions" ? assumptions : risks;
      const found = rows.find(({ id }) => id === one[2]);
      if (found === undefined) return undefined;
      const { lockVersion: _, ...fields } = call.body as Record<
        string,
        unknown
      >;
      return Response.json({
        ...found,
        ...fields,
        lockVersion: found.lockVersion + 1,
      });
    }
    return undefined;
  });
}

describe("16 Assumptions & Risks (design-spec 6.10)", () => {
  test("the assumptions, the first beside them, its fields saved as typed", async () => {
    const user = userEvent.setup();
    const calls = listsApi();
    renderApp(base);
    const list = await screen.findByRole("grid", { name: "Assumptions" });
    expect(within(list).getAllByRole("row")).toHaveLength(2);
    expect(list.textContent).toContain("Low confidence");
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Workers order twice a week.",
      }),
    ).toBeTruthy();
    const next = screen.getByRole("textbox", { name: "Next Check" });
    await user.type(next, "Trial week");
    await user.tab();
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path, body }) =>
            method === "PATCH" &&
            path === `/api/v1/assumptions/${believe.id}` &&
            (body as { nextCheck?: string }).nextCheck === "Trial week",
        ),
      ).toBe(true),
    );
  });

  test("Risks: in the API's order, with Impact and Probability; a new Impact reads the list again", async () => {
    const user = userEvent.setup();
    const calls = listsApi();
    renderApp(`${base}?tab=risks`);
    const list = await screen.findByRole("grid", { name: "Risks" });
    const rows = within(list).getAllByRole("row");
    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Ingredient prices rise."),
      expect.stringContaining("Lunch demand drops on rainy days."),
    ]);
    expect(rows[0]?.textContent).toContain("Impact High · Probability Medium");
    expect(
      screen.getByRole("tab", { name: "Risks" }).getAttribute("aria-selected"),
    ).toBe("true");
    const reads = () =>
      calls.filter(
        ({ method, path }) => method === "GET" && path === listPath("risks"),
      ).length;
    const before = reads();
    await user.click(screen.getByRole("button", { name: /Impact/ }));
    await user.click(await screen.findByRole("option", { name: "Low" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        impact: "low",
        lockVersion: 1,
      }),
    );
    await waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  test("a new assumption: the statement first, then the row it made, shown beside the list", async () => {
    const user = userEvent.setup();
    const calls = listsApi();
    const router = renderApp(`${base}?new=1`);
    const statement = await screen.findByRole("textbox", {
      name: /Assumption/,
    });
    const add = screen
      .getAllByRole("button", { name: "Add assumption" })
      .at(-1) as HTMLElement;
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.type(statement, "Gift buyers come back monthly.");
    await user.click(screen.getByRole("radio", { name: "High" }));
    await user.click(add);
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toMatchObject(
        {
          statement: "Gift buyers come back monthly.",
          confidence: "high",
        },
      ),
    );
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Gift buyers come back monthly.",
      }),
    ).toBeTruthy();
    // Shown from the list at once, not "Not found" while the list is read again.
    expect(screen.queryByText(/Not found/)).toBeNull();
    expect(router.state.location.search).toMatchObject({ row: madeId });
  });

  test("Clear leaves the confidence unset; Delete asks, then the row goes", async () => {
    const user = userEvent.setup();
    const calls = listsApi();
    const router = renderApp(`${base}?row=${believe.id}`);
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        confidence: null,
        lockVersion: 1,
      }),
    );
    const detail = screen.getAllByRole("button", {
      name: "More for Workers order twice a week.",
    });
    await user.click(detail.at(-1) as HTMLElement);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this assumption?",
    });
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        within(screen.getByRole("grid", { name: "Assumptions" })).getAllByRole(
          "row",
        ),
      ).toHaveLength(1),
    );
    expect(
      calls.some(
        ({ method, path }) =>
          method === "DELETE" && path === `/api/v1/assumptions/${believe.id}`,
      ),
    ).toBe(true);
    expect(router.state.location.search).not.toHaveProperty("row");
  });

  test("deleting another row from the list keeps the row shown", async () => {
    const user = userEvent.setup();
    listsApi();
    const router = renderApp(`${base}?row=${believe.id}`);
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    const list = screen.getByRole("grid", { name: "Assumptions" });
    await user.click(
      within(list).getByRole("button", {
        name: "More for Ingredients cost 35% of the price.",
      }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Delete this assumption?",
        }),
      ).getByRole("button", { name: "Delete" }),
    );
    await waitFor(() =>
      expect(within(list).getAllByRole("row")).toHaveLength(1),
    );
    expect(router.state.location.search).toMatchObject({ row: believe.id });
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Workers order twice a week.",
      }),
    ).toBeTruthy();
  });

  test("a Viewer reads: no adding, no ⋯, no fields", async () => {
    listsApi({ me: as("viewer") });
    renderApp(base);
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    expect(screen.queryByRole("button", { name: /Add assumption/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("link", { name: "Add evidence" })).toBeNull();
    expect(screen.getByText("Low")).toBeTruthy();
  });

  test("none yet: each list says what it is for", async () => {
    const user = userEvent.setup();
    listsApi({ assumptions: [], risks: [] });
    renderApp(base);
    expect(
      await screen.findByText(
        "List what has to be true for this idea to work, and why you believe it.",
      ),
    ).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Risks" }));
    expect(
      await screen.findByText(
        "List what could go wrong, how likely it is and how much it would hurt.",
      ),
    ).toBeTruthy();
  });

  test("a row of the other list, or gone: Not found beside the list", async () => {
    listsApi();
    renderApp(`${base}?row=${rain.id}`);
    expect(await screen.findByText(/Not found/)).toBeTruthy();
  });

  test("an archived idea: the notice with Restore, and 16 reads only", async () => {
    listsApi({ archived: true });
    renderApp(`${base}?modal=evidence&about=assumption:${believe.id}`);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    expect(screen.queryByRole("button", { name: /Add assumption/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /More for/ })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // M2's URL opens nothing on an archived idea.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a delete that failed: Retry from the toast deletes the row and closes it", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = listsApi({
      remove: () => {
        tries += 1;
        return tries === 1 ? apiError(500, "INTERNAL") : undefined;
      },
    });
    const router = renderApp(`${base}?row=${believe.id}`);
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    const detail = screen.getAllByRole("button", {
      name: "More for Workers order twice a week.",
    });
    await user.click(detail.at(-1) as HTMLElement);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: "Delete this assumption?",
        }),
      ).getByRole("button", { name: "Delete" }),
    );
    const words = await screen.findByText(/Something went wrong/);
    const toast = words.closest<HTMLElement>('[role="alertdialog"]');
    if (toast === null) throw new Error("not in a toast");
    expect(router.state.location.search).toMatchObject({ row: believe.id });
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("row"),
    );
    expect(calls.filter(({ method }) => method === "DELETE")).toHaveLength(2);
  });
});
