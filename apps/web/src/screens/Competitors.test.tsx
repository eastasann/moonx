import type { Competitor, Me, Role, ValidationAnswer } from "@moonx/schemas";
import { createBrowserHistory, RouterProvider } from "@tanstack/react-router";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HELD_SEND_LIMIT_MS } from "../lib/send";
import { createAppRouter } from "../router";
import {
  ana,
  apiError,
  type Call,
  cleanupThenRestoreFocus,
  readAgainOnFocus,
  renderApp,
  stubApi,
  toastAfter,
} from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  competitor,
  evidenceOf,
  home,
  prices,
  question,
  survey,
  validationId,
} from "../test/validation";

// 15 Competitors (design-spec 6.10・6.0.3).

afterEach(() => {
  cleanupThenRestoreFocus();
  vi.unstubAllGlobals();
});

const base = `/w/${workspaceId}/ideas/${home.idea.id}/competitors`;
const listPath = `/api/v1/validations/${validationId}/competitors`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const salad = competitor(
  "8a1b2c3d-0000-4000-8000-000000000001",
  "Salad Station",
  {
    type: "direct",
    typicalPrice: 240,
    priceNote: "per bowl",
    strength: "Prime location",
    evidence: [
      {
        id: "9a1b2c3d-0000-4000-8000-000000000001",
        kind: "url",
        researchLog: null,
        url: "https://example.com/menu",
        note: null,
      },
    ],
    sortOrder: 0,
  },
);
const prep = competitor(
  "8a1b2c3d-0000-4000-8000-000000000002",
  "Home meal prep",
  {
    type: "substitute",
    unresolvedThreadCount: 2,
    sortOrder: 1,
  },
);

const survivor = question(
  "V.04.SURVIVOR_PATTERNS",
  "Survivor Patterns",
  "Survivor Patterns",
);
const failure = question(
  "V.04.FAILURE_PATTERNS",
  "Failure Patterns",
  "Failure Patterns",
);

/** The id the fake API gives a new competitor. */
const madeId = "8a1b2c3d-0000-4000-8000-000000000009";

