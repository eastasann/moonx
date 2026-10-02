import { screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  IDEA,
  IDEA_URL,
  makePlanHome,
  openPlanHome,
  PLAN,
  PLAN_URL,
  VERSION,
  WORKSPACE,
} from "./support-plan-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tile = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;

test("the header shows the plan, its version state, the actions and the header fields", async () => {
  await openPlanHome();
  expect(screen.getByRole("link", { name: "Back to Piaya Gift Box Delivery" })).toHaveAttribute(
    "href",
    IDEA_URL,
  );
  expect(screen.getByText("Version: v1 For advisors + changes")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save version" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record Go/No-Go" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pitch Deck" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /^Business name/ })).toHaveValue("Piaya Gift Box Co.");
  expect(screen.getByRole("textbox", { name: /^Prepared by/ })).toHaveValue("Ana");
  expect(screen.getByText("Updated Oct 1, 2026")).toBeInTheDocument();
  expect(screen.queryByText(/Latest decision is/)).toBeNull();
});

test("the version state reads No version saved, a plain name, or the name with changes", async () => {
  const none = await openPlanHome({
    plan: makePlanHome({ latestVersion: null, hasChangesSinceVersion: false, versions: [] }),
  });
  expect(screen.getByText("Version: No version saved")).toBeInTheDocument();
  none.unmount();
  await openPlanHome({ plan: makePlanHome({ hasChangesSinceVersion: false }) });
  expect(screen.getByText("Version: v1 For advisors")).toBeInTheDocument();
});

test("the left column shows the key numbers, the latest Go / No-Go, versions and execution", async () => {
  await openPlanHome();
  expect(within(tile("Startup")).getByText("₱169,500")).toBeInTheDocument();
  expect(within(tile("Break-even")).getByText("6.9 / day")).toBeInTheDocument();
  expect(within(tile("Expected")).getByText("₱18,490 / month")).toBeInTheDocument();
  expect(within(tile("Payback")).getByText("9.2 months")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Edit in validation" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/economics`,
  );
  expect(screen.getByText("Delay")).toBeInTheDocument();
  expect(screen.getByText("Sep 28, 2026 · Ana Villanueva")).toBeInTheDocument();
  const versions = screen.getByRole("list", { name: "Versions" });
  expect(within(versions).getByRole("link", { name: "v1 For advisors" })).toHaveAttribute(
    "href",
    `${PLAN_URL}?version=${VERSION}`,
  );
  expect(screen.getByText("3 actions due soon")).toBeInTheDocument();
  expect(screen.getByText("1 overdue")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open the execution plan" })).toHaveAttribute(
    "href",
    `${PLAN_URL}/execution`,
  );
});

test("a plan with no Go / No-Go and no version says so", async () => {
  await openPlanHome({
    plan: makePlanHome({
      latestGoNoGo: null,
      latestVersion: null,
      versions: [],
      execution: { dueSoon: 0, overdue: 0 },
    }),
  });
  expect(screen.getByText("Not recorded yet")).toBeInTheDocument();
  expect(screen.getByText("No version saved yet")).toBeInTheDocument();
  expect(screen.getByText("Nothing due soon")).toBeInTheDocument();
});

test("the right column lists the parts with their progress and every item opens screen 21", async () => {
  await openPlanHome();
  const partA = screen.getByRole("list", { name: "Part A: Business Case" });
  expect(screen.getByText("7 / 10")).toBeInTheDocument();
  expect(screen.getByText("9 / 20")).toBeInTheDocument();
  const first = within(partA).getByRole("link", { name: "1 Executive Summary" });
  expect(first).toHaveAttribute("href", `${PLAN_URL}/items/1`);
  const row = first.closest("li") as HTMLElement;
  expect(within(row).getByText("V")).toBeInTheDocument();
  expect(within(row).getByText("5/6")).toBeInTheDocument();
  expect(within(row).getByText("1 comment")).toBeInTheDocument();
  const second = within(partA).getByRole("link", { name: "2 Vision & Purpose" });
  expect(within(second.closest("li") as HTMLElement).getByText("S")).toBeInTheDocument();
  const partB = screen.getByRole("list", { name: "Part B: Execution Plan" });
  expect(within(partB).getByRole("link", { name: "11 Founder Roles" })).toHaveAttribute(
    "href",
    `${PLAN_URL}/items/11`,
  );
  expect(screen.queryByText(/Start with the items marked/)).toBeNull();
});

test("a draft whose answers are all copies points at the items that have validation data", async () => {
  await openPlanHome({ plan: makePlanHome({ draftOnly: true }) });
  expect(
    screen.getByText("Start with the items marked [V] — they already have your validation data."),
  ).toBeInTheDocument();
});

test.each([
  ["hold", "Hold"],
  ["drop", "Drop"],
] as const)("a %s decision shows the warning and hides Add plan", async (decision, text) => {
  const { user } = await openPlanHome({ plan: makePlanHome({ latestDecision: decision }) });
  expect(screen.getByText(`Latest decision is ${text}.`)).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Plans" }));
  expect(screen.queryByRole("menuitem", { name: "Add plan" })).toBeNull();
});

test("the plan switcher lists plans, groups archived ones and opens Add plan", async () => {
  const { user, router } = await openPlanHome();
  await user.click(screen.getByRole("button", { name: "Plans" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Plan A (current)" })).toBeInTheDocument();
  const archived = within(menu).getByRole("group", { name: "Archived" });
  expect(within(archived).getByText("Plan B")).toBeInTheDocument();
  await user.click(within(menu).getByRole("menuitem", { name: "Add plan" }));
  expect(router.state.location.search).toMatchObject({ modal: "create-plan" });
  expect(router.state.location.pathname).toBe(`${PLAN_URL}`);
});

test("Pitch Deck opens screen 23 of this plan", async () => {
  const { user, router } = await openPlanHome();
  await user.click(screen.getByRole("button", { name: "Pitch Deck" }));
  expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${IDEA}/plans/${PLAN}/pitch`);
});

test("the more menu opens AI export and AI import for this plan", async () => {
  const { user } = await openPlanHome();
  await user.click(screen.getByRole("button", { name: "More actions" }));
  expect(await screen.findByRole("menuitem", { name: "AI export" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/export?source=business_plan&id=${PLAN}`,
  );
  expect(screen.getByRole("menuitem", { name: "AI import" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/import?target=business_plan&id=${PLAN}`,
  );
  expect(screen.getByRole("menuitem", { name: "Rename plan" })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: "Archive plan" })).toBeInTheDocument();
});
