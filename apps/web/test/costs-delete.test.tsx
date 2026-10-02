import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { Costs } from "../src/screens/Costs";
import { costItems, PIAYA_ROWS } from "./cost-fixtures";
import { IDEA_ID } from "./question-fixtures";
import { WORKSPACE } from "./support";
import { renderBare } from "./support-bare";
import { costsApi, registerCostHooks, rowNamed } from "./support-costs";

registerCostHooks();

// One overlay test per file, rendered without the app frame (see support-bare).
test("Delete in the row menu removes the row from the table and the totals", async () => {
  const items = costItems(PIAYA_ROWS);
  const rent = rowNamed(items, "Rent");
  const { calls } = costsApi(
    { [`DELETE /api/v1/cost-items/${rent.id}`]: () => ({ status: 204 }) },
    { items },
  );
  renderBare(<Costs workspaceId={WORKSPACE} ideaId={IDEA_ID} />);
  await screen.findByRole("heading", { name: "Totals" });
  expect(screen.getByText("₱41,700")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Actions for Rent" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await waitFor(() => expect(screen.getByText("₱29,700")).toBeInTheDocument());
  expect(screen.queryByRole("textbox", { name: "Name of Rent" })).not.toBeInTheDocument();
  expect(calls.filter((c) => c.method === "DELETE")).toHaveLength(1);
});
