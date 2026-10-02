import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import { registerPlanHooks, viewerMe, writes } from "./support-execution";
import { ITEM_PATH, planItemApi } from "./support-plan-item";

registerPlanHooks();

const tile = (label: string) =>
  screen.getByText(label, { selector: "dt" }).closest("dl") as HTMLElement;

test("linked numbers show read only with their names and no input, in the workspace currency", async () => {
  const { calls } = planItemApi();
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByText("Startup cost", { selector: "dt" })).toBeInTheDocument();
  expect(within(tile("Startup cost")).getByText("₱169,500")).toBeInTheDocument();
  expect(within(tile("Break-even units / month")).getByText("208")).toBeInTheDocument();
  expect(within(tile("Expected revenue / month")).getByText("₱120,000")).toBeInTheDocument();
  expect(within(tile("Payback (months)")).getByText("9.2")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "Prompt of Key numbers" })).toBeNull();
  expect(writes(calls)).toHaveLength(0);
});

test("the link goes to where the numbers are entered, and a Viewer gets none", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByRole("link", { name: "Edit in validation" })).toHaveAttribute(
    "href",
    "/w/11111111-1111-4111-8111-111111111111/ideas/55555555-5555-4555-8555-555555555555/economics",
  );
});

test("a Viewer sees the numbers without the link", async () => {
  planItemApi({}, { me: viewerMe() });
  await renderApp(ITEM_PATH(1));
  expect(await screen.findByText("Startup cost", { selector: "dt" })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Edit in validation" })).toBeNull();
});

test("a number that cannot be computed reads Empty with the reason, and links to the costs", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(8));
  const fixed = await screen.findByText("Monthly fixed cost", { selector: "dt" });
  const box = fixed.closest("dl") as HTMLElement;
  expect(within(box).getByText("Empty")).toBeInTheDocument();
  expect(within(box).getByText("Needs monthly costs")).toBeInTheDocument();
  const links = screen.getAllByRole("link", { name: "Edit in validation" });
  expect(links.map((link) => link.getAttribute("href")?.split("/").at(-1))).toEqual([
    "economics",
    "economics",
    "costs",
  ]);
});

test("a scenario sub-item shows that column of the scenario table", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(8));
  expect(await screen.findByRole("heading", { level: 3, name: "Expected" })).toBeInTheDocument();
  expect(within(tile("Units / day")).getByText("14")).toBeInTheDocument();
  expect(within(tile("Operating profit")).getByText("₱18,490")).toBeInTheDocument();
  expect(within(tile("Margin")).getByText("31%")).toBeInTheDocument();
});

test("a number with no name of its own takes the sub-item's title", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(18));
  const payroll = await screen.findByText("Expected monthly payroll", { selector: "dt" });
  expect(within(payroll.closest("dl") as HTMLElement).getByText("₱30,000")).toBeInTheDocument();
});

test("every reference is a collapsible block with its data and a link to the source", async () => {
  planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(14));
  expect(await screen.findByRole("heading", { level: 2, name: "References" })).toBeInTheDocument();
  const titles = [
    "Validation answers",
    "Competitors",
    "Cost rows",
    "Research log",
    "Key assumptions",
    "Key risks",
    "Decision log",
    "Key numbers",
  ];
  for (const title of titles) {
    expect(screen.getByRole("button", { name: title })).toHaveAttribute("aria-expanded", "false");
  }
  await user.click(screen.getByRole("button", { name: "Validation answers" }));
  expect(screen.getByText("Offices in Bacolod")).toBeInTheDocument();
  expect(screen.getByText("Not written yet")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Competitors" }));
  expect(screen.getByText("Gift Hub")).toBeInTheDocument();
  expect(screen.getByText("Direct Competitor")).toBeInTheDocument();
  expect(screen.getByText("Typical price: ₱500")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Cost rows" }));
  expect(screen.getByText("₱25,000")).toBeInTheDocument();
  expect(screen.getByText("3%")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Research log" }));
  expect(screen.getByText(/Sep 10, 2026 Permit office visit/)).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Key assumptions" }));
  expect(screen.getByText("Offices order monthly")).toBeInTheDocument();
  expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Key risks" }));
  expect(screen.getByText("Permit delay")).toBeInTheDocument();
  expect(screen.getByText("Probability: High")).toBeInTheDocument();
  expect(screen.getByText("Impact: Medium")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Decision log" }));
  expect(screen.getByText("Numbers work")).toBeInTheDocument();
  expect(screen.getByText("Proceed")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Key numbers" }));
  expect(screen.getByText("Capacity limit / day", { selector: "dt" })).toBeInTheDocument();

  const hrefs = screen
    .getAllByRole("link", { name: "Open the source" })
    .map((link) => link.getAttribute("href")?.replace(/^\/w\/[^/]+/, ""));
  expect(hrefs).toEqual([
    "/ideas/55555555-5555-4555-8555-555555555555/questions/01",
    "/ideas/55555555-5555-4555-8555-555555555555/competitors",
    "/ideas/55555555-5555-4555-8555-555555555555/costs",
    "/ideas/55555555-5555-4555-8555-555555555555/research",
    "/ideas/55555555-5555-4555-8555-555555555555/assumptions",
    "/ideas/55555555-5555-4555-8555-555555555555/assumptions",
    "/decisions",
    "/ideas/55555555-5555-4555-8555-555555555555/economics",
  ]);
});

test("the self analysis reference lets a person pick whose to read", async () => {
  planItemApi();
  const user = userEvent.setup();
  await renderApp(ITEM_PATH(2));
  await user.click(await screen.findByRole("button", { name: "Self analysis" }));
  expect(screen.getByText("Ana's reason")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Member/ }));
  await user.click(await screen.findByRole("option", { name: "Paolo Reyes" }));
  expect(await screen.findByText("Paolo's reason")).toBeInTheDocument();
  expect(screen.queryByText("Ana's reason")).toBeNull();
});

test("an item with no references shows no References block", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(1));
  await screen.findByRole("heading", { level: 1, name: "1. Executive Summary" });
  expect(screen.queryByRole("heading", { name: "References" })).toBeNull();
});

test("the ownership totals are not listed among the references", async () => {
  planItemApi();
  await renderApp(ITEM_PATH(13));
  await screen.findByRole("heading", { level: 1, name: /Ownership/ });
  expect(screen.queryByRole("heading", { name: "References" })).toBeNull();
});
