import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { costsApi, ECONOMICS_PATH, registerCostHooks } from "./support-costs";

registerCostHooks();

const row = (label: string) => screen.getByText(label).closest("tr") as HTMLElement;

test("Piaya's numbers show design-spec 8.3 in unit economics, break-even and scenarios", async () => {
  costsApi();
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(screen.getByText("₱218.50")).toBeInTheDocument();
  expect(screen.getByText("₱231.50")).toBeInTheDocument();
  expect(screen.getByText("51.4%")).toBeInTheDocument();
  expect(screen.getByText("6.9 / day")).toBeInTheDocument();
  expect(screen.getByText("180.1 / month · ₱81,058 / month")).toBeInTheDocument();
  expect(screen.getByText("Costs from 05: Startup ₱169,500 · Monthly ₱41,700")).toBeInTheDocument();

  const units = within(row("Units / month"));
  expect(units.getByText("260")).toBeInTheDocument();
  expect(within(row("Revenue")).getByText("₱117,000")).toBeInTheDocument();
  expect(within(row("Variable cost")).getByText("₱56,810")).toBeInTheDocument();
  expect(within(row("Operating profit")).getByText("₱18,490")).toBeInTheDocument();
  expect(within(row("Margin")).getByText("15.8%")).toBeInTheDocument();
  expect(screen.getByText(/254\.3/)).toBeInTheDocument();
  expect(within(row("Units / month")).getByText("156")).toBeInTheDocument();
  const tile = (label: string) => screen.getByText(label).closest("div") as HTMLElement;
  expect(within(tile("Payback")).getByText("9.2 months")).toBeInTheDocument();
  expect(within(tile("ROI")).getByText("130.9% / year")).toBeInTheDocument();
});

test("a loss is shown as it is, with its minus sign", async () => {
  costsApi();
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(within(row("Operating profit")).getByText("−₱5,586")).toBeInTheDocument();
  expect(within(row("Revenue")).getByText("₱70,200")).toBeInTheDocument();
});

test("the empty target margin says the default 15% is used", async () => {
  costsApi();
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(screen.getAllByText("using default 15%").length).toBeGreaterThan(0);
  expect(screen.getByText("9.8 / day")).toBeInTheDocument();
});

test("typed daily volumes show as typed, Capacity included; only break-even is rounded", async () => {
  costsApi(
    {},
    {
      inputs: {
        selling_price: 450,
        operating_days: 26,
        units_conservative: 6.25,
        units_expected: 10,
        units_strong: 12.125,
        units_capacity: 25.5,
      },
    },
  );
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  const perDay = within(row("Units / day"));
  expect(perDay.getByText("6.25")).toBeInTheDocument();
  expect(perDay.getByText("12.125")).toBeInTheDocument();
  expect(perDay.getByText("25.5")).toBeInTheDocument();
  expect(perDay.getByText("6.9")).toBeInTheDocument();
});
