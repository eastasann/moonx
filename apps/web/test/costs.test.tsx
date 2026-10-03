import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { costItem, costItems, PIAYA_ROWS } from "./cost-fixtures";
import { VALIDATION_ID } from "./question-fixtures";
import { renderApp } from "./support";
import {
  COST_ITEM,
  COSTS_PATH,
  costsApi,
  patchOk,
  registerCostHooks,
  rowNamed,
} from "./support-costs";

registerCostHooks();

test("an amount typed with a thousands separator changes the totals at once and is saved on leaving", async () => {
  const items = costItems(PIAYA_ROWS);
  const rent = rowNamed(items, "Rent");
  const { calls } = costsApi({ [COST_ITEM(rent.id)]: patchOk(rent) }, { items });
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getByText("₱41,700")).toBeInTheDocument();

  const field = screen.getByRole("textbox", { name: "Amount of Rent" });
  await userEvent.click(field);
  await userEvent.keyboard("{Control>}a{/Control}13,500");
  expect(screen.getByText("₱43,200")).toBeInTheDocument();
  expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(0);

  await userEvent.tab();
  await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({
    amount: 13500,
    lockVersion: 1,
  });
}, 15_000);

test("Add row creates the row at the end of its table and focuses its name", async () => {
  const created = costItem(
    { category: "monthly_fixed", key: "", name: "", amount: null, state: "empty" },
    99,
  );
  const { calls } = costsApi({
    [`POST /api/v1/validations/${VALIDATION_ID}/cost-items`]: () => ({
      status: 201,
      body: { ...created, templateKey: null },
    }),
  });
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  await userEvent.click(screen.getByRole("button", { name: "Add row to Monthly fixed costs" }));
  const name = await screen.findByRole("textbox", { name: "Name of this row" });
  await waitFor(() => expect(name).toHaveFocus());
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    category: "monthly_fixed",
    name: "",
  });
});

test("the Piaya rows add up to design-spec 8.3", async () => {
  costsApi();
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getByText("₱169,500")).toBeInTheDocument();
  expect(screen.getByText("₱41,700")).toBeInTheDocument();
  expect(screen.getByText("₱218.50 / sale")).toBeInTheDocument();
  expect(screen.getByText("6.9 / day")).toBeInTheDocument();
  expect(screen.getByText("Subtotal ₱169,500")).toBeInTheDocument();
});

test("rows that are Empty or Unknown make the total a lower bound with a breakdown", async () => {
  const rows = [
    ["Equipment", 60000],
    ["Renovation", 30000],
    ["Lease Deposit", 30000],
    ["Permits", null],
    ["Initial Inventory", null, "unknown"],
    ["Branding", 100000],
    ["Launch Marketing", 80000],
    ["Tech Setup", null, "unknown"],
    ["Working Capital Buffer", 150000],
    ["Other", null, "unknown"],
  ] as const;
  costsApi(
    {},
    {
      rows: rows.map(([name, amount, state]) => ({
        category: "initial" as const,
        key: `initial.${name}`,
        name,
        amount,
        state,
      })),
    },
  );
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getAllByText("₱450,000+").length).toBeGreaterThan(0);
  expect(screen.getAllByText("3 Unknown, 1 Empty").length).toBeGreaterThan(0);
  expect(screen.getByText("Subtotal ₱450,000+")).toBeInTheDocument();
});

test("a new set of rows shows Empty totals and the hint to fill them in", async () => {
  costsApi(
    {},
    {
      rows: [
        { category: "initial", key: "initial.equipment", name: "Equipment" },
        { category: "monthly_fixed", key: "monthly.rent", name: "Rent" },
        { category: "variable", key: "variable.materials", name: "Materials" },
      ],
    },
  );
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(
    screen.getByText(
      "Fill in what you know. Mark the rest Unknown, or delete rows you don't need.",
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Empty").length).toBeGreaterThanOrEqual(3);
});

test("a table with no rows says so", async () => {
  costsApi(
    {},
    { rows: [{ category: "initial", key: "initial.equipment", name: "Equipment", amount: 5 }] },
  );
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getAllByText("No rows")).toHaveLength(2);
});

test("Delete in the row menu removes the row from the table and the totals", async () => {
  const items = costItems(PIAYA_ROWS);
  const rent = rowNamed(items, "Rent");
  const { calls } = costsApi(
    { [`DELETE /api/v1/cost-items/${rent.id}`]: () => ({ status: 204 }) },
    { items },
  );
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getByText("₱41,700")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Actions for Rent" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await waitFor(() => expect(screen.getByText("₱29,700")).toBeInTheDocument());
  expect(screen.queryByRole("textbox", { name: "Name of Rent" })).not.toBeInTheDocument();
  expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
});

test("a save the server refuses shows Couldn't save beside the row and in the header, and Retry never turns it into Saved", async () => {
  const items = costItems(PIAYA_ROWS);
  const rent = rowNamed(items, "Rent");
  let patches = 0;
  const { calls } = costsApi(
    {
      [COST_ITEM(rent.id)]: () => {
        patches += 1;
        return {
          status: 409,
          body: { error: { code: "ARCHIVED", message: "archived", requestId: "abcdef12" } },
        };
      },
    },
    { items },
  );
  await renderApp(COSTS_PATH());
  await screen.findByRole("heading", { name: "Totals" });
  const field = screen.getByRole("textbox", { name: "Amount of Rent" });
  await userEvent.click(field);
  await userEvent.keyboard("{Control>}a{/Control}13,500");
  await userEvent.tab();

  const row = (await screen.findByRole("textbox", { name: /^Name of Rent/ })).closest(
    '[role="row"]',
  ) as HTMLElement;
  expect(await within(row).findByText("Couldn't save")).toBeInTheDocument();
  expect(
    within(row).getByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
  expect(screen.getAllByText("Couldn't save").length).toBeGreaterThan(1);

  const header = screen.getByRole("banner");
  await userEvent.click(within(header).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(patches).toBe(2));
  expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2);
  expect(within(header).queryByText("Saved")).toBeNull();
  expect(within(header).getByText("Couldn't save")).toBeInTheDocument();

  await userEvent.click(within(row).getByRole("button", { name: "Retry" }));
  await waitFor(() => expect(patches).toBe(3));
  expect(within(header).queryByText("Saved")).toBeNull();
}, 15_000);

test("a failed save shows its notice once while the row's sheet is open over the table", async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  try {
    const items = costItems(PIAYA_ROWS);
    const rent = rowNamed(items, "Rent");
    costsApi(
      {
        [COST_ITEM(rent.id)]: () => ({
          status: 409,
          body: { error: { code: "ARCHIVED", message: "archived", requestId: "abcdef12" } },
        }),
      },
      { items },
    );
    await renderApp(COSTS_PATH());
    const cell = (await screen.findAllByText("Rent"))[0] as HTMLElement;
    await userEvent.click(cell);
    const dialog = await screen.findByRole("dialog");
    const field = within(dialog).getByRole("textbox", { name: "Amount of Rent" });
    await userEvent.click(field);
    await userEvent.keyboard("{Control>}a{/Control}13,500");
    await userEvent.tab();
    await within(dialog).findByText("Couldn't save");
    // The header's status and the sheet's notice; the table behind the sheet adds none.
    expect(screen.getAllByText("Couldn't save", { exact: true })).toHaveLength(2);
  } finally {
    window.matchMedia = original;
  }
}, 15_000);
