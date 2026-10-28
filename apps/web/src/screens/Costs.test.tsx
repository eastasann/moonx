import type { CostItem, EconomicsInput, Me, Role } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { ana, type Call, renderApp, stubApi } from "../test/api";
import { workspaceId } from "../test/ideas";
import {
  assumed,
  costItem,
  economicsInputs,
  home,
  resultOf,
  validationId,
} from "../test/validation";

// 17 Costs (design-spec 6.3).

afterEach(() => {
  vi.unstubAllGlobals();
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

/** The API of 17 over `items` and 18's numbers. */
function costsApi({
  me = ana,
  items = [equipment, permits, rent, materials, packaging],
  inputs = economicsInputs({ selling_price: 220, operating_days: 26 }),
  archived = false,
}: {
  me?: Me;
  items?: CostItem[];
  inputs?: EconomicsInput[];
  archived?: boolean;
} = {}) {
  const held = [...items];
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
    // A % of the price shows what it comes to at 18's price.
    expect(rowOf("Core Product").textContent).toContain("35%");
    expect(rowOf("Core Product").textContent).toContain("· ₱77.00");
    expect(rowOf("Packaging").textContent).toContain("₱12.00");
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
    expect(question.textContent).toContain("₱12.00 is cleared");
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
});
