import type { Competitor, Me, Role, ValidationAnswer } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, apiError, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  answer,
  competitor,
  home,
  question,
  validationId,
} from "../test/validation";

// 15 Competitors (design-spec 6.10・6.0.3).

afterEach(() => {
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
}: {
  me?: Me;
  items?: Competitor[];
  archived?: boolean;
  guidance?: { min: number; max: number };
  patterns?: { question: typeof survivor; answer: ValidationAnswer }[];
  order?: () => Response;
} = {}) {
  // The test's own array, so it can change the list behind the screen.
  const held = items;
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
    if (method === "GET" && path === listPath) {
      return Response.json({ items: held, patterns, guidance });
    }
    if (method === "POST" && path === listPath) {
      const made = competitor(madeId, (call.body as { name: string }).name, {
        ...(call.body as Partial<Competitor>),
        sortOrder: held.length,
      });
      held.push(made);
      return Response.json(made, { status: 201 });
    }
    if (method === "PUT" && path === `${listPath}/order`) {
      if (order !== undefined) return order();
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
});
