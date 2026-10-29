import type { Assumption, Me, Risk, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  type Call,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
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
  create,
  remove,
}: {
  /** A function is asked at each call: the user may change behind the screen. */
  me?: Me | (() => Me);
  /** A function is asked at each call: the idea may be archived behind the screen. */
  archived?: boolean | (() => boolean);
  /** Answers a new assumption or risk; undefined makes it and keeps it. */
  create?: () => Response | undefined;
  remove?: () => Response | undefined;
  assumptions?: Assumption[];
  risks?: Risk[];
} = {}) {
  const meNow = () => (typeof me === "function" ? me() : me);
  const archivedNow = () =>
    typeof archived === "function" ? archived() : archived;
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me")
      return Response.json(meNow());
    if (method === "PATCH" && path === "/api/v1/me") {
      return Response.json(meNow());
    }
    if (
      method === "GET" &&
      path === `/api/v1/ideas/${home.idea.id}/validation`
    ) {
      return Response.json({
        ...home,
        idea: { ...home.idea, archived: archivedNow() },
      });
    }
    if (method === "GET" && path === listPath("assumptions")) {
      return Response.json({ items: assumptions });
    }
    if (method === "GET" && path === listPath("risks")) {
      return Response.json({ items: risks });
    }
    if (method === "POST" && path === listPath("assumptions")) {
      if (create !== undefined) {
        const answered = create();
        if (answered !== undefined) return answered;
      }
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
    if (method === "POST" && path === listPath("risks")) {
      if (create !== undefined) {
        const answered = create();
        if (answered !== undefined) return answered;
      }
      const made = risk(
        madeId,
        (call.body as { statement: string }).statement,
        {
          ...(call.body as Partial<Risk>),
        },
      );
      risks.push(made);
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

  test("a row's 💬 opens its thread in the comments panel (design-spec 6.0.4)", async () => {
    const user = userEvent.setup();
    listsApi();
    const router = renderApp(`${base}?row=${believe.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: `Comments on Assumptions · ${believe.statement}`,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        row: believe.id,
        panel: "comments",
        target: `assumption:${believe.id}`,
      }),
    );
  });

  test("a row's 🕘 opens its changes in the history panel (design-spec 6.0.5)", async () => {
    const user = userEvent.setup();
    listsApi();
    const router = renderApp(`${base}?row=${believe.id}`);
    await user.click(
      await screen.findByRole("button", {
        name: `History of Assumptions · ${believe.statement}`,
      }),
    );
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        row: believe.id,
        panel: "history",
        target: `assumption:${believe.id}`,
      }),
    );
  });
  /** Types an assumption into the new row and presses Add assumption. */
  const addAssumption = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(
      await screen.findByRole("textbox", { name: /Assumption/ }),
      "Gift buyers come back monthly.",
    );
    await user.click(
      screen
        .getAllByRole("button", { name: "Add assumption" })
        .at(-1) as HTMLElement,
    );
  };

  test("a new row and the network: Couldn't save and Retry, which sends what is typed again", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = listsApi({
      create: () => {
        tries += 1;
        if (tries === 1) throw new TypeError("Failed to fetch");
        return undefined;
      },
    });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("heading", {
        level: 2,
        name: "Gift buyers come back monthly.",
      }),
    ).toBeTruthy();
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({
      statement: "Gift buyers come back monthly.",
    });
    expect(again?.body).toEqual(first?.body);
  });

  test("a new row over the rate limit: the wait, and what is typed stays", async () => {
    const user = userEvent.setup();
    listsApi({
      create: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
    });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Too many attempts. Try again in 1 minute.");
    expect(
      (
        screen.getByRole("textbox", {
          name: /Assumption/,
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Gift buyers come back monthly.");
  });

  test("a new row and an unexpected failure: Something went wrong with its Ref, and Retry in place", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = listsApi({
      create: () => {
        tries += 1;
        return tries === 1 ? apiError(500, "INTERNAL") : undefined;
      },
    });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Something went wrong");
    // The request id's first 8 characters (SDD 8.2), not the whole id.
    expect(alert.textContent).toContain("Ref: 8f14e45f");
    expect(alert.textContent).not.toContain("8f14e45f-");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(again?.body).toEqual(first?.body);
  });

  test("a new row the API refused for a field: Couldn't save with the reason, and Check the format under the field", async () => {
    const user = userEvent.setup();
    listsApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "nextCheck", message: "Too long" }],
        }),
    });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("Check the format");
    const next = screen.getByRole("textbox", { name: "Next Check" });
    const described = (next.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Check the format");
  });

  test("a new row refused as the idea is archived meanwhile: 16 reads again, archived", async () => {
    const user = userEvent.setup();
    let archived = false;
    listsApi({
      archived: () => archived,
      create: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    const router = renderApp(`${base}?new=1`);
    await addAssumption(user);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    // The list's + Add goes; the form stays to read, with what was typed and why.
    await waitFor(() =>
      expect(
        screen.queryAllByRole("button", { name: "Add assumption" }),
      ).toHaveLength(1),
    );
    expect(
      screen.getByRole("heading", { name: "New assumption" }),
    ).toBeTruthy();
    const statement = screen.getByRole("textbox", { name: /Assumption/ });
    expect((statement as HTMLTextAreaElement).value).toBe(
      "Gift buyers come back monthly.",
    );
    expect(statement.hasAttribute("readonly")).toBe(true);
    const alert = screen
      .getAllByRole("alert")
      .find(
        (each) =>
          each.textContent?.includes("Couldn't save") === true &&
          within(each).queryByRole("button", { name: "Retry" }) !== null,
      );
    if (alert === undefined) throw new Error("no Couldn't save");
    expect(alert.textContent).toContain("It's archived");
    expect(
      within(alert)
        .getByRole("button", { name: "Retry" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Add assumption" })
        .hasAttribute("disabled"),
    ).toBe(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New assumption" }),
      ).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("new");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  test("a new risk the API refused for a field: Couldn't save with the reason, and Check the format under the field", async () => {
    const user = userEvent.setup();
    listsApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "mitigation", message: "Too long" }],
        }),
    });
    renderApp(`${base}?tab=risks&new=1`);
    await user.type(
      await screen.findByRole("textbox", { name: /Risk/ }),
      "The landlord raises the rent.",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Add risk" }).at(-1) as HTMLElement,
    );
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("Check the format");
    const mitigation = screen.getByRole("textbox", { name: "Mitigation" });
    const described = (mitigation.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Check the format");
  });

  test("a delete refused once the user is a Viewer: the reason without Retry, then 16 reads only (6.0.6)", async () => {
    const user = userEvent.setup();
    let me = ana;
    listsApi({
      me: () => me,
      remove: () => {
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(`${base}?row=${believe.id}`);
    await screen.findByRole("heading", {
      level: 2,
      name: "Workers order twice a week.",
    });
    const detail = screen.getAllByRole("button", {
      name: "More for Workers order twice a week.",
    });
    await user.click(detail.at(-1) as HTMLElement);
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this assumption?",
    });
    const toast = await toastAfter(
      "Couldn't save. You don't have access to this.",
      () =>
        user.click(within(question).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /More for/ })).toBeNull(),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Workers order twice a week.",
      }),
    ).toBeTruthy();
  });
  test("a new row refused as gone (404): locked at once, with what was typed and why; nothing more is sent", async () => {
    const user = userEvent.setup();
    const calls = listsApi({ create: () => apiError(404, "NOT_FOUND") });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    expect(await screen.findByText("It no longer exists")).toBeTruthy();
    // Read again, the screen still lets the user add: the refusal itself locks the form.
    const statement = screen.getByRole("textbox", { name: /Assumption/ });
    expect((statement as HTMLTextAreaElement).value).toBe(
      "Gift buyers come back monthly.",
    );
    expect(statement.hasAttribute("readonly")).toBe(true);
    const alert = screen
      .getAllByRole("alert")
      .find(
        (each) =>
          each.textContent?.includes("Couldn't save") === true &&
          within(each).queryByRole("button", { name: "Retry" }) !== null,
      );
    if (alert === undefined) throw new Error("no Couldn't save");
    expect(alert.textContent).toContain("It no longer exists");
    expect(
      within(alert)
        .getByRole("button", { name: "Retry" })
        .hasAttribute("disabled"),
    ).toBe(true);
    const add = screen
      .getAllByRole("button", { name: "Add assumption" })
      .at(-1) as HTMLElement;
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.click(add);
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });
});
