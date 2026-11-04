import type { CostItem, EconomicsInput, Me, Role } from "@moonx/schemas";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
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
import {
  assumed,
  costItem,
  economicsInputs,
  evidenceOf,
  home,
  prices,
  resultOf,
  survey,
  validationId,
} from "../test/validation";

// 17 Costs (design-spec 6.3).

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

const base = `/w/${workspaceId}/ideas/${home.idea.id}/costs`;
const listPath = `/api/v1/validations/${validationId}/costs`;

const as = (role: Role): Me => ({
  ...ana,
  memberships: ana.memberships.map((membership) => ({ ...membership, role })),
});

const id = (n: number) => `4c1d2e3f-0000-4000-8000-00000000000${n}`;

const equipment = costItem(id(1), "initial", "Equipment", {
  templateKey: "initial.equipment",
  amount: 60000,
  classification: assumed("high"),
});
const permits = costItem(id(2), "initial", "Permits / Registration", {
  templateKey: "initial.permits",
  sortOrder: 1,
});
const rent = costItem(id(3), "monthly_fixed", "Rent", {
  templateKey: "monthly.rent",
  amount: 15000,
  classification: assumed(),
});
const materials = costItem(id(4), "variable", "Core Product / Materials", {
  templateKey: "variable.materials",
  inputMode: "percent_of_price",
  percent: 0.35,
  classification: assumed(),
});
const packaging = costItem(id(5), "variable", "Packaging", {
  templateKey: "variable.packaging",
  amount: 12,
  classification: assumed(),
  sortOrder: 1,
});

/** The id the fake API gives a new row. */
const madeId = id(9);

/**
 * The API of 17 over `items` and 18's numbers. `me` and `archived` may change behind the
 * screen (a function is asked at each call); `refuse` answers a write first when it
 * returns a Response.
 */
function costsApi({
  me = ana,
  items = [equipment, permits, rent, materials, packaging],
  inputs = economicsInputs({ selling_price: 220, operating_days: 26 }),
  archived = false,
  refuse,
  evidence,
}: {
  me?: Me | (() => Me);
  items?: CostItem[];
  inputs?: EconomicsInput[];
  archived?: boolean | (() => boolean);
  refuse?: (call: Call) => Response | undefined;
  /** V5's answer to a removal of evidence. */
  evidence?: (call: Call) => Response;
} = {}) {
  const held = [...items];
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
    if (method !== "GET") {
      const refused = refuse?.(call);
      if (refused !== undefined) return refused;
    }
    if (
      method === "GET" &&
      path.startsWith(`/api/v1/validations/${validationId}/research-log`)
    ) {
      return Response.json({ items: [survey, prices], nextCursor: null });
    }
    if (method === "DELETE" && path.startsWith("/api/v1/evidence/")) {
      return evidence?.(call);
    }
    if (method === "GET" && path === listPath) {
      return Response.json({
        items: held,
        result: resultOf(held, inputs),
        economicsInputs: inputs,
      });
    }
    if (
      method === "POST" &&
      path === `/api/v1/validations/${validationId}/cost-items`
    ) {
      const { category, name } = call.body as {
        category: CostItem["category"];
        name: string;
      };
      const made = costItem(madeId, category, name, { sortOrder: 9 });
      held.push(made);
      return Response.json(made, { status: 201 });
    }
    if (
      method === "PUT" &&
      path === `/api/v1/validations/${validationId}/cost-items/order`
    ) {
      return new Response(null, { status: 204 });
    }
    const one = path.match(/^\/api\/v1\/cost-items\/([\w-]+)$/);
    const found = held.find((row) => row.id === one?.[1]);
    if (one !== null && found !== undefined) {
      if (method === "PATCH") {
        const { lockVersion: _, ...fields } = call.body as Record<
          string,
          unknown
        >;
        // As V14 answers: the whole classification, Unknown without a value.
        const sent = fields.classification as
          | { fau: CostItem["classification"]["fau"]; confidence: null }
          | undefined;
        const next = {
          ...found,
          ...fields,
          ...(sent === undefined
            ? {}
            : {
                classification: {
                  ...found.classification,
                  ...sent,
                  state: sent.fau ?? "unclassified",
                },
              }),
          lockVersion: found.lockVersion + 1,
        };
        held.splice(held.indexOf(found), 1, next as CostItem);
        return Response.json(next);
      }
      if (method === "DELETE") {
        held.splice(held.indexOf(found), 1);
        return new Response(null, { status: 204 });
      }
    }
    return undefined;
  });
}

