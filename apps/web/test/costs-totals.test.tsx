import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { COSTS_PATH, costsApi, registerCostHooks } from "./support-costs";

registerCostHooks();

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
