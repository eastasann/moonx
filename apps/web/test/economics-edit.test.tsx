import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { costsApi, ECONOMICS_FIELD, ECONOMICS_PATH, registerCostHooks } from "./support-costs";

registerCostHooks();

test("changing the selling price recalculates the results at once and saves on leaving", async () => {
  const { calls } = costsApi({
    [ECONOMICS_FIELD("selling_price")]: ({ body }) => ({
      body: {
        fieldKey: "selling_price",
        ...(body as object),
        classification: {
          fau: "assumption",
          confidence: "medium",
          state: "assumption",
          evidence: [],
        },
        commentCount: 0,
        lockVersion: 2,
        updatedAt: null,
        updatedBy: null,
      },
    }),
  });
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(screen.getByText("₱231.50")).toBeInTheDocument();

  const field = screen.getByRole("textbox", { name: "Selling price" });
  await userEvent.click(field);
  await userEvent.keyboard("{Control>}a{/Control}500");
  expect(screen.getByText("₱280.00")).toBeInTheDocument();
  expect(calls.filter((c) => c.method === "PUT")).toHaveLength(0);

  await userEvent.tab();
  await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(1));
  expect(calls.find((c) => c.method === "PUT")?.body).toMatchObject({ value: 500, lockVersion: 1 });
});

test("an empty price is not 0: the results say what is missing instead of showing zeros", async () => {
  costsApi({}, { inputs: { selling_price: null, operating_days: 26, units_expected: 10 } });
  await renderApp(ECONOMICS_PATH());
  await screen.findByText("Unit economics");
  expect(screen.getAllByText("Needs price").length).toBeGreaterThan(0);
  expect(screen.queryByText("₱0.00")).not.toBeInTheDocument();
});
