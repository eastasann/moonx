import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  ACTIONS,
  EXECUTION_PATH,
  executionApi,
  KPIS,
  LAUNCH,
  MILESTONES,
  PLAN,
  registerPlanHooks,
  writes,
} from "./support-execution";

registerPlanHooks();

const names = (grid: HTMLElement) =>
  within(grid)
    .getAllByRole("row")
    .map(
      (row) =>
        MILESTONES.concat(LAUNCH, KPIS, ACTIONS).find((i) => row.textContent?.startsWith(i.title))
          ?.title,
    );

test("+ Add on Milestones asks for the name only and creates the row, then opens it", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH());
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  expect(
    await screen.findByRole("heading", { level: 2, name: "New Milestone" }),
  ).toBeInTheDocument();
  const submit = screen.getByRole("button", { name: "Add" });
  expect(submit).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: /^Milestone/ }), "Hire a cook");
  await user.click(submit);
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "POST",
    body: { type: "milestone", title: "Hire a cook" },
  });
  expect(await screen.findByRole("heading", { level: 2, name: "Hire a cook" })).toBeInTheDocument();
  expect(within(screen.getByRole("grid", { name: "Milestones" })).getAllByRole("row")).toHaveLength(
    4,
  );
});

test("a new Launch row starts in Other and can be put in another bucket", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH("?tab=launch"));
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  expect(await screen.findByRole("button", { name: /Time bucket/ })).toHaveTextContent("Other");
  await user.type(screen.getByRole("textbox", { name: /^Timing/ }), "Soft opening");
  await user.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({
    type: "launch",
    title: "Soft opening",
    launchTiming: "other",
  });

  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  await user.type(await screen.findByRole("textbox", { name: /^Timing/ }), "Press visit");
  await user.click(screen.getByRole("button", { name: /Time bucket/ }));
  await user.click(await screen.findByRole("option", { name: "T-7" }));
  await user.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(2));
  expect(writes(calls)[1]?.body).toEqual({
    type: "launch",
    title: "Press visit",
    launchTiming: "t_minus_7",
  });
});

test("a new KPI takes its Area, which groups it", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH("?tab=kpis"));
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  await user.type(await screen.findByRole("textbox", { name: "Area" }), "Operations");
  await user.type(screen.getByRole("textbox", { name: /^KPI/ }), "Service Time");
  await user.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({
    type: "kpi",
    title: "Service Time",
    kpiArea: "Operations",
  });
  expect(await screen.findByRole("grid", { name: "Operations" })).toHaveTextContent("Service Time");
});

test("Cancel on the new-item form leaves nothing behind", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH("?tab=actions"));
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  await user.type(await screen.findByRole("textbox", { name: /^Action/ }), "Draft");
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.queryByRole("heading", { level: 2, name: "New Next action" })).toBeNull();
  expect(writes(calls)).toHaveLength(0);
});

test("a failed create shows the reason and keeps the form", async () => {
  executionApi({
    [`POST ${PLAN}/execution-items`]: () => ({
      status: 422,
      body: { error: { code: "VALIDATION_FAILED", message: "x", requestId: "r" } },
    }),
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH("?tab=questions"));
  await user.click(await screen.findByRole("button", { name: "+ Add" }));
  await user.type(await screen.findByRole("textbox", { name: /^Open Question/ }), "Who delivers?");
  await user.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText(/check the highlighted/i)).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^Open Question/ })).toHaveValue("Who delivers?");
});

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole("button", { name: `Actions for ${name}` }));
}

test("deleting asks first; confirming sends the delete and removes the row", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[2]?.id}`));
  await openMenu(user, "Launch readiness");
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText('Delete "Launch readiness"?')).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.method).toBe("DELETE");
  expect(writes(calls)[0]?.url.pathname).toBe(`/api/v1/execution-items/${MILESTONES[2]?.id}`);
  await waitFor(() =>
    expect(
      within(screen.getByRole("grid", { name: "Milestones" })).getAllByRole("row"),
    ).toHaveLength(2),
  );
  expect(screen.getByText("Choose an item to see its details.")).toBeInTheDocument();
});

test("cancelling the delete keeps the row", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[0]?.id}`));
  await openMenu(user, "Business decision");
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }),
  );
  expect(writes(calls)).toHaveLength(0);
  expect(screen.getByRole("heading", { level: 2, name: "Business decision" })).toBeInTheDocument();
});

test("a failed delete leaves the row and says so", async () => {
  executionApi({
    [`DELETE /api/v1/execution-items/${MILESTONES[2]?.id}`]: () => ({
      status: 500,
      body: { error: { code: "INTERNAL", message: "x", requestId: "r" } },
    }),
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[2]?.id}`));
  await openMenu(user, "Launch readiness");
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }),
  );
  expect(await screen.findByText("Couldn't delete the item")).toBeInTheDocument();
  expect(within(screen.getByRole("grid", { name: "Milestones" })).getAllByRole("row")).toHaveLength(
    3,
  );
});

test("Move down sends every milestone id in the new order and the list follows the server", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[0]?.id}`));
  await openMenu(user, "Business decision");
  expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "PUT",
    body: { type: "milestone", ids: [MILESTONES[1]?.id, MILESTONES[0]?.id, MILESTONES[2]?.id] },
  });
  await waitFor(() =>
    expect(names(screen.getByRole("grid", { name: "Milestones" }))).toEqual([
      "Legal / company setup",
      "Business decision",
      "Launch readiness",
    ]),
  );
});

test("a launch row moves within its bucket, keeping its place among the other buckets' rows", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?tab=launch&item=${LAUNCH[2]?.id}`));
  await openMenu(user, "Print flyers");
  await user.click(await screen.findByRole("menuitem", { name: "Move up" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  // The rows by sort order are [30 days, Launch day, Print flyers, Thank-you]; flyers swaps with "30 days".
  expect((writes(calls)[0]?.body as { ids: string[] } | undefined)?.ids).toEqual([
    LAUNCH[2]?.id,
    LAUNCH[1]?.id,
    LAUNCH[0]?.id,
    LAUNCH[3]?.id,
  ]);
});

test("a failed move says so and the list stays as it was", async () => {
  executionApi({
    [`PUT ${PLAN}/execution-items/order`]: () => ({
      status: 500,
      body: { error: { code: "INTERNAL", message: "x", requestId: "r" } },
    }),
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[0]?.id}`));
  await openMenu(user, "Business decision");
  await user.click(await screen.findByRole("menuitem", { name: "Move down" }));
  expect(await screen.findByText("Couldn't move the item")).toBeInTheDocument();
  expect(names(screen.getByRole("grid", { name: "Milestones" }))[0]).toBe("Business decision");
});

test("Next Actions are placed by deadline, so their menu has no Move", async () => {
  executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?tab=actions&item=${ACTIONS[1]?.id}`));
  await openMenu(user, "Call the landlord");
  expect(await screen.findByRole("menuitem", { name: "Delete" })).toBeInTheDocument();
  expect(screen.queryByRole("menuitem", { name: "Move up" })).toBeNull();
});
