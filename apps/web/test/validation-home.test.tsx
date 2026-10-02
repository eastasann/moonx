import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp, stubApi, WORKSPACE } from "./support";
import {
  HOME_PATH,
  HOME_URL,
  IDEA,
  makeDetail,
  makeFullHome,
  makeNewHome,
  meOf,
  PLAN,
  type Role,
} from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedIn = (role: Role = "owner") => ({
  "GET /api/v1/me": () => ({ body: meOf(role) }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});

const open = async (
  home = makeFullHome(),
  role: Role = "owner",
  extra: Parameters<typeof stubApi>[0] = {},
) => {
  const api = stubApi({
    ...signedIn(role),
    [`GET ${HOME_PATH}`]: () => ({ body: home }),
    ...extra,
  });
  const view = await renderApp(HOME_URL);
  await screen.findByRole("heading", { level: 1, name: home.idea.name });
  return { api, ...view };
};

const tile = (label: string) => {
  const term = screen.getByText(label, { selector: "dt" });
  return term.parentElement as HTMLElement;
};

const hrefOf = (name: string | RegExp) => screen.getByRole("link", { name }).getAttribute("href");

test("a new idea shows every number as Empty, no checks done and the first step", async () => {
  await open(makeNewHome());
  for (const label of ["Startup", "Break-even", "Expected", "Payback"]) {
    expect(within(tile(label)).getByText("Empty")).toBeInTheDocument();
  }
  expect(within(tile("Break-even")).getByText("Needs price")).toBeInTheDocument();
  const checks = screen.getByRole("list", { name: "Checks" });
  expect(within(checks).getAllByText("Not started")).toHaveLength(6);
  expect(within(checks).getByText("Competitors (3–5)")).toBeInTheDocument();
  expect(within(checks).getByText("18 rows are Empty")).toBeInTheDocument();
  const steps = screen.getByRole("list", { name: "Next steps" });
  const first = within(steps).getAllByRole("listitem")[0] as HTMLElement;
  expect(
    within(first).getByRole("link", { name: "Start with 01 Customer & Problem" }),
  ).toHaveAttribute("href", `/w/${WORKSPACE}/ideas/${IDEA}/questions/01`);
  expect(within(steps).getByRole("link", { name: "Find 3 competitors" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/competitors`,
  );
  const group = screen.getByRole("group", { name: "Items by F/A/U" });
  expect(within(group).getByText("18")).toBeInTheDocument();
  expect(screen.getByText("No decisions yet")).toBeInTheDocument();
  expect(screen.getByText("No plans yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add plan" })).toBeNull();
  const summary = screen.getByRole("list", { name: "Summary" });
  expect(within(summary).getAllByText("Empty")).toHaveLength(4);
  expect(within(summary).getAllByRole("link", { name: "Fill in" })).toHaveLength(3);
});

test("a filled idea shows its numbers, sections and checks", async () => {
  await open(makeFullHome());
  expect(within(tile("Startup")).getByText("₱169,500")).toBeInTheDocument();
  expect(within(tile("Break-even")).getByText("6.9 / day")).toBeInTheDocument();
  expect(within(tile("Expected")).getByText("₱18,490 / month")).toBeInTheDocument();
  expect(within(tile("Payback")).getByText("9.2 months")).toBeInTheDocument();

  const checks = screen.getByRole("list", { name: "Checks" });
  expect(within(checks).getByText("Done (4)")).toBeInTheDocument();
  expect(within(checks).getByText("Done (2)")).toBeInTheDocument();

  const sections = screen.getByRole("list", { name: "Sections" });
  expect(within(sections).getByText("8/10")).toBeInTheDocument();
  expect(within(sections).getByText("7 entries")).toBeInTheDocument();
  expect(within(sections).getByText("4 (3–5)")).toBeInTheDocument();
  expect(within(sections).getByText("22/24 rows")).toBeInTheDocument();
  expect(within(sections).getByText("5/7 inputs")).toBeInTheDocument();
  expect(within(sections).getByText("3 assumptions · 2 risks")).toBeInTheDocument();
  expect(within(sections).getByRole("link", { name: "03 Research Log" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/research`,
  );
  expect(within(sections).getByRole("link", { name: "05 Costs" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/costs`,
  );

  const legend = screen.getByRole("group", { name: "Items by F/A/U" });
  expect(within(legend).getByText("9 (L3 M4 H2)")).toBeInTheDocument();
  expect(within(legend).getByText("44 items")).toBeInTheDocument();

  expect(screen.getByText("Office managers in Bacolod")).toBeInTheDocument();
  expect(screen.getByText("Blue Ocean")).toBeInTheDocument();
  expect(screen.getByText(/Permit cost is confirmed/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/decisions?idea=${IDEA}`,
  );
  expect(screen.getByRole("link", { name: "Gift box plan" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/plans/${PLAN}`,
  );
  expect(screen.getByText("Version: v1 For advisors")).toBeInTheDocument();
  expect(screen.getByText("Go / No-Go: Launch")).toBeInTheDocument();
  expect(hrefOf("Ready to record a decision")).toBe(`/w/${WORKSPACE}/ideas/${IDEA}/decide`);
});

test("checks that are not done show their state, reason and link", async () => {
  const home = makeFullHome();
  home.checks = home.checks.map((check) =>
    check.key === "costs"
      ? {
          ...check,
          state: "partial",
          detail: { emptyRows: 2, missing: [] },
        }
      : check.key === "break_even"
        ? {
            ...check,
            state: "not_started",
            detail: { missing: ["price"] },
            link: { ...check.link, field: "selling_price" },
          }
        : check,
  );
  await open(home);
  const checks = screen.getByRole("list", { name: "Checks" });
  const costs = within(checks).getByText("Startup & monthly costs").closest("li") as HTMLElement;
  expect(within(costs).getByText("Partial")).toBeInTheDocument();
  expect(within(costs).getByText("2 rows are Empty")).toBeInTheDocument();
  expect(within(costs).getByRole("link", { name: "Startup & monthly costs" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/costs`,
  );
  const breakEven = within(checks).getByText("Break-even volume").closest("li") as HTMLElement;
  expect(within(breakEven).getByText("Not started")).toBeInTheDocument();
  expect(within(breakEven).getByText("Needs price")).toBeInTheDocument();
  expect(within(breakEven).getByRole("link", { name: "Break-even volume" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA}/economics?field=selling_price`,
  );
});

test("Facts without evidence get a warning in the F/A/U block", async () => {
  const home = makeFullHome();
  home.fau = { ...home.fau, factNoEvidence: 2 };
  await open(home);
  expect(screen.getByText("2 without evidence")).toBeInTheDocument();
});

test("a negative contribution margin warns on break-even and links to Unit Economics", async () => {
  const home = makeFullHome({ economicsWarnings: ["margin_not_positive"] });
  home.keyMetrics = {
    ...home.keyMetrics,
    break_even_units_day: { value: null, bound: "exact", reason: "margin_not_positive" },
  };
  await open(home);
  expect(
    within(tile("Break-even")).getByText("Contribution margin is negative"),
  ).toBeInTheDocument();
  expect(
    within(tile("Break-even")).getByRole("link", { name: "Open Unit Economics" }),
  ).toHaveAttribute("href", `/w/${WORKSPACE}/ideas/${IDEA}/economics`);
});

test("a lower-bound startup cost reads as an amount with a plus", async () => {
  const home = makeFullHome();
  home.keyMetrics = {
    ...home.keyMetrics,
    initial_cost_total: { value: 450000, bound: "lower", reason: null },
  };
  await open(home);
  expect(within(tile("Startup")).getByText("₱450,000+")).toBeInTheDocument();
});

test("a Drop decision shows in the header and the idea can still be edited and decided", async () => {
  const home = makeFullHome({ idea: makeDetail({ latestDecision: "drop" }) });
  await open(home);
  expect(screen.getByText("Latest decision: Drop")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Edit summary" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record decision" })).toBeInTheDocument();
});

test("an undecided idea says so", async () => {
  await open(makeNewHome());
  expect(screen.getByText("Latest decision: Undecided")).toBeInTheDocument();
  expect(screen.getByText("Stage: Validation")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Corporate gift boxes of Bacolod piaya, delivered same day · by Ana Villanueva",
    ),
  ).toBeInTheDocument();
});

test("a copy says where it came from", async () => {
  const home = makeFullHome({
    idea: makeDetail({
      duplicatedFrom: {
        id: "99999999-9999-4999-8999-999999999999",
        name: "Piaya Gift Box v1",
      },
    }),
  });
  await open(home);
  expect(screen.getByRole("link", { name: "Piaya Gift Box v1" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/99999999-9999-4999-8999-999999999999`,
  );
  expect(screen.getByText(/Duplicated from/)).toBeInTheDocument();
});

test("an owner sees the actions, and Record decision goes to the decision screen", async () => {
  const { router } = await open(makeFullHome());
  expect(screen.getByRole("button", { name: "Edit summary" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "AI" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add plan" })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Record decision" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`${HOME_URL}/decide`));
});

test("Add plan opens the create-plan sheet", async () => {
  const { router } = await open(makeFullHome());
  await userEvent.click(screen.getByRole("button", { name: "Add plan" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ modal: "create-plan" }));
});

test("Add plan is absent unless the API says a plan can be added", async () => {
  await open(makeFullHome({ canAddPlan: false }));
  expect(screen.queryByRole("button", { name: "Add plan" })).toBeNull();
});

test("a newer template shows a notice and the menu entry that open the update sheet", async () => {
  const home = makeFullHome({
    template: {
      versionId: "v1",
      versionNumber: 1,
      newerVersion: { versionId: "v2", versionNumber: 2 },
    },
  });
  const { router } = await open(home);
  expect(screen.getByText("A newer template is available")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Update template" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({ modal: "update-template" }),
  );
});

test("no notice without a newer template", async () => {
  await open(makeFullHome());
  expect(screen.queryByText("A newer template is available")).toBeNull();
});

test("a Viewer sees the numbers but none of the actions", async () => {
  const home = makeFullHome({
    template: {
      versionId: "v1",
      versionNumber: 1,
      newerVersion: { versionId: "v2", versionNumber: 2 },
    },
  });
  await open(home, "viewer");
  expect(within(tile("Startup")).getByText("₱169,500")).toBeInTheDocument();
  for (const name of [
    "Edit summary",
    "AI",
    "Record decision",
    "Add plan",
    "More actions",
    "Update template",
  ]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  expect(screen.queryByText("A newer template is available")).toBeNull();
});

test("a Viewer of an archived idea gets the banner without Restore", async () => {
  await open(makeFullHome({ idea: makeDetail({ archived: true }) }), "viewer");
  expect(screen.getByText("This idea is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
});

test("an empty Solution offers the edit sheet to editors only", async () => {
  const home = makeNewHome();
  await open(home);
  const summary = screen.getByRole("list", { name: "Summary" });
  expect(within(summary).getByRole("button", { name: "Fill in" })).toBeInTheDocument();
  expect(within(summary).getAllByRole("link", { name: "Fill in" })).toHaveLength(3);
});

test("a Viewer's empty Solution has no button", async () => {
  await open(makeNewHome(), "viewer");
  const summary = screen.getByRole("list", { name: "Summary" });
  expect(within(summary).queryByRole("button")).toBeNull();
});

test("an idea of another workspace is a no-access page under this workspace's URL", async () => {
  const other = makeFullHome({
    idea: makeDetail({ workspaceId: "33333333-3333-4333-8333-333333333333" }),
  });
  stubApi({ ...signedIn(), [`GET ${HOME_PATH}`]: () => ({ body: other }) });
  await renderApp(HOME_URL);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
});

test("the breadcrumb is the idea's name under Ideas", async () => {
  await open(makeFullHome());
  const trail = screen.getByRole("list", { name: "Breadcrumbs" });
  expect(within(trail).getByText("Ideas")).toBeInTheDocument();
  expect(within(trail).getByText("Piaya Gift Box Delivery")).toBeInTheDocument();
});

test("a load error shows the retry state and keeps the navigation", async () => {
  stubApi({
    ...signedIn(),
    [`GET ${HOME_PATH}`]: () => ({
      status: 503,
      body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "down", requestId: "r" } },
    }),
  });
  await renderApp(HOME_URL);
  expect(
    await screen.findByText("Couldn't load this page", {}, { timeout: 10_000 }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
}, 15_000);

test("a missing idea shows Not found", async () => {
  stubApi({
    ...signedIn(),
    [`GET ${HOME_PATH}`]: () => ({
      status: 404,
      body: { error: { code: "NOT_FOUND", message: "no", requestId: "r" } },
    }),
  });
  await renderApp(HOME_URL);
  expect(await screen.findByText("Not found. Check the link.")).toBeInTheDocument();
});
