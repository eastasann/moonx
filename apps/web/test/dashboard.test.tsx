import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeMe, renderApp, WORKSPACE } from "./support";
import { DASH, dashboardApi, PAOLO, PLAN } from "./support-dashboard";
import { BACOLOD } from "./support-ideas";

const viewer = () =>
  makeMe({
    memberships: [
      {
        workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
        role: "viewer",
      },
    ],
  });

const rows = (list: HTMLElement) =>
  within(list).getAllByRole("listitem") as [HTMLElement, ...HTMLElement[]];

test("the ideas block lists stage, decision and what is missing, and counts the dropped ones", async () => {
  dashboardApi();
  await renderApp(`/w/${WORKSPACE}`);
  const list = await screen.findByRole("list", { name: "Ideas in this workspace" });
  const piaya = rows(list)[0] as HTMLElement;
  const bacolod = rows(list)[1] as HTMLElement;
  expect(piaya).toHaveTextContent("Piaya Gift Box Delivery");
  expect(piaya).toHaveTextContent("Proceed");
  expect(piaya).toHaveTextContent("—");
  expect(bacolod).toHaveTextContent("Bacolod Health Bowl");
  expect(bacolod).toHaveTextContent("Hold");
  expect(bacolod).toHaveTextContent("Validation");
  // Three checks are not done, so the block shows how many instead of the names.
  expect(bacolod).toHaveTextContent("Missing: 3 checks");
  expect(within(bacolod).getByRole("link", { name: BACOLOD.name })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${BACOLOD.id}`,
  );
  expect(screen.getByText("1 dropped idea hidden")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Show" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas?decision=drop`,
  );
});

test("one or two missing checks are named", async () => {
  dashboardApi(
    {},
    {
      ideas: [
        {
          ...BACOLOD,
          checks: BACOLOD.checks.map((check) =>
            check.key === "permits" ? check : { ...check, state: "done" as const },
          ),
        },
      ],
    },
  );
  await renderApp(`/w/${WORKSPACE}`);
  const list = await screen.findByRole("list", { name: "Ideas in this workspace" });
  expect(list).toHaveTextContent("Missing: Permits");
});

