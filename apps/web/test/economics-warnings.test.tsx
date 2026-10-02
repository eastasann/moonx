import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { costsApi, ECONOMICS_PATH, registerCostHooks } from "./support-costs";

registerCostHooks();

test("a price below the variable cost warns about the margin and shows the negative contribution", async () => {
  costsApi(
    {},
    { inputs: { selling_price: 200, operating_days: 26, units_expected: 10, units_capacity: 25 } },
  );
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(
    screen.getAllByText("Contribution margin is zero or negative. Review price or variable costs.")
      .length,
  ).toBeGreaterThan(0);
  expect(screen.getByText("−₱11.00")).toBeInTheDocument();
});

test("scenarios above the capacity limit are warned about by name", async () => {
  costsApi(
    {},
    {
      inputs: {
        selling_price: 450,
        operating_days: 26,
        units_conservative: 6,
        units_expected: 30,
        units_strong: 40,
        units_capacity: 25,
      },
    },
  );
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(screen.getByText("Expected exceeds capacity limit")).toBeInTheDocument();
  expect(screen.getByText("Strong exceeds capacity limit")).toBeInTheDocument();
  expect(screen.queryByText("Conservative exceeds capacity limit")).not.toBeInTheDocument();
});