const totals = () => screen.getByRole("group", { name: "Totals" });
const table = (name: string) => screen.getByRole("grid", { name });
const rowOf = (name: string) =>
  screen.getByRole("row", { name: new RegExp(name) });

describe("17 Costs (design-spec 6.3)", () => {
  test("three tables, each row's value and F/A/U, and totals with their lower bounds", async () => {
    costsApi();
    renderApp(base);
    expect(
      await screen.findByRole("heading", { level: 1, name: "05 Costs" }),
    ).toBeTruthy();
    await screen.findByRole("grid", { name: "Startup costs" });
    expect(table("Startup costs").textContent).toContain("₱60,000");
    expect(rowOf("Permits").textContent).toContain("Empty");
    // A % of the price shows what it comes to at 18's price, in a typed amount's form:
    // no cents when it has none (6.4「端数」).
    expect(rowOf("Core Product").textContent).toContain("35%");
    expect(rowOf("Core Product").textContent).toContain("· ₱77");
    expect(rowOf("Core Product").textContent).not.toContain("₱77.00");
    // Typed amounts as typed (6.4「端数」): ₱12, not ₱12.00.
    expect(rowOf("Packaging").textContent).toContain("₱12");
    expect(rowOf("Packaging").textContent).not.toContain("₱12.00");
    expect(screen.getAllByText(/^Subtotal/)).toHaveLength(2);
    expect(screen.getByText(/^Per sale/)).toBeTruthy();
    expect(totals().textContent).toContain("₱60,000+");
    expect(totals().textContent).toContain("Lower bound · 1 Empty");
    expect(totals().textContent).toContain("₱15,000");
    expect(totals().textContent).toContain("₱89.00");
    // FC 15,000 ÷ (220 − 89) ÷ 26 = 4.4 a day, at the price of 18.
    expect(totals().textContent).toContain("4.4");
    expect(totals().textContent).toContain("At ₱220 a sale");
    expect(
      screen.getByRole("link", { name: /Unit Economics/ }).getAttribute("href"),
    ).toBe(`/w/${workspaceId}/ideas/${home.idea.id}/economics`);
    await waitFor(() => expect(document.title).toBe("05 Costs · BCDX · moonx"));
  });

  test("an amount typed changes the totals at once and is saved once typing stops", async () => {
    const user = userEvent.setup();
    const calls = costsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      within(rowOf("Permits")).getAllByText("Empty")[0] as HTMLElement,
    );
    const amount = await screen.findByRole("textbox", {
      name: "Amount of Permits / Registration",
    });
    await user.type(amount, "8,500");
    // The total follows before the save goes out, and is exact now no row is Empty.
    await waitFor(() => expect(totals().textContent).toContain("₱68,500"));
    expect(totals().textContent).not.toContain("₱68,500+");
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        amount: 8500,
        lockVersion: 1,
      }),
    );
    // What breaks its rule is not sent, and says why.
    await user.clear(amount);
    await user.type(amount, "1,5");
    expect(screen.getByText("Enter a number such as 1,500.50")).toBeTruthy();
  });

  test("Unknown clears the value in the same save", async () => {
    const user = userEvent.setup();
    const calls = costsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      screen.getByRole("button", { name: /^F\/A\/U of Equipment/ }),
    );
    await user.click(await screen.findByRole("radio", { name: /Unknown/ }));
    const question = await screen.findByRole("alertdialog", {
      name: "Clear the value and mark it Unknown?",
    });
    await user.click(
      within(question).getByRole("button", { name: "Mark Unknown" }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        classification: { fau: "unknown", confidence: null },
        amount: null,
        lockVersion: 1,
      }),
    );
    // No startup row has an amount left: the total is Empty.
    await waitFor(() =>
      expect(rowOf("Equipment").textContent).toContain("Unknown"),
    );
    expect(totals().textContent).toContain("StartupEmpty");
  });

  test("a value typed into a saved Unknown row is sent alone: the API makes it Unclassified", async () => {
    const user = userEvent.setup();
    const calls = costsApi({
      items: [
        costItem(id(2), "initial", "Permits / Registration", {
          classification: {
            fau: "unknown",
            confidence: null,
            state: "unknown",
            evidence: [],
          },
        }),
      ],
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      within(rowOf("Permits")).getAllByText("Unknown")[0] as HTMLElement,
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "Amount of Permits / Registration",
      }),
      "1.5",
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        amount: 1.5,
        lockVersion: 1,
      }),
    );
  });

  test("Can Reduce? in place: the dash is read as Undecided, and saves none", async () => {
    const user = userEvent.setup();
    const calls = costsApi({
      items: [{ ...equipment, canReduce: "partly" }],
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(within(rowOf("Equipment")).getByText("Partly"));
    await user.click(
      await screen.findByRole("button", { name: /Can reduce Equipment\?/ }),
    );
    await user.click(await screen.findByRole("option", { name: "Undecided" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        canReduce: null,
        lockVersion: 1,
      }),
    );
  });

  test("+ Add row adds an Empty row to its table and puts the cursor in its name", async () => {
    const user = userEvent.setup();
    const calls = costsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    const [, monthlyAdd] = screen.getAllByRole("button", { name: "Add row" });
    await user.click(monthlyAdd as HTMLElement);
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "POST")?.body).toEqual({
        category: "monthly_fixed",
        name: "",
      }),
    );
    // Its name is open to type (where the cursor goes is make test-e2e's to check).
    expect(
      await screen.findByRole("textbox", { name: "Name of Untitled" }),
    ).toBeTruthy();
    expect(
      within(table("Monthly fixed costs")).getAllByRole("row"),
    ).toHaveLength(3);
  });

  test("a % of the price with no price: Needs price, and the way to 18", async () => {
    costsApi({ inputs: economicsInputs() });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    expect(rowOf("Core Product").textContent).toContain("· Needs price");
    expect(totals().textContent).toContain("Needs price");
    expect(
      screen.getByRole("link", { name: "Add price" }).getAttribute("href"),
    ).toBe(
      `/w/${workspaceId}/ideas/${home.idea.id}/economics?field=selling_price`,
    );
  });

  test("the row's ⋯: Use % of price asks first when the row has a value; Lump sum; Delete asks", async () => {
    const user = userEvent.setup();
    const calls = costsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      screen.getByRole("button", { name: "Row actions for Packaging" }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Use % of price" }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: "Enter Packaging as a % of the price?",
    });
    expect(question.textContent).toContain("₱12 is cleared");
    await user.click(within(question).getByRole("button", { name: "Switch" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PATCH")?.body).toEqual({
        inputMode: "percent_of_price",
        amount: null,
        percent: null,
        lockVersion: 1,
      }),
    );

    await user.click(
      screen.getByRole("button", { name: "Row actions for Equipment" }),
    );
    expect(screen.queryByRole("menuitem", { name: /% of price/ })).toBeNull();
    await user.click(
      await screen.findByRole("menuitem", { name: "Mark as lump sum" }),
    );
    await waitFor(() =>
      expect(
        calls
          .filter(({ method }) => method === "PATCH")
          .map(({ body }) => body),
      ).toContainEqual({ isLumpSum: true, lockVersion: 1 }),
    );
    await waitFor(() =>
      expect(rowOf("Equipment").textContent).toContain("Lump sum"),
    );

    await user.click(
      screen.getByRole("button", { name: "Row actions for Rent" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const remove = await screen.findByRole("alertdialog", {
      name: "Delete this cost row?",
    });
    await user.click(within(remove).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(
        calls.some(
          ({ method, path }) =>
            method === "DELETE" && path === `/api/v1/cost-items/${rent.id}`,
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(table("Monthly fixed costs").textContent).toContain("No rows"),
    );
  });

  test("Reorder sends the table's rows with its category", async () => {
    const user = userEvent.setup();
    const calls = costsApi();
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      screen.getByRole("button", { name: "Row actions for Packaging" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Reorder" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Reorder variable costs",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Move Packaging up" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save order" }),
    );
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "PUT")?.body).toEqual({
        ids: [packaging.id, materials.id],
        category: "variable",
      }),
    );
  });

  test("a new idea's rows all Empty: the hint to fill or mark them; totals Empty", async () => {
    costsApi({
      items: [
        costItem(id(1), "initial", "Equipment"),
        costItem(id(3), "monthly_fixed", "Rent"),
      ],
      inputs: economicsInputs(),
    });
    renderApp(base);
    expect(
      await screen.findByText(
        "Fill in what you know. Mark the rest Unknown, or delete rows you don't need.",
      ),
    ).toBeTruthy();
    expect(totals().textContent).toContain("StartupEmpty");
    expect(table("Variable costs").textContent).toContain("No rows");
  });

  test("a Viewer reads: no Add row, ⋯ for comments and history only, F/A/U as a label", async () => {
    const user = userEvent.setup();
    costsApi({ me: as("viewer") });
    const router = renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
    // A Viewer comments and reads the history too (design-spec 2.2): the row's ⋯ holds
    // Comments and History alone, and History opens the row's changes (6.0.5).
    await user.click(
      screen.getByRole("button", { name: "Row actions for Equipment" }),
    );
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Comments", "History"]);
    await user.click(screen.getByRole("menuitem", { name: "History" }));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({
        panel: "history",
        target: expect.stringMatching(/^cost_item:/),
      }),
    );
    expect(screen.queryByRole("button", { name: /^F\/A\/U of/ })).toBeNull();
    expect(rowOf("Equipment").textContent).toContain("Assumption · High");
  });

  test("an archived idea says so and reads like a Viewer", async () => {
    costsApi({ archived: true });
    renderApp(base);
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
  });

  test("a link to a row by its template key opens it at its amount", async () => {
    costsApi();
    renderApp(`${base}?row=initial.permits`);
    expect(
      await screen.findByRole("textbox", {
        name: "Amount of Permits / Registration",
      }),
    ).toBeTruthy();
  });
  test("typed amounts show as typed (6.4「端数」): cents only where typed; what a % comes to in cents", async () => {
    const user = userEvent.setup();
    const delivery = costItem(id(6), "variable", "Delivery / Fulfilment", {
      templateKey: "variable.delivery",
      amount: 7.25,
      classification: assumed(),
      sortOrder: 2,
    });
    const deposit = costItem(id(7), "initial", "Lease Deposit / Advance", {
      templateKey: "initial.lease_deposit",
      amount: 30000.5,
      classification: assumed(),
      sortOrder: 2,
    });
    costsApi({
      items: [equipment, deposit, rent, materials, packaging, delivery],
      inputs: economicsInputs({ selling_price: 149.5, operating_days: 26 }),
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    expect(rowOf("Packaging").textContent).toContain("₱12");
    expect(rowOf("Packaging").textContent).not.toContain("₱12.00");
    expect(rowOf("Delivery").textContent).toContain("₱7.25");
    expect(rowOf("Equipment").textContent).toContain("₱60,000");
    expect(rowOf("Equipment").textContent).not.toContain("₱60,000.00");
    expect(rowOf("Lease Deposit").textContent).toContain("₱30,000.50");
    // 35% of ₱149.50 is calculated: ₱52.325 in cents.
    expect(rowOf("Core Product").textContent).toContain("· ₱52.33");
    // The price 18 holds, as typed.
    expect(totals().textContent).toContain("At ₱149.50 a sale");
    // Asked before switching, the value reads as typed too.
    await user.click(
      screen.getByRole("button", {
        name: "Row actions for Delivery / Fulfilment",
      }),
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Use % of price" }),
    );
    const question = await screen.findByRole("alertdialog", {
      name: "Enter Delivery / Fulfilment as a % of the price?",
    });
    expect(question.textContent).toContain("₱7.25 is cleared");
  });

  test("removing a Fact row's last evidence asks with its noun: cost row (6.0.3)", async () => {
    const user = userEvent.setup();
    const link = evidenceOf("7d0f0000-0000-4000-8000-000000000011", survey);
    const calls = costsApi({
      items: [
        {
          ...equipment,
          classification: {
            fau: "fact",
            confidence: null,
            state: "fact",
            evidence: [link],
          },
        },
      ],
      evidence: () =>
        Response.json({
          classification: {
            fau: null,
            confidence: null,
            state: "unclassified",
            evidence: [],
          },
          lockVersion: 2,
        }),
    });
    renderApp(`${base}?modal=evidence&about=cost_item:${equipment.id}`);
    const sheet = await screen.findByRole("dialog", { name: "Evidence" });
    await user.click(
      await within(sheet).findByRole("button", { name: /Remove/ }),
    );
    const ask = await screen.findByRole("alertdialog", {
      name: "Remove the last evidence?",
    });
    expect(ask.textContent).toContain(
      "This cost row will become Unclassified.",
    );
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() =>
      expect(calls.find(({ method }) => method === "DELETE")?.path).toBe(
        `/api/v1/evidence/${link.id}?lockVersion=1`,
      ),
    );
  });

  test("?modal=evidence opens nothing for a Viewer, an archived idea, or an about 17 does not hold (6.0.3)", async () => {
    const cases: [Parameters<typeof costsApi>[0], string][] = [
      [{ me: as("viewer") }, `cost_item:${equipment.id}`],
      [{ archived: true }, `cost_item:${equipment.id}`],
      // A row 17 does not list, and 18's number.
      [{}, `cost_item:${madeId}`],
      [{}, `economics_input:${validationId}:selling_price`],
    ];
    for (const [api, about] of cases) {
      cleanup();
      vi.unstubAllGlobals();
      costsApi(api);
      renderApp(`${base}?modal=evidence&about=${about}`);
      await screen.findByRole("grid", { name: "Startup costs" });
      expect(screen.queryByRole("dialog", { name: "Evidence" })).toBeNull();
    }
  });

  test("on a phone the row's sheet closes before its ⋯ opens Comments or History in the panel (6.0.4・6.0.5)", async () => {
    const user = userEvent.setup();
    setViewport(390);
    costsApi();
    const router = renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    for (const panel of ["Comments", "History"] as const) {
      await user.click(rowOf("Equipment"));
      const sheet = await screen.findByRole("dialog", {
        name: "Edit cost row",
      });
      await user.click(
        within(sheet).getByRole("button", {
          name: "Row actions for Equipment",
        }),
      );
      await user.click(await screen.findByRole("menuitem", { name: panel }));
      await waitFor(() =>
        expect(screen.getByRole("dialog", { name: panel })).toBeTruthy(),
      );
      expect(
        screen.queryByRole("dialog", { name: "Edit cost row" }),
      ).toBeNull();
      expect(router.state.location.search).toMatchObject({
        panel: panel.toLowerCase(),
        target: `cost_item:${equipment.id}`,
      });
      await act(() => router.history.back());
      await waitFor(() =>
        expect(screen.queryByRole("dialog", { name: panel })).toBeNull(),
      );
    }
  });

  test("a delete refused as the idea is archived: the reason without Retry, then 17 reads as archived (6.0.6)", async () => {
    const user = userEvent.setup();
    let archived = false;
    costsApi({
      archived: () => archived,
      refuse: ({ method }) => {
        if (method !== "DELETE") return undefined;
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      screen.getByRole("button", { name: "Row actions for Rent" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this cost row?",
    });
    const toast = await toastAfter("Couldn't save. It's archived.", () =>
      user.click(within(question).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add row" })).toBeNull(),
    );
    expect(rowOf("Rent")).toBeTruthy();
  });

  test("a delete refused once the user is a Viewer: the reason without Retry, then 17 reads only (6.0.6)", async () => {
    const user = userEvent.setup();
    let me = ana;
    costsApi({
      me: () => me,
      refuse: ({ method }) => {
        if (method !== "DELETE") return undefined;
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      screen.getByRole("button", { name: "Row actions for Rent" }),
    );
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete this cost row?",
    });
    const toast = await toastAfter(
      "Couldn't save. You don't have access to this.",
      () =>
        user.click(within(question).getByRole("button", { name: "Delete" })),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add row" })).toBeNull(),
    );
    expect(screen.queryByRole("button", { name: /^F\/A\/U of/ })).toBeNull();
  });

  test("+ Add row refused as the idea is archived: the reason, then 17 reads as archived", async () => {
    const user = userEvent.setup();
    let archived = false;
    costsApi({
      archived: () => archived,
      refuse: ({ method }) => {
        if (method !== "POST") return undefined;
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    const [add] = screen.getAllByRole("button", { name: "Add row" });
    const toast = await toastAfter("Couldn't save. It's archived.", () =>
      user.click(add as HTMLElement),
    );
    expect(within(toast).queryByRole("button", { name: "Retry" })).toBeNull();
    expect(await screen.findByText("This idea is archived")).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Add row" })).toBeNull(),
    );
  });

  test("an autosave refused as the idea is archived: once the idea reads archived, the notice and the fields read only", async () => {
    const user = userEvent.setup();
    let archived = false;
    costsApi({
      archived: () => archived,
      refuse: ({ method }) => {
        if (method !== "PATCH") return undefined;
        archived = true;
        return apiError(409, "ARCHIVED");
      },
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      within(rowOf("Permits")).getAllByText("Empty")[0] as HTMLElement,
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "Amount of Permits / Registration",
      }),
      "8,500",
    );
    await user.tab();
    expect(
      await screen.findByText("This idea is archived", {}, { timeout: 3000 }),
    ).toBeTruthy();
    await waitFor(() =>
      expect(
        screen.queryByRole("textbox", {
          name: "Amount of Permits / Registration",
        }),
      ).toBeNull(),
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
  });

  test("an autosave refused once the user is a Viewer: once me reads Viewer, the fields read only", async () => {
    const user = userEvent.setup();
    let me = ana;
    costsApi({
      me: () => me,
      refuse: ({ method }) => {
        if (method !== "PATCH") return undefined;
        me = as("viewer");
        return apiError(403, "FORBIDDEN");
      },
    });
    renderApp(base);
    await screen.findByRole("grid", { name: "Startup costs" });
    await user.click(
      within(rowOf("Permits")).getAllByText("Empty")[0] as HTMLElement,
    );
    await user.type(
      await screen.findByRole("textbox", {
        name: "Amount of Permits / Registration",
      }),
      "8,500",
    );
    await user.tab();
    await waitFor(
      () =>
        expect(
          screen.queryByRole("textbox", {
            name: "Amount of Permits / Registration",
          }),
        ).toBeNull(),
      { timeout: 3000 },
    );
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add row" })).toBeNull();
    expect(screen.queryByText("This idea is archived")).toBeNull();
  });
});