test("a self analysis that was not shared shows only 'Not shared' and no link", async () => {
  dashboardApi();
  await renderApp(`/w/${WORKSPACE}`);
  const list = await screen.findByRole("list", { name: "Self analyses of the members" });
  const [ana, kenji, paolo] = rows(list);
  expect(ana).toHaveTextContent("Shared · Done");
  expect(within(ana as HTMLElement).getByRole("link", { name: "Ana Villanueva" })).toHaveAttribute(
    "href",
    expect.stringContaining(`/w/${WORKSPACE}/team/`),
  );
  expect(kenji).toHaveTextContent("Not shared");
  expect(kenji).not.toHaveTextContent("In progress");
  expect(within(kenji as HTMLElement).queryByRole("link")).toBeNull();
  expect(paolo).toHaveTextContent("Shared · In progress");
  expect(within(paolo as HTMLElement).getByRole("link", { name: "Paolo Gonzaga" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/team/${PAOLO}`,
  );
});

test("due soon keeps the server's order and marks overdue, today and the person's own items", async () => {
  dashboardApi();
  await renderApp(`/w/${WORKSPACE}`);
  const list = await screen.findByRole("list", { name: "Execution items due soon" });
  const items = rows(list);
  expect(items.map((item) => within(item).getAllByText(/./)[0]?.textContent)).toEqual([
    "Book venue",
    "Get supplier quote",
    "Print flyers",
  ]);
  expect(items[0]).toHaveTextContent("Ana Villanueva · 3d");
  expect(items[0]).toHaveTextContent("Yours");
  expect(items[1]).toHaveTextContent("Kenji Mori ·");
  expect(items[1]).toHaveTextContent("overdue 2d");
  expect(items[2]).toHaveTextContent("Print shop · today");
  expect(
    within(items[1] as HTMLElement).getByRole("link", { name: "Get supplier quote" }),
  ).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${BACOLOD.id}/plans/${PLAN}/execution?tab=actions&item=d0000000-0000-4000-8000-000000000001`,
  );
});

test("recent activity reads as sentences and a comment opens the item with its panel", async () => {
  dashboardApi();
  await renderApp(`/w/${WORKSPACE}`);
  const list = await screen.findByRole("list", { name: "Recent activity" });
  const entries = rows(list);
  expect(entries[0]).toHaveTextContent("Paolo Gonzaga commented on 01 WHO");
  expect(entries[1]).toHaveTextContent("Ana Villanueva recorded Hold");
  expect(entries[2]).toHaveTextContent("Ana Villanueva recorded Go / No-Go: Delay");
  expect(entries[2]).toHaveTextContent("Bacolod Health Bowl / Plan A");
  expect(entries[3]).toHaveTextContent("Paolo Gonzaga saved version v1 For advisors");
  const link = within(entries[0] as HTMLElement).getByRole("link");
  const href = link.getAttribute("href") ?? "";
  expect(href).toContain(`/w/${WORKSPACE}/ideas/${BACOLOD.id}/questions/01`);
  expect(href).toContain("panel=comments");
  expect(href).toContain("target=validation_answer");
});

test("a block that fails shows its own error while the others still show their data", async () => {
  dashboardApi({
    [`GET ${DASH}/due-soon`]: () => ({
      status: 403,
      body: { error: { code: "FORBIDDEN", message: "no", requestId: "abcdef12-0000" } },
    }),
  });
  await renderApp(`/w/${WORKSPACE}`);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(await screen.findByRole("list", { name: "Recent activity" })).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Ideas in this workspace" })).toBeInTheDocument();
});

test("empty lists say what will appear there", async () => {
  dashboardApi(
    {
      [`GET ${DASH}/due-soon`]: () => ({ body: { items: [] } }),
      [`GET ${DASH}/activity`]: () => ({ body: { items: [] } }),
    },
    { droppedCount: 0 },
  );
  await renderApp(`/w/${WORKSPACE}`);
  expect(await screen.findByText("Nothing is due in the next 7 days.")).toBeInTheDocument();
  expect(
    screen.getByText("Changes, comments and decisions of this workspace will appear here."),
  ).toBeInTheDocument();
});

test("a new workspace shows Getting started with the three steps", async () => {
  dashboardApi({}, { ideas: [], droppedCount: 0 });
  const user = userEvent.setup();
  const { router } = await renderApp(`/w/${WORKSPACE}`);
  const steps = await screen.findByRole("list", { name: "Steps to get started" });
  expect(screen.getByText("Getting started")).toBeInTheDocument();
  expect(within(steps).getByRole("link", { name: "Start your self analysis" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/self-analysis`,
  );
  expect(
    within(steps).getByRole("link", { name: "Invite the people you work with" }),
  ).toHaveAttribute("href", `/w/${WORKSPACE}/settings`);
  await user.click(within(steps).getByRole("button", { name: "Write down your first idea" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ modal: "new-idea" }));
});

test("a Viewer sees no self analyses block and no invitation step, and does not ask for them", async () => {
  const { calls } = dashboardApi({}, { me: viewer(), ideas: [], droppedCount: 0 });
  await renderApp(`/w/${WORKSPACE}`);
  expect(
    await screen.findByText("No ideas have been written in this workspace yet."),
  ).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Self analyses" })).toBeNull();
  expect(screen.queryByRole("link", { name: "Invite the people you work with" })).toBeNull();
  await screen.findByRole("list", { name: "Recent activity" });
  expect(calls.some((call) => call.url.pathname === `${DASH}/self-analyses`)).toBe(false);
});

test("a member who is not an Owner gets no invitation step but the other two", async () => {
  dashboardApi(
    {},
    {
      ideas: [],
      droppedCount: 0,
      me: makeMe({
        memberships: [
          {
            workspace: { id: WORKSPACE, name: "BCDX", isPersonal: false, currency: "PHP" },
            role: "member",
          },
        ],
      }),
    },
  );
  await renderApp(`/w/${WORKSPACE}`);
  const steps = await screen.findByRole("list", { name: "Steps to get started" });
  expect(within(steps).queryByRole("link", { name: "Invite the people you work with" })).toBeNull();
  expect(within(steps).getAllByRole("listitem")).toHaveLength(2);
});

test("due soon, activity and the self analyses are read again each time the dashboard opens", async () => {
  const { calls } = dashboardApi();
  const { router } = await renderApp(`/w/${WORKSPACE}`);
  await screen.findByRole("list", { name: "Execution items due soon" });
  const reads = (name: string) =>
    calls.filter((call) => call.url.pathname === `${DASH}/${name}`).length;
  expect(reads("due-soon")).toBe(1);
  router.history.push("/notifications");
  await screen.findByRole("heading", { level: 1, name: "Notifications" });
  router.history.push(`/w/${WORKSPACE}`);
  await screen.findByRole("list", { name: "Execution items due soon" });
  await waitFor(() => expect(reads("due-soon")).toBe(2));
  expect(reads("activity")).toBe(2);
  expect(reads("self-analyses")).toBe(2);
});
