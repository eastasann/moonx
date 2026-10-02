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
  PAOLO,
  registerPlanHooks,
  writes,
} from "./support-execution";

registerPlanHooks();

const patchesOf = (calls: { method: string; url: URL; body: unknown }[]) =>
  writes(calls).filter((call) => call.method === "PATCH");

test("a milestone opens with every column of the original table, Owner read as Assignee", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Legal / company setup" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^Milestone/ })).toHaveValue("Legal / company setup");
  expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("");
  expect(screen.getByRole("textbox", { name: "Exit Condition" })).toHaveValue("Registered");
  expect(screen.getByRole("button", { name: /Assignee/ })).toHaveTextContent("Ana Villanueva");
  expect(screen.getByRole("group", { name: "Deadline" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Doing" })).toBeChecked();
  expect(screen.getAllByText("Overdue")).toHaveLength(2);
  expect(
    screen.getByText("Deadline notifications reach only members chosen from the list."),
  ).toBeInTheDocument();
});

test("renaming a preset row saves the title with the row's version and updates the list", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[0]?.id}`));
  const field = await screen.findByRole("textbox", { name: /^Milestone/ });
  await user.clear(field);
  await user.type(field, "Go decision");
  await user.tab();
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({ title: "Go decision", lockVersion: 1 });
  expect(await screen.findByRole("heading", { level: 2, name: "Go decision" })).toBeInTheDocument();
  expect(
    within(screen.getByRole("grid", { name: "Milestones" })).getAllByRole("row")[0],
  ).toHaveTextContent("Go decision");
});

test("an empty name is not sent and says it is required", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[2]?.id}`));
  const field = await screen.findByRole("textbox", { name: /^Milestone/ });
  await user.clear(field);
  await user.tab();
  expect(await screen.findByText("Required")).toBeInTheDocument();
  expect(patchesOf(calls)).toHaveLength(0);
});

test("choosing a status saves at once and a finished item loses its overdue label", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  await user.click(await screen.findByRole("radio", { name: "Done" }));
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({ status: "done", lockVersion: 1 });
  await waitFor(() => expect(screen.queryByText("Overdue")).toBeNull());
});

test("choosing a member sends that member and clears the written name", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?tab=actions&item=${ACTION_WITH_NAME()}`));
  await screen.findByRole("heading", { level: 2, name: "File permit" });
  expect(screen.getByRole("textbox", { name: "Assignee name" })).toHaveValue("Uncle Ben");
  await user.click(screen.getAllByRole("button", { name: /Assignee/ }).at(-1) as HTMLElement);
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual([
    "Unassigned",
    "Ana Villanueva",
    "Paolo Reyes",
    "Someone else",
  ]);
  await user.click(screen.getByRole("option", { name: PAOLO.displayName }));
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({
    assigneeUserId: PAOLO.id,
    assigneeName: null,
    lockVersion: 1,
  });
  expect(screen.queryByRole("textbox", { name: "Assignee name" })).toBeNull();
});

test("a name written by hand is sent alone, the member sent as null", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  await user.click(await screen.findByRole("button", { name: /Assignee/ }));
  await user.click(await screen.findByRole("option", { name: "Someone else" }));
  expect(patchesOf(calls)).toHaveLength(0);
  const name = await screen.findByRole("textbox", { name: "Assignee name" });
  await user.type(name, "Uncle Ben");
  await user.tab();
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({
    assigneeUserId: null,
    assigneeName: "Uncle Ben",
    lockVersion: 1,
  });
});

test("Unassigned clears both kinds of assignee", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  await user.click(await screen.findByRole("button", { name: /Assignee/ }));
  await user.click(await screen.findByRole("option", { name: "Unassigned" }));
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({
    assigneeUserId: null,
    assigneeName: null,
    lockVersion: 1,
  });
});

test("a KPI has no status, and shows when its Actual was last updated", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?tab=kpis&item=${KPIS[2]?.id}`));
  await screen.findByRole("heading", { level: 2, name: "Cash Balance" });
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByText("Actual updated Sep 30, 2026")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Area" })).toHaveValue("Financial");
  expect(screen.getByRole("textbox", { name: "Target" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Review Frequency" })).toBeInTheDocument();
  const actual = screen.getByRole("textbox", { name: "Actual" });
  await user.clear(actual);
  await user.type(actual, "₱55k");
  await user.tab();
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({ kpiActual: "₱55k", lockVersion: 1 });
});

test("a Launch row keeps its Timing text apart from its time bucket and moves when the bucket changes", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?tab=launch&item=${LAUNCH[3]?.id}`));
  await screen.findByRole("heading", { level: 2, name: "Thank-you post" });
  expect(screen.getByRole("textbox", { name: /^Timing/ })).toHaveValue("Thank-you post");
  expect(screen.getByRole("button", { name: /Time bucket/ })).toHaveTextContent("Other");
  await user.click(screen.getByRole("button", { name: /Time bucket/ }));
  await user.click(await screen.findByRole("option", { name: "T-7" }));
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  expect(patchesOf(calls)[0]?.body).toEqual({ launchTiming: "t_minus_7", lockVersion: 1 });
  expect(await screen.findByRole("grid", { name: "T-7" })).toHaveTextContent("Thank-you post");
  expect(screen.queryByRole("grid", { name: "Other" })).toBeNull();
});

test("the version a save returned is used for the next save of the same row", async () => {
  const { calls } = executionApi();
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[2]?.id}`));
  const goal = await screen.findByRole("textbox", { name: "Goal" });
  await user.type(goal, "Open the doors");
  await user.tab();
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(1));
  await user.type(screen.getByRole("textbox", { name: "Exit Condition" }), "Keys in hand");
  await user.tab();
  await waitFor(() => expect(patchesOf(calls)).toHaveLength(2));
  expect(patchesOf(calls).map((call) => call.body)).toEqual([
    { goal: "Open the doors", lockVersion: 1 },
    { exitCondition: "Keys in hand", lockVersion: 2 },
  ]);
});

const ACTION_WITH_NAME = () => ACTIONS[0]?.id;
