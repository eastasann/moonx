import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { costItems, PIAYA_ROWS } from "./cost-fixtures";
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
