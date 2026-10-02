import { fireEvent, screen, waitFor } from "@testing-library/react";
import { expect, test } from "vitest";
import { costItem } from "./cost-fixtures";
import { VALIDATION_ID } from "./question-fixtures";
import { renderApp } from "./support";
import { COSTS_PATH, costsApi, registerCostHooks } from "./support-costs";

registerCostHooks();

test("Add row creates the row at the end of its table and focuses its name", async () => {
  const created = costItem(
    { category: "monthly_fixed", key: "", name: "New row", amount: null, state: "empty" },
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
  fireEvent.click(screen.getByRole("button", { name: "Add row to Monthly fixed costs" }));
  const name = await screen.findByRole("textbox", { name: "Name of New row" });
  await waitFor(() => expect(name).toHaveFocus());
  expect(calls.find((c) => c.method === "POST")?.body).toEqual({
    category: "monthly_fixed",
    name: "New row",
  });
});