/** The API of 15 over `items`; `order` may refuse. */
function competitorsApi({
  me = ana,
  items = [salad, prep],
  archived = false,
  guidance = { min: 3, max: 5 },
  patterns = [
    { question: survivor, answer: answer(survivor.key) },
    { question: failure, answer: answer(failure.key) },
  ],
  order,
  evidence,
  removeEvidence,
  create,
  remove,
  restore,
  holdList,
  listFails,
  patch,
}: {
  /** A function is asked at each call: the user may change behind the screen. */
  me?: Me | (() => Me);
  items?: Competitor[];
  /** A function is asked at each call: the idea may be archived behind the screen. */
  archived?: boolean | (() => boolean);
  guidance?: { min: number; max: number };
  patterns?: { question: typeof survivor; answer: ValidationAnswer }[];
  /** Answers Save order, later when it is a promise; undefined orders the list. */
  order?: () => Response | Promise<Response> | undefined;
  /** V5's answer to an attachment. */
  evidence?: (call: Call) => Response;
  /** V5's answer to a removal of evidence. */
  removeEvidence?: (call: Call) => Response;
  /** Answers New competitor's send; undefined makes the competitor and keeps it. */
  create?: () => Response | Promise<Response> | undefined;
  /** Answers a delete; undefined deletes. */
  remove?: () => Response | undefined;
  /** Restores the idea (6.8's Restore). */
  restore?: () => void;
  /** While it returns a promise, V8 answers once the promise settles, as it is then. */
  holdList?: () => Promise<void> | undefined;
  /** While it returns true, V8 fails unexpectedly (500). */
  listFails?: () => boolean;
  /** Answers a save of a competitor's fields; undefined saves them. */
  patch?: () => Response | undefined;
} = {}) {
  // The test's own array, so it can change the list behind the screen.
  const held = items;
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
    if (
      method === "POST" &&
      path === `/api/v1/ideas/${home.idea.id}/restore` &&
      restore !== undefined
    ) {
      restore();
      return Response.json({ ...home.idea, archived: false });
    }
    if (method === "GET" && path === listPath && listFails?.() === true) {
      return apiError(500, "INTERNAL");
    }
    if (method === "GET" && path === listPath) {
      const answerList = () =>
        Response.json({ items: held, patterns, guidance });
      const hold = holdList?.();
      return hold === undefined ? answerList() : hold.then(answerList);
    }
    if (method === "POST" && path === listPath) {
      const answered = create?.();
      if (answered !== undefined) return answered;
      const made = competitor(madeId, (call.body as { name: string }).name, {
        ...(call.body as Partial<Competitor>),
        sortOrder: held.length,
      });
      held.push(made);
      return Response.json(made, { status: 201 });
    }
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/validations/${validationId}/research-log`)
    ) {
      return Response.json({ items: [survey, prices], nextCursor: null });
    }
    if (
      method === "POST" &&
      path === `/api/v1/validations/${validationId}/evidence` &&
      evidence !== undefined
    ) {
      return evidence(call);
    }
    if (
      method === "DELETE" &&
      path.startsWith("/api/v1/evidence/") &&
      removeEvidence !== undefined
    ) {
      return removeEvidence(call);
    }
    if (method === "PUT" && path === `${listPath}/order`) {
      const answered = order?.();
      if (answered !== undefined) return answered;
      const { ids } = call.body as { ids: string[] };
      held.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      return new Response(null, { status: 204 });
    }
    const answerPath = path.match(
      new RegExp(`^/api/v1/validations/${validationId}/answers/(.+)$`),
    );
    if (method === "PUT" && answerPath !== null) {
      const key = decodeURIComponent(answerPath[1] ?? "");
      const { lockVersion, ...fields } = call.body as {
        lockVersion: number;
        text?: string;
      };
      return Response.json(
        answer(key, { ...fields, lockVersion: lockVersion + 1 }),
      );
    }
    const one = path.match(/^\/api\/v1\/competitors\/([\w-]+)$/);
    const found = held.find(({ id }) => id === one?.[1]);
    if (one !== null && found !== undefined) {
      if (method === "PATCH") {
        const refused = patch?.();
        if (refused !== undefined) return refused;
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
      if (method === "DELETE") {
        const refused = remove?.();
        if (refused !== undefined) return refused;
        held.splice(held.indexOf(found), 1);
        return new Response(null, { status: 204 });
      }
    }
    return undefined;
  });
}

const cardsOf = () =>
  within(screen.getByRole("grid", { name: "Competitors" }))
    .getAllByRole("row")
    .filter((row) => !row.textContent?.includes("Add competitor"));

describe("15 Competitors (design-spec 6.10)", () => {
  test("the cards in order: type, price, details, sources and open threads; the count and its aim", async () => {
    competitorsApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", { level: 1, name: "04 Competitors" }),
    ).toBeTruthy();
    expect(screen.getByText("2 competitors · aim for 3–5")).toBeTruthy();
    const [first, second] = cardsOf();
    expect(first?.textContent).toContain("Direct Competitor");
    expect(first?.textContent).toContain("Salad Station");
    expect(first?.textContent).toContain("₱240");
    expect(first?.textContent).toContain("per bowl");
    expect(first?.textContent).toContain("Prime location");
    expect(first?.textContent).toContain("1 source");
    expect(second?.textContent).toContain("No price");
    expect(second?.textContent).toContain("No sources");
    expect(second?.textContent).toContain("2 open comment threads");
    await waitFor(() =>
      expect(document.title).toBe("04 Competitors · BCDX · moonx"),
    );
  });

  test("a card opens its dialog, which saves as typed; Back's way closes it", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi();
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(screen.getByText("Salad Station"));
    const dialog = await screen.findByRole("dialog", {
      name: "Edit competitor",
    });
    expect(router.state.location.search).toMatchObject({ row: salad.id });
    expect(
      within(dialog).getByRole("row", { name: /example\.com\/menu/ }),
    ).toBeTruthy();
    const weakness = within(dialog).getByRole("textbox", { name: "Weakness" });
    await user.type(weakness, "Slow");
    await user.tab();
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        weakness: "Slow",
        lockVersion: 1,
      }),
    );
    // A price that is no amount is not sent, and says why.
    const price = within(dialog).getByRole("textbox", {
      name: "Typical Price",
    });
    await user.clear(price);
    await user.type(price, "1,5");
    expect(
      within(dialog).getByText("Enter a number such as 1,500.50"),
    ).toBeTruthy();
    await user.clear(price);
    await user.type(price, "1,500.50");
    await user.tab();
    await waitFor(() =>
      expect(
        calls
          .filter(({ method }) => method === "PATCH")
          .map(({ body }) => body),
      ).toContainEqual({ typicalPrice: 1500.5, lockVersion: 2 }),
    );
    await user.click(within(dialog).getByRole("button", { name: /Close/ }));
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("row"),
    );
  });

  test("Add competitor: Name first, then the competitor it made, in its dialog", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi();
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getAllByRole("button", {
        name: "Add competitor",
      })[0] as HTMLElement,
    );
    const dialog = await screen.findByRole("dialog", {
      name: "New competitor",
    });
    const add = within(dialog).getByRole("button", { name: "Add competitor" });
    expect(add.hasAttribute("disabled")).toBe(true);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Bowl & Co",
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Typical Price" }),
      "260",
    );
    await user.click(add);
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toMatchObject(
        {
          name: "Bowl & Co",
          typicalPrice: 260,
          type: null,
        },
      ),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    // Made, it opens in its own dialog, where its evidence is attached.
    const made = await screen.findByRole("dialog", { name: "Edit competitor" });
    expect(
      (within(made).getByRole("textbox", { name: /Name/ }) as HTMLInputElement)
        .value,
    ).toBe("Bowl & Co");
    expect(
      within(made).getByRole("link", { name: "Add evidence" }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ row: madeId });
    expect(screen.getByText("3 competitors · aim for 3–5")).toBeTruthy();
  });

  test("Add evidence opens M2 on the card; what it attaches shows on the card, a deleted log's link does not", async () => {
    const user = userEvent.setup();
    const attached = evidenceOf("7d0f0000-0000-4000-8000-000000000003", survey);
    const calls = competitorsApi({
      evidence: () =>
        Response.json(
          {
            evidence: attached,
            classification: {
              fau: null,
              confidence: null,
              state: "unclassified",
              evidence: [
                ...salad.evidence,
                attached,
                evidenceOf(
                  "7d0f0000-0000-4000-8000-000000000004",
                  prices,
                  true,
                ),
              ],
            },
            lockVersion: 2,
          },
          { status: 201 },
        ),
    });
    renderApp(`${base}?row=${salad.id}`);
    const dialog = await screen.findByRole("dialog", {
      name: "Edit competitor",
    });
    await user.click(
      within(dialog).getByRole("link", { name: "Add evidence" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain("Competitors · Salad Station");
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({
        target: { type: "competitor", id: salad.id, key: null },
        lockVersion: salad.lockVersion,
        researchLogEntryId: survey.id,
      }),
    );
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull(),
    );
    const evidence = within(dialog).getByRole("grid", { name: "Evidence" });
    expect(
      within(evidence)
        .getAllByRole("row")
        .map((row) => row.textContent),
    ).toEqual([
      expect.stringContaining("example.com/menu"),
      expect.stringContaining("Lunch survey"),
    ]);
    expect(cardsOf()[0]?.textContent).toContain("2 sources");
  });

  test("Reorder sends every card in the new order; Delete asks first", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi();
    renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getByRole("button", { name: "More for Home meal prep" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder competitors",
    });
    const save = within(dialog).getByRole("button", { name: "Save order" });
    expect(save.hasAttribute("disabled")).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: "Move Home meal prep up" }),
    );
    await user.click(save);
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PUT")?.body).toEqual({
        ids: [prep.id, salad.id],
      }),
    );
    await waitFor(() =>
      expect(cardsOf()[0]?.textContent).toContain("Home meal prep"),
    );

    await user.click(
      screen.getByRole("button", { name: "More for Salad Station" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this competitor?",
    });
    expect(question.textContent).toContain(
      "You can restore it from the history.",
    );
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(cardsOf()).toHaveLength(1));
    expect(
      calls.some(
        ({ method, path }) =>
          method === "DELETE" && path === `/api/v1/competitors/${salad.id}`,
      ),
    ).toBe(true);
  });

  test("the list changed while ordering: read again, started from it, and told so", async () => {
    const user = userEvent.setup();
    const bowl = competitor(madeId, "Bowl & Co", { sortOrder: 2 });
    const listed = [salad, prep];
    const calls = competitorsApi({
      items: listed,
      // Someone added a card meanwhile: the order sent is not every card.
      order: () => {
        listed.push(bowl);
        return apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "ids", message: "Send every row" }],
        });
      },
    });
    renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getByRole("button", { name: "More for Salad Station" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder competitors",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move Salad Station down" }),
    );
    const reads = calls.filter(
      ({ method, path }) => method === "GET" && path === listPath,
    ).length;
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(
        calls.filter(
          ({ method, path }) => method === "GET" && path === listPath,
        ).length,
      ).toBeGreaterThan(reads),
    );
    expect(
      await within(dialog).findByText(
        "The list changed while you were ordering it. Check the order and save again.",
      ),
    ).toBeTruthy();
    // The order starts again from the list as it now is; Save waits for a change.
    expect(
      within(dialog)
        .getAllByRole("listitem")
        .map((row) => row.textContent),
    ).toEqual(["Salad Station", "Home meal prep", "Bowl & Co"]);
    expect(
      within(dialog)
        .getByRole("button", { name: "Save order" })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(dialog.textContent).not.toContain("Couldn't save");
  });

  test("Table: the fields as rows and the competitors as columns", async () => {
    competitorsApi();
    renderApp(`${base}?view=table`);
    const table = await screen.findByRole("grid", {
      name: "Competitors in a table",
    });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["Field", "Salad Station", "Home meal prep"]);
    const price = within(table)
      .getAllByRole("row")
      .find((row) => row.textContent?.startsWith("Typical price"));
    expect(price?.textContent).toContain("₱240 per bowl");
    expect(price?.textContent).toContain("No price");
  });

  test("none yet: what 15 is for, with the template's aim", async () => {
    competitorsApi({ items: [], guidance: { min: 7, max: 5 } });
    renderApp(base);
    expect(
      await screen.findByText(
        "List 7+ competitors or substitutes. Include what people do today instead.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("0 competitors · aim for 7+")).toBeTruthy();
  });

  test("Patterns: a question opens to answer, saved through V3; ?q= focuses it", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi();
    renderApp(`${base}?q=V.04.FAILURE_PATTERNS`);
    const answerField = await screen.findByRole("textbox", {
      name: "Answer to Failure Patterns",
    });
    await waitFor(() => expect(document.activeElement).toBe(answerField));
    expect(
      screen.queryByRole("textbox", { name: "Answer to Survivor Patterns" }),
    ).toBeNull();
    await user.type(answerField, "Rent ate the margin");
    await waitFor(
      () =>
        expect(calls.find(({ method }) => method === "PUT")?.path).toBe(
          `/api/v1/validations/${validationId}/answers/V.04.FAILURE_PATTERNS`,
        ),
      { timeout: 3000 },
    );
  });

  test("a Viewer reads: no adding, ⋯ for comments and history only, a card opens to read, the patterns open", async () => {
    const user = userEvent.setup();
    competitorsApi({ me: as("viewer") });
    renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    expect(screen.queryByRole("button", { name: "Add competitor" })).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // A Viewer comments and reads the history too (design-spec 2.2): the card's ⋯ holds
    // Comments and History alone.
    await user.click(
      screen.getByRole("button", { name: "More for Salad Station" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Comments", "History"]);
    await user.keyboard("{Escape}");
    // Both patterns open, to read.
    for (const title of ["Survivor Patterns", "Failure Patterns"]) {
      const pattern = screen.getByRole("region", { name: title });
      expect(pattern.textContent).toContain(
        "No research linked to this answer.",
      );
    }
    await user.click(screen.getByText("Salad Station"));
    const dialog = await screen.findByRole("dialog", { name: "Salad Station" });
    expect(dialog.textContent).toContain("Prime location");
    expect(within(dialog).queryByRole("textbox")).toBeNull();
    expect(
      within(dialog).queryByRole("link", { name: "Add evidence" }),
    ).toBeNull();
  });

  test("a row that is not on the list: Not found", async () => {
    competitorsApi();
    renderApp(`${base}?row=8a1b2c3d-0000-4000-8000-0000000000ff`);
    const dialog = await screen.findByRole("dialog", {
      name: "04 Competitors",
    });
    expect(dialog.textContent).toContain("Not found");
  });

  test("an archived idea: the notice with Restore, and 15 reads only", async () => {
    competitorsApi({ archived: true });
    renderApp(`${base}?modal=evidence&about=competitor:${salad.id}`);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    await screen.findByText("2 competitors · aim for 3–5");
    expect(screen.queryByRole("button", { name: "Add competitor" })).toBeNull();
    await userEvent.click(
      screen.getByRole("button", { name: "More for Salad Station" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Comments", "History"]);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("textbox")).toBeNull();
    // M2's URL opens nothing on an archived idea.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  test("a card's ⋯ History opens its changes in the history panel (design-spec 6.0.5)", async () => {
    const user = userEvent.setup();
    competitorsApi();
    const router = renderApp(base);
    await user.click(
      await screen.findByRole("button", { name: "More for Salad Station" }),
    );
    await user.click(screen.getByRole("menuitem", { name: "History" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "history",
        target: expect.stringMatching(/^competitor:/),
      }),
    );
  });
  /** Opens New competitor from the title row's button. */
  const openNew = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getAllByRole("button", {
        name: "Add competitor",
      })[0] as HTMLElement,
    );
    return screen.findByRole("dialog", { name: "New competitor" });
  };

  /** Types a name into New competitor and presses Add competitor. */
  const addBowl = async (
    user: ReturnType<typeof userEvent.setup>,
    dialog: HTMLElement,
  ) => {
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Bowl & Co",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Add competitor" }),
    );
  };

  test("New competitor adds a history entry: Back closes it and stays on 15", async () => {
    const user = userEvent.setup();
    competitorsApi();
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    const entries = router.history.length;
    const dialog = await openNew(user);
    expect(router.history.length).toBe(entries + 1);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Bowl & Co",
    );
    act(() => router.history.back());
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    expect(router.state.location.pathname).toBe(base);
    expect(screen.getByText("2 competitors · aim for 3–5")).toBeTruthy();
  });

  test("Cancel goes back past New competitor's entry", async () => {
    const user = userEvent.setup();
    competitorsApi();
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    const key = router.state.location.state.key;
    const dialog = await openNew(user);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    // Back at the entry 15 was opened in, not on a new one.
    expect(router.state.location.state.key).toBe(key);
  });

  test("the competitor made replaces New competitor's entry with its row: Back from it is the list", async () => {
    const user = userEvent.setup();
    competitorsApi();
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    const entries = router.history.length;
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    expect(
      await screen.findByRole("dialog", { name: "Edit competitor" }),
    ).toBeTruthy();
    expect(router.state.location.search).toMatchObject({ row: madeId });
    expect(router.history.length).toBe(entries + 1);
    act(() => router.history.back());
    await waitFor(() =>
      expect(router.state.location.search).not.toHaveProperty("row"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("3 competitors · aim for 3–5")).toBeTruthy();
  });

  test("New competitor and the network: Couldn't save and Retry in the dialog, which sends what is typed again", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = competitorsApi({
      create: () => {
        tries += 1;
        if (tries === 1) throw new TypeError("Failed to fetch");
        return undefined;
      },
    });
    renderApp(base);
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByRole("dialog", { name: "Edit competitor" }),
    ).toBeTruthy();
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({ name: "Bowl & Co" });
    expect(again?.body).toEqual(first?.body);
  });

  test("New competitor refused for good: Couldn't save and its reason in the dialog", async () => {
    const user = userEvent.setup();
    competitorsApi({ create: () => apiError(409, "ARCHIVED") });
    renderApp(base);
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("It's archived");
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /Name/,
        }) as HTMLInputElement
      ).value,
    ).toBe("Bowl & Co");
  });

  test("New competitor over the rate limit: the wait in the dialog", async () => {
    const user = userEvent.setup();
    competitorsApi({
      create: () => apiError(429, "RATE_LIMITED", { retryAfterSeconds: 60 }),
    });
    renderApp(base);
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe("Too many attempts. Try again in 1 minute.");
  });

  test("New competitor and an unexpected failure: the small dialog with its Ref; Retry sends again, Close closes New competitor", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi({ create: () => apiError(500, "INTERNAL") });
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    const key = router.state.location.state.key;
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    // The request id's first 8 characters (SDD 8.2), not the whole id.
    expect(small.textContent).toContain("Ref: 8f14e45f");
    expect(small.textContent).not.toContain("8f14e45f-");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({ name: "Bowl & Co" });
    expect(again?.body).toEqual(first?.body);
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Something went wrong/,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    expect(router.state.location.state.key).toBe(key);
  });

  test("New competitor refused for a field: Couldn't save with the reason, and Check the format under the field", async () => {
    const user = userEvent.setup();
    competitorsApi({
      create: () =>
        apiError(422, "VALIDATION_FAILED", {
          details: [{ path: "priceNote", message: "Too long" }],
        }),
    });
    renderApp(base);
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("Check the format");
    const note = within(dialog).getByRole("textbox", { name: "Price note" });
    const described = (note.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent);
    expect(described).toContain("Check the format");
  });

  test("a delete refused once the user is a Viewer: the reason without Retry, then 15 reads only (6.0.6)", async () => {
    const user = userEvent.setup();
    let me = ana;
    competitorsApi({
      me: () => me,
      remove: () => {
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getByRole("button", { name: "More for Salad Station" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this competitor?",
    });
    const toast = await toastAfter(
      "Couldn't save. You don't have access to this.",
      () =>
        user.click(within(question).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Add competitor" }),
      ).toBeNull(),
    );
    expect(cardsOf()).toHaveLength(2);
  });

  test("New competitor: a field says why only once it changed, not when it is only left", async () => {
    const user = userEvent.setup();
    competitorsApi();
    renderApp(base);
    const dialog = await openNew(user);
    const name = within(dialog).getByRole("textbox", { name: /Name/ });
    // Left blank on the way to another field (or to Cancel): no reason moves the buttons.
    await user.click(name);
    await user.tab();
    const price = within(dialog).getByRole("textbox", {
      name: "Typical Price",
    });
    await user.click(price);
    await user.tab();
    expect(within(dialog).queryByText("Can't be empty")).toBeNull();
    expect(
      within(dialog).queryByText("Enter a number such as 1,500.50"),
    ).toBeNull();
    // Changed, each says why at once, before it is left.
    await user.type(price, "1,5");
    expect(
      within(dialog).getByText("Enter a number such as 1,500.50"),
    ).toBeTruthy();
    await user.type(name, "B");
    await user.clear(name);
    expect(within(dialog).getByText("Can't be empty")).toBeTruthy();
  });

  test("a Viewer with no competitors: what 15 is for, and nothing to add", async () => {
    const user = userEvent.setup();
    competitorsApi({ me: as("viewer"), items: [] });
    renderApp(base);
    const words =
      "List 3–5 competitors or substitutes. Include what people do today instead.";
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText(/Add competitor/)).toBeNull();
    // The table's place says the same, without the button too.
    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(await screen.findByText(words)).toBeTruthy();
    expect(screen.queryByText(/Add competitor/)).toBeNull();
  });

  test("Cancel while New competitor is on its way: the competitor is made, and its dialog does not open", async () => {
    const user = userEvent.setup();
    const listed = [salad, prep];
    let release = () => {};
    const calls = competitorsApi({
      items: listed,
      create: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            const made = competitor(madeId, "Bowl & Co", { sortOrder: 2 });
            listed.push(made);
            resolve(Response.json(made, { status: 201 }));
          };
        }),
    });
    const router = renderApp(base);
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    release();
    // Made: the list is read again with it; the user stays on the cards.
    await waitFor(() =>
      expect(screen.getByText("3 competitors · aim for 3–5")).toBeTruthy(),
    );
    expect(cardsOf().map((card) => card.textContent)).toContainEqual(
      expect.stringContaining("Bowl & Co"),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.state.location.search).not.toHaveProperty("row");
  });

  /** Opens Reorder from Home meal prep's ⋯ and moves it up: Save order can send. */
  const openReorder = async (user: ReturnType<typeof userEvent.setup>) => {
    await screen.findByText("2 competitors · aim for 3–5");
    await user.click(
      screen.getByRole("button", { name: "More for Home meal prep" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder competitors",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move Home meal prep up" }),
    );
    return dialog;
  };

  /** The rows of the Reorder dialog, in the order it holds. */
  const orderIn = (dialog: HTMLElement) =>
    within(dialog)
      .getAllByRole("listitem")
      .map((row) => row.textContent);

  test("Reorder while Save order is on its way: Cancel, ×, Escape and a press outside leave it open", async () => {
    const user = userEvent.setup();
    let release = () => {};
    competitorsApi({
      order: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }));
        }),
    });
    renderApp(base);
    // The press outside reaches the dialog: with nothing on its way, it closes Reorder.
    await openReorder(user);
    await user.click(document.body);
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder competitors" }),
      ).toBeNull(),
    );
    const dialog = await openReorder(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel.hasAttribute("disabled")).toBe(true));
    await user.click(cancel);
    await user.click(within(dialog).getByRole("button", { name: "Close" }));
    await user.keyboard("{Escape}");
    await user.click(document.body);
    expect(
      screen.getByRole("dialog", { name: "Reorder competitors" }),
    ).toBeTruthy();
    expect(orderIn(dialog)).toEqual(["Home meal prep", "Salad Station"]);
    release();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder competitors" }),
      ).toBeNull(),
    );
    expect(cardsOf()[0]?.textContent).toContain("Home meal prep");
  });

  test("Reorder and the network: Couldn't save and Retry in the dialog, the order kept; Retry sends it again", async () => {
    const user = userEvent.setup();
    let tries = 0;
    const calls = competitorsApi({
      order: () => {
        tries += 1;
        if (tries === 1) throw new TypeError("Failed to fetch");
        return undefined;
      },
    });
    renderApp(base);
    const dialog = await openReorder(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).not.toContain("Something went wrong");
    expect(orderIn(dialog)).toEqual(["Home meal prep", "Salad Station"]);
    expect(cardsOf()[0]?.textContent).toContain("Salad Station");
    await user.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder competitors" }),
      ).toBeNull(),
    );
    const [first, again] = calls.filter(({ method }) => method === "PUT");
    expect(first?.body).toEqual({ ids: [prep.id, salad.id] });
    expect(again?.body).toEqual(first?.body);
    expect(cardsOf()[0]?.textContent).toContain("Home meal prep");
  });

  test("Reorder and an unexpected failure: the small dialog with its Ref over the order kept; Retry sends again, Close closes Reorder", async () => {
    const user = userEvent.setup();
    const calls = competitorsApi({ order: () => apiError(500, "INTERNAL") });
    renderApp(base);
    const dialog = await openReorder(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    const small = await screen.findByRole("alertdialog", {
      name: /Something went wrong/,
    });
    expect(small.textContent).toContain("Ref: 8f14e45f");
    expect(within(dialog).queryByRole("alert")).toBeNull();
    expect(orderIn(dialog)).toEqual(["Home meal prep", "Salad Station"]);
    await user.click(within(small).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "PUT");
    expect(again?.body).toEqual(first?.body);
    await user.click(
      within(
        await screen.findByRole("alertdialog", {
          name: /Something went wrong/,
        }),
      ).getByRole("button", { name: "Close" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder competitors" }),
      ).toBeNull(),
    );
    expect(cardsOf()[0]?.textContent).toContain("Salad Station");
  });

  test("the title row's moon: new at none, half from one, full at the template's threshold", async () => {
    const third = competitor(madeId, "Bowl & Co", { sortOrder: 2 });
    /**
     * The moon beside the count: full is ring and disc, half the ring and a lit path, new
     * the ring alone. Empty's dashed ring and Unclassified's diamond are none of them.
     */
    const shapeOf = (count: string) => {
      const mark = screen.getByText(count).querySelector("svg");
      if (mark === null) throw new Error(`no moon beside "${count}"`);
      if (mark.querySelector("[stroke-dasharray]") !== null) return "other";
      const parts = [...mark.children].map(({ tagName }) =>
        tagName.toLowerCase(),
      );
      const shapes: Record<string, string> = {
        "circle,circle": "full",
        "circle,path": "half",
        circle: "new",
      };
      return shapes[parts.join()] ?? "other";
    };
    for (const [items, min, count, shape] of [
      [[], 3, "0 competitors · aim for 3–5", "new"],
      [[salad], 3, "1 competitor · aim for 3–5", "half"],
      [[salad, prep], 3, "2 competitors · aim for 3–5", "half"],
      [[salad, prep, third], 3, "3 competitors · aim for 3–5", "full"],
      // The template's threshold decides it, not a fixed 3.
      [[salad, prep], 2, "2 competitors · aim for 2–5", "full"],
    ] as const) {
      competitorsApi({ items: [...items], guidance: { min, max: 5 } });
      renderApp(base);
      await screen.findByText(count);
      expect(shapeOf(count)).toBe(shape);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  /** The reads of 15's list (V8). */
  const listReads = (calls: Call[]) =>
    calls.filter(({ method, path }) => method === "GET" && path === listPath)
      .length;

  test("M2's URL on an archived idea opens nothing and comes off the URL in place once 15 is read; Restore opens no M2 (SDD 4章)", async () => {
    const user = userEvent.setup();
    let archived = true;
    competitorsApi({
      archived: () => archived,
      restore: () => {
        archived = false;
      },
    });
    const router = renderApp(
      `${base}?view=table&modal=evidence&about=competitor:${salad.id}`,
    );
    const entries = router.history.length;
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ view: "table" }),
    );
    expect(router.history.length).toBe(entries);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add competitor" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByText("This idea is archived")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull();
  });

  test("M2's URL about nothing 15 can open it on (a competitor not listed, a pattern without F/A/U, a risk): nothing, and it comes off the URL", async () => {
    const unclassed = question(
      "V.04.SURVIVOR_PATTERNS",
      "Survivor Patterns",
      "Survivor Patterns",
      { hasFau: false },
    );
    for (const about of [
      "competitor:8a1b2c3d-0000-4000-8000-0000000000ff",
      `validation_answer:${validationId}:V.04.SURVIVOR_PATTERNS`,
      "risk:7a1b2c3d-0000-4000-8000-000000000001",
    ]) {
      competitorsApi({
        patterns: [{ question: unclassed, answer: answer(unclassed.key) }],
      });
      const router = renderApp(`${base}?modal=evidence&about=${about}`);
      await screen.findByText("2 competitors · aim for 3–5");
      await waitFor(() => expect(router.state.location.search).toEqual({}));
      expect(screen.queryByRole("dialog")).toBeNull();
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  test("M2's URL keeps its modal while 15's list is first read, then opens about the pattern's answer it names", async () => {
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls = competitorsApi({ holdList: () => held });
    const router = renderApp(
      `${base}?modal=evidence&about=validation_answer:${validationId}:V.04.SURVIVOR_PATTERNS`,
    );
    await waitFor(() => expect(listReads(calls)).toBeGreaterThan(0));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.search).toMatchObject({
      modal: "evidence",
      about: `validation_answer:${validationId}:V.04.SURVIVOR_PATTERNS`,
    });
    release();
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain("Survivor Patterns");
  });

  test("a stale list being read again does not decide M2: a competitor added meanwhile opens once the read answers", async () => {
    const listed = [salad, prep];
    let hold: Promise<void> | undefined;
    let release = () => {};
    const calls = competitorsApi({ items: listed, holdList: () => hold });
    const router = renderApp(base);
    await screen.findByText("2 competitors · aim for 3–5");
    const bowl = competitor(madeId, "Bowl & Co", { sortOrder: 2 });
    listed.push(bowl);
    hold = new Promise((resolve) => {
      release = resolve;
    });
    const reads = listReads(calls);
    readAgainOnFocus();
    await waitFor(() => expect(listReads(calls)).toBeGreaterThan(reads));
    await act(() =>
      router.navigate({
        to: ".",
        search: { modal: "evidence", about: `competitor:${bowl.id}` },
      }),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.search).toMatchObject({ modal: "evidence" });
    hold = undefined;
    release();
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    expect(sheet.textContent).toContain("Competitors · Bowl & Co");
  });

  test("M2 open stays once the idea is archived meanwhile, and an attachment shows the refusal in it; closing takes it off the URL", async () => {
    const user = userEvent.setup();
    let archived = false;
    competitorsApi({
      archived: () => archived,
      evidence: () => apiError(409, "ARCHIVED"),
    });
    const router = renderApp(
      `${base}?modal=evidence&about=competitor:${salad.id}`,
    );
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    archived = true;
    readAgainOnFocus();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(sheet.isConnected).toBe(true);
    await user.click(
      await within(sheet).findByRole("checkbox", { name: /Lunch survey/ }),
    );
    await waitFor(() => expect(sheet.textContent).toContain("Couldn't save"));
    expect(sheet.textContent).toContain("It's archived");
    await user.click(within(sheet).getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull(),
    );
    expect(router.state.location.search).not.toHaveProperty("modal");
    expect(router.state.location.search).not.toHaveProperty("about");
  });

  test("a competitor's dialog opened to edit stays so once the idea is archived meanwhile, its refused save shown in it; no Add evidence", async () => {
    const user = userEvent.setup();
    let archived = false;
    competitorsApi({
      archived: () => archived,
      patch: () => apiError(409, "ARCHIVED"),
    });
    renderApp(`${base}?row=${salad.id}`);
    const dialog = await screen.findByRole("dialog", {
      name: "Edit competitor",
    });
    archived = true;
    readAgainOnFocus();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(dialog.isConnected).toBe(true);
    expect(
      within(dialog).queryByRole("link", { name: "Add evidence" }),
    ).toBeNull();
    await user.type(
      within(dialog).getByRole("textbox", { name: "Weakness" }),
      "Slow",
    );
    await user.tab();
    await waitFor(() => expect(dialog.textContent).toContain("Couldn't save"));
    expect(dialog.textContent).toContain("It's archived");
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: "Weakness",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("Slow");
    expect(
      screen.getByRole("dialog", { name: "Edit competitor" }),
    ).toBeTruthy();
  });

  test("New competitor stays open once the idea is archived meanwhile; Add competitor then shows the refusal in it", async () => {
    const user = userEvent.setup();
    let archived = false;
    competitorsApi({
      archived: () => archived,
      create: () => apiError(409, "ARCHIVED"),
    });
    renderApp(base);
    const dialog = await openNew(user);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Bowl & Co",
    );
    archived = true;
    readAgainOnFocus();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(dialog.isConnected).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: "Add competitor" }),
    );
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("It's archived");
  });

  test("Reorder stays open once the user is read again as a Viewer; Save order then shows the refusal in it", async () => {
    const user = userEvent.setup();
    let me = ana;
    competitorsApi({
      me: () => me,
      order: () => apiError(403, "FORBIDDEN"),
    });
    renderApp(base);
    const dialog = await openReorder(user);
    me = as("viewer");
    readAgainOnFocus();
    // The screen behind reads only: its Add competitor buttons go.
    await waitFor(() =>
      expect(screen.queryAllByText("Add competitor")).toHaveLength(0),
    );
    expect(dialog.isConnected).toBe(true);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("Couldn't save");
    expect(alert.textContent).toContain("You don't have access to this");
  });

  /** Adds Bowl & Co and presses Cancel while it is on its way: New competitor closes. */
  const addThenCancel = async (
    user: ReturnType<typeof userEvent.setup>,
    calls: Call[],
  ) => {
    const dialog = await openNew(user);
    await addBowl(user, dialog);
    await waitFor(() =>
      expect(calls.some(({ method }) => method === "POST")).toBe(true),
    );
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
  };

  test("Cancel while New competitor is on its way, then the network fails: Couldn't save and Retry in a toast; Retry sends it again and the card is added (6.0.6)", async () => {
    const user = userEvent.setup();
    let fail = () => {};
    let tries = 0;
    const calls = competitorsApi({
      create: () => {
        tries += 1;
        if (tries > 1) return undefined;
        return new Promise<Response>((_resolve, reject) => {
          fail = () => reject(new TypeError("Failed to fetch"));
        });
      },
    });
    const router = renderApp(base);
    await addThenCancel(user, calls);
    const toast = await toastAfter("Couldn't save", async () => fail());
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(screen.getByText("3 competitors · aim for 3–5")).toBeTruthy(),
    );
    expect(cardsOf().map((card) => card.textContent)).toContainEqual(
      expect.stringContaining("Bowl & Co"),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(first?.body).toMatchObject({ name: "Bowl & Co" });
    expect(again?.body).toEqual(first?.body);
    // Made from the toast, its dialog does not open.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(router.state.location.search).not.toHaveProperty("row");
  });

  test("Cancel while New competitor is on its way, then it is refused as archived: the reason in a toast without Retry, and 15 reads again", async () => {
    const user = userEvent.setup();
    let release = () => {};
    let archived = false;
    const calls = competitorsApi({
      archived: () => archived,
      create: () =>
        new Promise<Response>((resolve) => {
          release = () => {
            archived = true;
            resolve(apiError(409, "ARCHIVED"));
          };
        }),
    });
    renderApp(base);
    await addThenCancel(user, calls);
    const toast = await toastAfter("Couldn't save. It's archived.", async () =>
      release(),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add competitor" })).toBeNull();
    expect(calls.filter(({ method }) => method === "POST")).toHaveLength(1);
  });

  test("Cancel while New competitor is on its way, then an unexpected failure: Something went wrong with its Ref in a toast, and Retry sends it again", async () => {
    const user = userEvent.setup();
    let release = () => {};
    let tries = 0;
    const calls = competitorsApi({
      create: () => {
        tries += 1;
        if (tries > 1) return undefined;
        return new Promise<Response>((resolve) => {
          release = () => resolve(apiError(500, "INTERNAL"));
        });
      },
    });
    renderApp(base);
    await addThenCancel(user, calls);
    const toast = await toastAfter(
      "Something went wrong. Ref: 8f14e45f",
      async () => release(),
    );
    await user.click(within(toast).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(calls.filter(({ method }) => method === "POST")).toHaveLength(2),
    );
    const [first, again] = calls.filter(({ method }) => method === "POST");
    expect(again?.body).toEqual(first?.body);
  });

  test("M2 open stays once its competitor is deleted meanwhile, and removing its evidence says It no longer exists (6.0.6)", async () => {
    const user = userEvent.setup();
    const listed = [salad, prep];
    const calls = competitorsApi({
      items: listed,
      // V5 finds no such competitor in this validation (SDD 5.7).
      removeEvidence: () => apiError(404, "NOT_FOUND"),
    });
    renderApp(`${base}?modal=evidence&about=competitor:${salad.id}`);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    listed.splice(listed.indexOf(salad), 1);
    readAgainOnFocus();
    await waitFor(() =>
      expect(screen.getByText("1 competitor · aim for 3–5")).toBeTruthy(),
    );
    expect(screen.getByRole("dialog", { name: "Evidence" })).toBe(sheet);
    expect(sheet.textContent).toContain("Competitors · Salad Station");
    await user.click(within(sheet).getByRole("button", { name: /Remove/ }));
    expect(await within(sheet).findByText("Couldn't save")).toBeTruthy();
    expect(within(sheet).getByText("It no longer exists")).toBeTruthy();
    expect(
      calls.filter(
        ({ method, path }) =>
          method === "DELETE" && path.startsWith("/api/v1/evidence/"),
      ),
    ).toHaveLength(1);
  });

  test("Reorder while Save order is on its way holds the screen: a link elsewhere waits until it is answered (design-spec 6.10)", async () => {
    const user = userEvent.setup();
    let release = () => {};
    competitorsApi({
      order: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }));
        }),
    });
    const router = renderApp(base);
    const dialog = await openReorder(user);
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(
        within(dialog)
          .getByRole("button", { name: "Cancel" })
          .hasAttribute("disabled"),
      ).toBe(true),
    );
    const entries = router.history.length;
    // A link's way (the app's links navigate through the router). Not awaited: a held
    // navigation settles only with the next one.
    act(() => {
      void router.navigate({ href: `/w/${workspaceId}/ideas/${home.idea.id}` });
    });
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(router.state.location.pathname).toBe(base);
    expect(router.history.length).toBe(entries);
    expect(screen.getByRole("dialog", { name: "Reorder competitors" })).toBe(
      dialog,
    );
    release();
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Reorder competitors" }),
      ).toBeNull(),
    );
    expect(cardsOf()[0]?.textContent).toContain("Home meal prep");
    // Answered, the screen lets the user go again.
    act(() => {
      void router.navigate({ href: `/w/${workspaceId}/ideas/${home.idea.id}` });
    });
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        `/w/${workspaceId}/ideas/${home.idea.id}`,
      ),
    );
  });

  test("Save order without an answer in 70 seconds fails as the network does: Couldn't save and Retry, which sends it again", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      let tries = 0;
      const calls = competitorsApi({
        order: () => {
          tries += 1;
          // The first send never answers (the network lost on its way).
          return tries === 1 ? new Promise<Response>(() => {}) : undefined;
        },
      });
      renderApp(base);
      const dialog = await openReorder(user);
      await user.click(
        within(dialog).getByRole("button", { name: "Save order" }),
      );
      await waitFor(() =>
        expect(calls.filter(({ method }) => method === "PUT")).toHaveLength(1),
      );
      await act(() => vi.advanceTimersByTimeAsync(HELD_SEND_LIMIT_MS));
      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toContain("Couldn't save");
      expect(alert.textContent).not.toContain("Something went wrong");
      expect(orderIn(dialog)).toEqual(["Home meal prep", "Salad Station"]);
      await user.click(within(alert).getByRole("button", { name: "Retry" }));
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Reorder competitors" }),
        ).toBeNull(),
      );
      const [first, again] = calls.filter(({ method }) => method === "PUT");
      expect(again?.body).toEqual(first?.body);
    } finally {
      vi.useRealTimers();
    }
  });

  test("Reorder while Save order is on its way holds the browser's Back too, in the browser's own history", async () => {
    const user = userEvent.setup();
    let release = () => {};
    competitorsApi({
      order: () =>
        new Promise<Response>((resolve) => {
          release = () => resolve(new Response(null, { status: 204 }));
        }),
    });
    // The memory history of renderApp holds no Back: the window's history does.
    window.history.replaceState(null, "", base);
    const history = createBrowserHistory();
    const router = createAppRouter({ history });
    render(<RouterProvider router={router} />, { container: document });
    try {
      await screen.findByText("2 competitors · aim for 3–5");
      // An entry to go back from.
      await act(() => router.navigate({ href: `${base}?view=cards` }));
      const dialog = await openReorder(user);
      await user.click(
        within(dialog).getByRole("button", { name: "Save order" }),
      );
      await waitFor(() =>
        expect(
          within(dialog)
            .getByRole("button", { name: "Cancel" })
            .hasAttribute("disabled"),
        ).toBe(true),
      );
      act(() => window.history.back());
      await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
      expect(router.state.location.search).toEqual({ view: "cards" });
      expect(window.location.search).toBe("?view=cards");
      expect(screen.getByRole("dialog", { name: "Reorder competitors" })).toBe(
        dialog,
      );
      release();
      await waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Reorder competitors" }),
        ).toBeNull(),
      );
      act(() => window.history.back());
      await waitFor(() => expect(router.state.location.search).toEqual({}));
    } finally {
      cleanup();
      history.destroy();
    }
  });

  test("a read again of the list that fails leaves the cards, and New competitor open with what was typed (as 13)", async () => {
    const user = userEvent.setup();
    let fails = false;
    const calls = competitorsApi({ listFails: () => fails });
    renderApp(base);
    const dialog = await openNew(user);
    await user.type(
      within(dialog).getByRole("textbox", { name: /Name/ }),
      "Bowl & Co",
    );
    fails = true;
    const reads = listReads(calls);
    readAgainOnFocus();
    await waitFor(() => expect(listReads(calls)).toBeGreaterThan(reads));
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByText("Something went wrong")).toBeNull();
    expect(screen.getByRole("dialog", { name: "New competitor" })).toBe(dialog);
    expect(
      (
        within(dialog).getByRole("textbox", {
          name: /Name/,
        }) as HTMLInputElement
      ).value,
    ).toBe("Bowl & Co");
    expect(screen.getByText("2 competitors · aim for 3–5")).toBeTruthy();
  });

  test("New competitor's entry reached again by Forward once the idea is archived: nothing opens, the entry loses its mark in place, and Restore opens none (SDD 4章)", async () => {
    const user = userEvent.setup();
    let archived = false;
    competitorsApi({
      archived: () => archived,
      restore: () => {
        archived = false;
      },
    });
    const router = renderApp(base);
    await openNew(user);
    act(() => router.history.back());
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "New competitor" }),
      ).toBeNull(),
    );
    archived = true;
    readAgainOnFocus();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    const entries = router.history.length;
    act(() => router.history.forward());
    // On the entry New competitor added, which no longer says it is open.
    await waitFor(() => {
      expect(router.state.location.state.openedDetail).toBe(true);
      expect(router.state.location.state.addingCompetitor).toBeUndefined();
    });
    expect(router.history.length).toBe(entries);
    expect(router.state.location.pathname).toBe(base);
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Restore" }));
    await waitFor(() =>
      expect(screen.queryByText("This idea is archived")).toBeNull(),
    );
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
    expect(screen.queryByRole("dialog", { name: "New competitor" })).toBeNull();
  });
});
