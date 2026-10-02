import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { MILESTONES, PLAN_ID, registerPlanHooks, viewerMe, writes } from "./support-execution";
import { ALL_ITEMS, ITEM_23, ITEM_PATH, planItemApi, VERSION_ID } from "./support-plan-item";

registerPlanHooks();

test("an execution sub-item lists the live rows of its type and links to that tab of screen 22", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(23));
  const grid = await screen.findByRole("grid", { name: "Milestone" });
  expect(within(grid).getAllByRole("row")).toHaveLength(3);
  expect(screen.getByRole("link", { name: "Open in Execution" })).toHaveAttribute(
    "href",
    `/w/11111111-1111-4111-8111-111111111111/ideas/55555555-5555-4555-8555-555555555555/plans/${PLAN_ID}/execution?tab=milestones`,
  );
  expect(screen.getByText("1/1 answered")).toBeInTheDocument();
  expect(screen.getByText("Business decision: decide to go.")).toBeInTheDocument();
});

test("a row opens in a dialog with the same detail as screen 22, and edits save", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(23));
  const grid = await screen.findByRole("grid", { name: "Milestone" });
  await user.click(within(grid).getAllByRole("row")[2] as HTMLElement);
  const dialog = await screen.findByRole("dialog", { name: "Milestone" });
  expect(
    within(dialog).getByRole("heading", { level: 2, name: "Launch readiness" }),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: /Assignee/ })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Comments" })).toBeInTheDocument();
  const goal = within(dialog).getByRole("textbox", { name: "Goal" });
  await user.type(goal, "Doors open");
  await user.tab();
  await waitFor(() => expect(writes(calls).filter((c) => c.method === "PATCH")).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({ goal: "Doors open", lockVersion: 1 });
});

test("+ Add creates a row of that type in a dialog and opens it", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(23));
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  const dialog = await screen.findByRole("dialog", { name: "New Milestone" });
  await user.type(within(dialog).getByRole("textbox", { name: /^Milestone/ }), "Hire a cook");
  await user.click(within(dialog).getByRole("button", { name: "Add" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "POST",
    body: { type: "milestone", title: "Hire a cook" },
  });
  const detail = await screen.findByRole("dialog", { name: "Milestone" });
  expect(
    within(detail).getByRole("heading", { level: 2, name: "Hire a cook" }),
  ).toBeInTheDocument();
});

test("deleting from the dialog removes the row and closes it", async () => {
  const { calls } = planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(23));
  const grid = await screen.findByRole("grid", { name: "Milestone" });
  await user.click(within(grid).getAllByRole("row")[2] as HTMLElement);
  const dialog = await screen.findByRole("dialog", { name: "Milestone" });
  await user.click(within(dialog).getByRole("button", { name: "Actions for Launch readiness" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
  );
  await waitFor(() => expect(writes(calls)[0]?.method).toBe("DELETE"));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Milestone" })).toBeNull());
  await waitFor(() =>
    expect(
      within(screen.getByRole("grid", { name: "Milestone" })).getAllByRole("row"),
    ).toHaveLength(2),
  );
});

test("with no rows it says Nothing yet with + Add, and the item counts as unanswered", async () => {
  planItemApi({}, { items: [] });
  await renderApp(ITEM_PATH(23));
  expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
  expect(screen.getByText("0/1 answered")).toBeInTheDocument();
});

test("a Viewer can open a row to read it but has nothing to add", async () => {
  planItemApi({}, { me: viewerMe() });
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(23));
  const grid = await screen.findByRole("grid", { name: "Milestone" });
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  await user.click(within(grid).getAllByRole("row")[1] as HTMLElement);
  const dialog = await screen.findByRole("dialog", { name: "Milestone" });
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  expect(within(dialog).queryByRole("button", { name: /^Actions for/ })).toBeNull();
});

test("a saved version shows the rows it was saved with, read only and without panels", async () => {
  const saved = MILESTONES.slice(0, 1).map((row) => ({ ...row, title: "As saved" }));
  const { calls } = planItemApi(
    {},
    {
      versionItems: { 23: { ...ITEM_23, readOnly: true, execution: saved } },
      planItems: { ...ALL_ITEMS },
    },
  );
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(23, `?version=${VERSION_ID}`));
  const grid = await screen.findByRole("grid", { name: "Milestone" });
  expect(within(grid).getAllByRole("row")).toHaveLength(1);
  expect(grid).toHaveTextContent("As saved");
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  await user.click(within(grid).getAllByRole("row")[0] as HTMLElement);
  const dialog = await screen.findByRole("dialog", { name: "Milestone" });
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  expect(within(dialog).queryByRole("button", { name: "Comments" })).toBeNull();
  expect(calls.filter((c) => c.url.pathname.endsWith("/execution-items"))).toHaveLength(0);
});
