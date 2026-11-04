import type { Assumption, Me, Risk, Role } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ana,
  apiError,
  type Call,
  cleanupThenRestoreFocus,
  readAgainOnFocus,
  renderApp,
  setViewport,
  stubApi,
  toastAfter,
} from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  assumption,
  home,
  risk,
  survey,
  validationId,
} from "../test/validation";

// 16 Assumptions & Risks (design-spec 6.10).

afterEach(() => {
  cleanupThenRestoreFocus();
  vi.unstubAllGlobals();
  setViewport(1024);
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
  order,
  patch,
  evidence,
  holdMe,
  holdAssumptions,
  assumptionsFail,
}: {
  /** A function is asked at each call: the user may change behind the screen. */
  me?: Me | (() => Me);
  /** A function is asked at each call: the idea may be archived behind the screen. */
  archived?: boolean | (() => boolean);
  /** Answers a new assumption or risk, later when it is a promise; undefined makes it and keeps it. */
  create?: () => Response | Promise<Response> | undefined;
  remove?: () => Response | undefined;
  /** Answers Save order, later when it is a promise; undefined orders the list. */
  order?: () => Response | Promise<Response> | undefined;
  /** Answers a save of a row's fields; undefined saves them. */
  patch?: () => Response | undefined;
  /** V5's answer to an attachment. */
  evidence?: () => Response;
  /** While it returns a promise, U1 answers once the promise settles, as it is then. */
  holdMe?: () => Promise<void> | undefined;
  /** While it returns a promise, V10's assumptions answer once it settles, as they are then. */
  holdAssumptions?: () => Promise<void> | undefined;
  /** While it returns true, V10's assumptions fail unexpectedly (500). */
  assumptionsFail?: () => boolean;
  assumptions?: Assumption[];
  risks?: Risk[];
} = {}) {
  const meNow = () => (typeof me === "function" ? me() : me);
  const archivedNow = () =>
    typeof archived === "function" ? archived() : archived;
  return stubApi((call: Call) => {
    const { method, path } = call;
    if (method === "GET" && path === "/api/v1/me") {
      const hold = holdMe?.();
      return hold === undefined
        ? Response.json(meNow())
        : hold.then(() => Response.json(meNow()));
    }
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
    if (
      method === "GET" &&
      path === listPath("assumptions") &&
      assumptionsFail?.() === true
    ) {
      return apiError(500, "INTERNAL");
    }
    if (method === "GET" && path === listPath("assumptions")) {
      const answerList = () => Response.json({ items: assumptions });
      const hold = holdAssumptions?.();
      return hold === undefined ? answerList() : hold.then(answerList);
    }
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/validations/${validationId}/research-log`)
    ) {
      return Response.json({ items: [survey], nextCursor: null });
    }
    if (
      method === "POST" &&
      path === `/api/v1/validations/${validationId}/evidence` &&
      evidence !== undefined
    ) {
      return evidence();
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
    const ordered = path.match(
      new RegExp(
        `^/api/v1/validations/${validationId}/(assumptions|risks)/order$`,
      ),
    );
    if (method === "PUT" && ordered !== null) {
      const answered = order?.();
      if (answered !== undefined) return answered;
      const { ids } = call.body as { ids: string[] };
      const rows: (Assumption | Risk)[] =
        ordered[1] === "assumptions" ? assumptions : risks;
      rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return new Response(null, { status: 204 });
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
      const refused = patch?.();
      if (refused !== undefined) return refused;
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

  test("a new row's field says why only once it changed, not when it is only left", async () => {
    const user = userEvent.setup();
    for (const [url, name] of [
      [`${base}?new=1`, /Assumption/],
      [`${base}?tab=risks&new=1`, /Risk/],
    ] as const) {
      listsApi();
      renderApp(url);
      const statement = await screen.findByRole("textbox", { name });
      // Left blank on the way to another field (or to Cancel): no reason moves the
      // buttons.
      await user.click(statement);
      await user.tab();
      expect(screen.queryByText("Can't be empty")).toBeNull();
      // Changed, it says why at once, before it is left.
      await user.type(statement, "A");
      await user.clear(statement);
      expect(screen.getByText("Can't be empty")).toBeTruthy();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test("a Viewer with empty lists: each tab says what it is for, with nothing to add", async () => {
    const user = userEvent.setup();
    listsApi({ me: as("viewer"), assumptions: [], risks: [] });
    renderApp(base);
    expect(
      await screen.findByText(
        "List what has to be true for this idea to work, and why you believe it.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add assumption/ })).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Risks" }));
    expect(
      await screen.findByText(
        "List what could go wrong, how likely it is and how much it would hurt.",
      ),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add risk/ })).toBeNull();
  });

  test("Cancel while a new row is on its way: it is made, and the user is not taken to it", async () => {
    const user = userEvent.setup();
    const listed = [believe, costs];
    let release = () => {};
    const calls = listsApi({
      assumptions: listed,
      create: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            const made = assumption(madeId, "Gift buyers come back monthly.", {
              sortOrder: 2,
            });
            listed.push(made);
            resolve(Response.json(made, { status: 201 }));
          };
        }),
    });
    const router = renderApp(`${base}?new=1`);
    await addAssumption(user);
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New assumption" }),
      ).toBeNull(),
    );
    release();
    // Made: the list is read again with it; the user stays where they went.
    const list = screen.getByRole("grid", { name: "Assumptions" });
    await waitFor(() =>
      expect(within(list).getAllByRole("row")).toHaveLength(3),
    );
    expect(
      screen.queryByRole("heading", {
        level: 2,
        name: "Gift buyers come back monthly.",
      }),
    ).toBeNull();
    expect(router.state.location.search).not.toHaveProperty("row");
  });

  test("switching tabs closes the row chosen and the new row's input", async () => {
    const user = userEvent.setup();
    listsApi();
    const router = renderApp(`${base}?row=${costs.id}`);
    await screen.findByRole("heading", { level: 2, name: costs.statement });
    await user.click(screen.getByRole("tab", { name: "Risks" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ tab: "risks" }),
    );
    expect(router.state.location.search).not.toHaveProperty("row");
    expect(
      screen.queryByRole("heading", { level: 2, name: costs.statement }),
    ).toBeNull();
    // Back on Assumptions, the first is beside the list, not the row chosen before.
    await user.click(screen.getByRole("tab", { name: "Assumptions" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: believe.statement }),
    ).toBeTruthy();
    expect(router.state.location.search).not.toHaveProperty("row");

    await user.click(
      screen.getByRole("button", { name: "Add assumption" }) as HTMLElement,
    );
    await user.type(
      await screen.findByRole("textbox", { name: /Assumption/ }),
      "Gift buyers come back monthly.",
    );
    await user.click(screen.getByRole("tab", { name: "Risks" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "New assumption" }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("heading", { name: "New risk" })).toBeNull();
    expect(router.state.location.search).not.toHaveProperty("new");
    await user.click(screen.getByRole("tab", { name: "Assumptions" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: believe.statement }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "New assumption" }),
    ).toBeNull();
    expect(
      screen
        .queryAllByRole("textbox")
        .some(
          (field) =>
            (field as HTMLTextAreaElement).value ===
            "Gift buyers come back monthly.",
        ),
    ).toBe(false);
  });

  /** Opens Reorder from Costs' ⋯ and moves it up: Save order can send. */
  const openReorder = async (user: ReturnType<typeof userEvent.setup>) => {
    const list = await screen.findByRole("grid", { name: "Assumptions" });
    await user.click(
      within(list).getByRole("button", { name: `More for ${costs.statement}` }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder assumptions",
    });
    await user.click(
      within(dialog).getByRole("button", {
        name: `Move ${costs.statement} up`,
      }),
    );
    return dialog;
  };

  test("Reorder while Save order is on its way stays open; a failure keeps the order: Couldn't save, then the small dialog for the unexpected", async () => {
    const user = userEvent.setup();
    let fail = () => {};
    let tries = 0;
    const calls = listsApi({
      order: () => {
        tries += 1;
        if (tries === 2) return apiError(500, "INTERNAL");
        return new Promise<Response>((_resolve, reject) => {
          fail = () => reject(new TypeError("Failed to fetch"));
        });
      },
    });
    renderApp(base);
    // The press outside reaches the dialog: with nothing on its way, it closes Reorder.
    await openReorder(user);
    await user.click(document.body);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder assumptions" }),
      ).toBeNull(),
    );
    const dialog = await openReorder(user);
    const kept = [costs.statement, believe.statement];
    const orderIn = () =>
      within(dialog)
        .getAllByRole("listitem")
        .map((row) => row.textContent);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    // On its way: Cancel, ×, Escape and a press outside do not close it.
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel.hasAttribute("disabled")).toBe(true));
    await user.click(cancel);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    await user.click(document.body);
    expect(
      screen.getByRole("dialog", { name: "Reorder assumptions" }),
    ).toBeTruthy();
    // The network: Couldn't save and Retry in the dialog, the order as it was moved.
    fail();
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(orderIn()).toEqual(kept);
    // Unexpected (500): the small dialog with its Ref, over the order kept.
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(small.textContent).toContain("Ref: 8f14e45f");
    expect(orderIn()).toEqual(kept);
    const [first, again] = calls.filter(({ method }) => method === "PUT");
    expect(first?.body).toEqual({ ids: [costs.id, believe.id] });
    expect(again?.body).toEqual(first?.body);
    // Close closes Reorder too; the list keeps its order.
    await user.click(within(small).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder assumptions" }),
      ).toBeNull(),
    );
    expect(
      within(screen.getByRole("grid", { name: "Assumptions" }))
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining(believe.statement),
      expect.stringContaining(costs.statement),
    ]);
  });

  /** The reads of 16's assumptions (V10). */
  const assumptionReads = (calls: Call[]) =>
    calls.filter(
      ({ method, path }) =>
        method === "GET" && path === listPath("assumptions"),
    ).length;

  test("M2's URL for a Viewer opens nothing and comes off the URL in place once 16 is read; read again as a Member, it does not open (SDD 4章)", async () => {
    let me = as("viewer");
    listsApi({ me: () => me });
    const router = renderApp(
      `${base}?tab=risks&modal=evidence&about=assumption:${believe.id}`,
    );
    const entries = router.history.length;
    await screen.findByRole("grid", { name: "Risks" });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "risks" }),
    );
    expect(router.history.length).toBe(entries);
    expect(screen.queryByRole("dialog")).toBeNull();
    me = ana;
    readAgainOnFocus();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add risk" })).toBeTruthy(),
    );
    expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull();
  });

  test("M2's URL about a risk, which takes no evidence, or an assumption not listed: nothing, and it comes off the URL", async () => {
    for (const about of [
      `risk:${rain.id}`,
      "assumption:6a1b2c3d-0000-4000-8000-0000000000ff",
    ]) {
      listsApi();
      const router = renderApp(`${base}?modal=evidence&about=${about}`);
      await screen.findByRole("grid", { name: "Assumptions" });
      await waitFor(() => expect(router.state.location.search).toEqual({}));
      expect(screen.queryByRole("dialog")).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test("M2's URL keeps its modal while the assumptions are first read, apart from 13's data, then opens", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = listsApi({ holdAssumptions: () => held });
    const router = renderApp(
      `${base}?modal=evidence&about=assumption:${believe.id}`,
    );
    await waitFor(() => expect(assumptionReads(calls)).toBeGreaterThan(0));
    // The risks and the screen's data are read; the assumptions are not yet.
    await screen.findByRole("heading", {
      level: 1,
      name: "09 Assumptions & Risks",
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.search).toMatchObject({
      modal: "evidence",
      about: `assumption:${believe.id}`,
    });
    release();
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain(believe.statement);
  });

  test("a role being read again does not decide M2: the Viewer cached is read again as an Owner, and M2 opens", async () => {
    let reads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    listsApi({
      me: () => (reads <= 1 ? as("viewer") : ana),
      // The route reads U1 first; the screen's frame reads it again as it mounts.
      holdMe: () => {
        reads += 1;
        return reads === 1 ? undefined : held;
      },
    });
    const router = renderApp(
      `${base}?modal=evidence&about=assumption:${believe.id}`,
    );
    await screen.findByRole("heading", { level: 2, name: believe.statement });
    expect(screen.queryByRole("button", { name: /Add assumption/ })).toBeNull();
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.search).toMatchObject({ modal: "evidence" });
    release();
    expect(
      await screen.findByRole("dialog", { name: "Evidence" }),
    ).toBeTruthy();
  });

  test("M2 open stays once its assumption is deleted meanwhile, and an attachment shows the refusal in it", async () => {
    const user = userEvent.setup();
    const listed = [believe, costs];
    listsApi({
      assumptions: listed,
      evidence: () => apiError(404, "NOT_FOUND"),
    });
    renderApp(`${base}?modal=evidence&about=assumption:${believe.id}`);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    listed.splice(listed.indexOf(believe), 1);
    readAgainOnFocus();
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("grid", { name: "Assumptions", hidden: true }),
        ).getAllByRole("row", { hidden: true }),
      ).toHaveLength(1),
    );
    expect(sheet.isConnected).toBe(true);
    expect(sheet.textContent).toContain(believe.statement);
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() => expect(sheet.textContent).toContain("Couldn't save"));
    expect(sheet.textContent).toContain("It no longer exists");
  });

  test("a phone's Edit assumption stays open once the idea is archived meanwhile, its refused save shown in it (design-spec 6.0.6)", async () => {
    setViewport(390);
    const user = userEvent.setup();
    let archived = false;
    listsApi({
      archived: () => archived,
      patch: () => {
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(`${base}?row=${believe.id}`);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const sheet = await screen.findByRole("dialog", {
      name: "Edit assumption",
    });
    await user.type(
      within(sheet).getByRole("textbox", { name: "Next Check" }),
      "Trial week",
    );
    // Saved after the pause; refused, the screen reads again: archived, the detail
    // behind has no Edit.
    await waitFor(
      () => expect(screen.queryByRole("button", { name: "Edit" })).toBeNull(),
      { timeout: 3000 },
    );
    expect(sheet.isConnected).toBe(true);
    expect(sheet.textContent).toContain("Couldn't save");
    expect(sheet.textContent).toContain("It's archived");
    expect(
      (
        within(sheet).getByRole("textbox", {
          name: "Next Check",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Trial week");
  });

  /** Presses Cancel once the new row's Add is on its way: the form closes. */
  const cancelWhileSending = async (
    user: ReturnType<typeof userEvent.setup>,
    calls: Call[],
    heading: string,
  ) => {
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: heading })).toBeNull(),
    );
  };

  test("Cancel while a new assumption is on its way, then the network fails: Couldn't save and Retry in a toast; Retry sends it again and it is listed (6.0.6)", async () => {
    const user = userEvent.setup();
    let fail = () => {};
    let tries = 0;
    const calls = listsApi({
      create: () => {
        tries += 1;
        if (tries > 1) return undefined;
        return new Promise<Response>((_resolve, reject) => {
          fail = () => reject(new TypeError("Failed to fetch"));
        });
      },
    });
    const router = renderApp(`${base}?new=1`);
    await addAssumption(user);
    await cancelWhileSending(user, calls, "New assumption");
    const toast = await toastAfter("Couldn't save", async () => fail());
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    const list = screen.getByRole("grid", { name: "Assumptions" });
    await waitFor(() =>
      expect(
        within(list).getByRole("row", {
          name: /Gift buyers come back monthly\./,
        }),
      ).toBeTruthy(),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({
      statement: "Gift buyers come back monthly.",
    });
    expect(again?.body).toEqual(first?.body);
    expect(router.state.location.search).not.toHaveProperty("row");
  });

  test("Cancel while a new assumption is on its way, then it is refused as archived: the reason in a toast without Retry, and 16 reads again", async () => {
    const user = userEvent.setup();
    let release = () => {};
    let archived = false;
    const calls = listsApi({
      archived: () => archived,
      create: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            archived = true;
            resolve(apiError(409, "ARCHIVED"));
          };
        }),
    });
    renderApp(`${base}?new=1`);
    await addAssumption(user);
    await cancelWhileSending(user, calls, "New assumption");
    const toast = await toastAfter("Couldn't save. It's archived.", async () =>
      release(),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add assumption/ })).toBeNull();
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  test("Cancel while a new risk is on its way, then an unexpected failure: Something went wrong with its Ref in a toast, and Retry sends it again", async () => {
    const user = userEvent.setup();
    let release = () => {};
    let tries = 0;
    const calls = listsApi({
      create: () => {
        tries += 1;
        if (tries > 1) return undefined;
        return new Promise<Response>((resolve) => {
          release = () => resolve(apiError(500, "INTERNAL"));
        });
      },
    });
    renderApp(`${base}?tab=risks&new=1`);
    await user.type(
      await screen.findByRole("textbox", { name: /Risk/ }),
      "The landlord raises the rent.",
    );
    await user.click(
      screen.getAllByRole("button", { name: "Add risk" }).at(-1) as HTMLElement,
    );
    await cancelWhileSending(user, calls, "New risk");
    const toast = await toastAfter(
      "Something went wrong. Ref: 8f14e45f",
      async () => release(),
    );
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.path).toBe(listPath("risks"));
    expect(again?.path).toBe(listPath("risks"));
    expect(again?.body).toEqual(first?.body);
  });

  test("`new=1` for a Viewer: no new row, and it comes off the URL in place, the tab kept; read again as a Member, none opens (SDD 4章)", async () => {
    let me = as("viewer");
    listsApi({ me: () => me });
    const router = renderApp(`${base}?tab=risks&new=1`);
    const entries = router.history.length;
    await screen.findByRole("grid", { name: "Risks" });
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ tab: "risks" }),
    );
    expect(router.history.length).toBe(entries);
    expect(screen.queryByRole("heading", { name: "New risk" })).toBeNull();
    me = ana;
    readAgainOnFocus();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Add risk" })).toBeTruthy(),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("heading", { name: "New risk" })).toBeNull();
  });

  test("a role being read again does not decide `new=1`: the Viewer cached is read again as an Owner, and New assumption opens", async () => {
    let reads = 0;
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    listsApi({
      me: () => (reads <= 1 ? as("viewer") : ana),
      // The route reads U1 first; the screen's frame reads it again as it mounts.
      holdMe: () => {
        reads += 1;
        return reads === 1 ? undefined : held;
      },
    });
    const router = renderApp(`${base}?new=1`);
    await screen.findByRole("heading", { level: 2, name: believe.statement });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.search).toMatchObject({ new: 1 });
    expect(
      screen.queryByRole("heading", { name: "New assumption" }),
    ).toBeNull();
    release();
    expect(
      await screen.findByRole("heading", { name: "New assumption" }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ new: 1 });
  });

  test("a read again of the list that fails leaves the rows and the row shown, not the failure (as 13)", async () => {
    let fails = false;
    const calls = listsApi({ assumptionsFail: () => fails });
    renderApp(base);
    const list = await screen.findByRole("grid", { name: "Assumptions" });
    await screen.findByRole("heading", { level: 2, name: believe.statement });
    fails = true;
    const reads = assumptionReads(calls);
    readAgainOnFocus();
    await waitFor(() => expect(assumptionReads(calls)).toBeGreaterThan(reads));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByRole("grid", { name: "Assumptions" })).toBe(list);
    expect(within(list).getAllByRole("row")).toHaveLength(2);
    expect(
      screen.getByRole("heading", { level: 2, name: believe.statement }),
    ).toBeTruthy();
  });
});
