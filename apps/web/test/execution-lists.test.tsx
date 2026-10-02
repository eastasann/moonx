import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  ACTIONS,
  EXECUTION_PATH,
  executionApi,
  MILESTONES,
  registerPlanHooks,
} from "./support-execution";

registerPlanHooks();

const rowTexts = (list: HTMLElement) =>
  within(list)
    .getAllByRole("row")
    .map((row) => row.textContent ?? "");

test("Milestones is the first tab and every tab shows its count", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH());
  expect(await screen.findByRole("tab", { name: "Milestones (3)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await waitFor(() => expect(screen.getByRole("tab", { name: "Launch (4)" })).toBeInTheDocument());
  expect(screen.getByRole("tab", { name: "KPIs (3)" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Open Questions (0)" })).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Next Actions (4)" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1, name: "Execution" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "← Plan A" })).toHaveAttribute(
    "href",
    expect.stringMatching(/\/plans\/77777777-7777-4777-8777-777777777777$/),
  );
});

test("milestone rows show the assignee, deadline, status and the overdue label", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH());
  const rows = rowTexts(await screen.findByRole("grid", { name: "Milestones" }));
  expect(rows[0]).toContain("Business decision");
  expect(rows[0]).toContain("Done");
  expect(rows[1]).toContain("Assignee: Ana Villanueva");
  expect(rows[1]).toContain("Due Sep 15, 2026");
  expect(rows[1]).toContain("Doing");
  expect(rows[1]).toContain("Overdue");
  expect(rows[2]).toContain("Unassigned");
  expect(screen.getByText("Choose an item to see its details.")).toBeInTheDocument();
});

test("Launch rows are grouped by time bucket in the bucket order, buckets without rows left out", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH("?tab=launch"));
  const first = await screen.findByRole("grid", { name: "T-30" });
  expect(rowTexts(first).map((text) => text.split("Assignee")[0]?.split("Unassigned")[0])).toEqual([
    "30 days before launch",
    "Print flyers",
  ]);
  const headings = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
  expect(headings).toEqual(["T-30", "Launch day", "Other"]);
  expect(screen.queryByRole("grid", { name: "T-7" })).toBeNull();
  expect(rowTexts(screen.getByRole("grid", { name: "Other" }))[0]).toContain("Thank-you post");
});

test("KPIs are grouped by Area and show the target and the latest actual", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH("?tab=kpis"));
  const financial = await screen.findByRole("grid", { name: "Financial" });
  const rows = rowTexts(financial);
  expect(rows[0]).toContain("Revenue");
  expect(rows[0]).toContain("Target: ₱100k");
  expect(rows[1]).toContain("Cash Balance");
  expect(rows[1]).toContain("Actual: ₱42k");
  expect(rowTexts(screen.getByRole("grid", { name: "Customer" }))[0]).toContain("Repeat Rate");
  expect(screen.queryByText("To do")).toBeNull();
});

test("Next Actions come in due-date order with undated last, and the overdue one is labelled", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH("?tab=actions"));
  const rows = rowTexts(await screen.findByRole("grid", { name: "Next Actions" }));
  expect(rows.map((text) => ACTIONS.find((a) => text.startsWith(a.title))?.title)).toEqual([
    "File permit",
    "Call the landlord",
    "Order boxes",
    "Pick a logo",
  ]);
  expect(rows[0]).toContain("Assignee: Uncle Ben");
  expect(rows[0]).toContain("Overdue");
  expect(rows[1]).not.toContain("Overdue");
});

test("Next Actions filter by assignee, status and overdue", async () => {
  executionApi();
  const user = userEvent.setup();
  const { router } = await renderApp(EXECUTION_PATH("?tab=actions"));
  await screen.findByRole("grid", { name: "Next Actions" });

  await user.click(screen.getByRole("button", { name: /Assignee/ }));
  await user.click(await screen.findByRole("option", { name: "Me" }));
  await waitFor(() =>
    expect(rowTexts(screen.getByRole("grid", { name: "Next Actions" }))).toHaveLength(1),
  );
  expect(router.state.location.search).toMatchObject({ tab: "actions", assignee: "me" });
  expect(screen.getByRole("grid", { name: "Next Actions" })).toHaveTextContent("Call the landlord");

  await user.click(screen.getByRole("button", { name: /Assignee/ }));
  await user.click(await screen.findByRole("option", { name: "Anyone" }));
  await user.click(screen.getByRole("button", { name: /Status/ }));
  await user.click(await screen.findByRole("option", { name: "Done" }));
  await waitFor(() =>
    expect(rowTexts(screen.getByRole("grid", { name: "Next Actions" }))).toHaveLength(1),
  );
  expect(screen.getByRole("grid", { name: "Next Actions" })).toHaveTextContent("Pick a logo");
  expect(router.state.location.search).toMatchObject({ status: "done" });

  await user.click(screen.getByRole("button", { name: /Status/ }));
  await user.click(await screen.findByRole("option", { name: "Any status" }));
  await user.click(screen.getByRole("switch", { name: "Overdue only" }));
  await waitFor(() =>
    expect(rowTexts(screen.getByRole("grid", { name: "Next Actions" }))).toHaveLength(1),
  );
  expect(screen.getByRole("grid", { name: "Next Actions" })).toHaveTextContent("File permit");
});

test("filters that match nothing say so", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH("?tab=actions&assignee=55555555-0000-4000-8000-000000000002"));
  expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
});

test("each tab has an empty state with an explanation and + Add", async () => {
  executionApi({}, { items: [] });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH());
  expect(await screen.findByText("No milestones yet")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
  const cases: [string, string][] = [
    ["Launch (0)", "No launch steps yet"],
    ["KPIs (0)", "No KPIs yet"],
    ["Open Questions (0)", "No open questions yet"],
    ["Next Actions (0)", "No next actions yet"],
  ];
  for (const [tab, heading] of cases) {
    await user.click(screen.getByRole("tab", { name: tab }));
    expect(await screen.findByText(heading)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument();
  }
});

test("a link to an item without a tab opens the tab the item is in", async () => {
  executionApi();
  const target = ACTIONS[1];
  await renderApp(EXECUTION_PATH(`?item=${target?.id}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Call the landlord" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: /^Next Actions/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});

test("switching a tab clears the open item and puts the tab in the address", async () => {
  executionApi();
  const user = userEvent.setup();
  const { router } = await renderApp(EXECUTION_PATH(`?item=${MILESTONES[0]?.id}`));
  await screen.findByRole("heading", { level: 2, name: "Business decision" });
  await user.click(screen.getByRole("tab", { name: /^Launch/ }));
  await screen.findByRole("grid", { name: "T-30" });
  expect(router.state.location.search).toEqual({ tab: "launch" });
});
