import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp, WORKSPACE } from "./support";
import {
  decisionLogApi,
  ENTRY_GO,
  ENTRY_HOLD,
  ENTRY_VERSION,
  LOG,
  LOG_PATH,
} from "./support-decision-log";
import { BACOLOD, IDEA_A } from "./support-ideas";
import { viewerMe } from "./support-research";

const list = () => screen.findByRole("grid", { name: "Recorded decisions" });

test("the entries come as the API orders them with idea, plan, kind, value, reason and who", async () => {
  decisionLogApi();
  await renderApp(LOG_PATH());
  const rows = within(await list()).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Piaya Gift Box Delivery · Plan A");
  expect(rows[0]).toHaveTextContent("Go / No-Go");
  expect(rows[0]).toHaveTextContent("Delay");
  expect(rows[0]).toHaveTextContent("Permit not ready");
  expect(rows[0]).toHaveTextContent("by Ana Villanueva");
  expect(rows[1]).toHaveTextContent("Version saved");
  expect(rows[1]).toHaveTextContent("v1 For advisors");
  expect(rows[2]).toHaveTextContent("Bacolod Health Bowl");
  expect(rows[2]).toHaveTextContent("Hold");
  expect(rows[2]).toHaveTextContent("Costs and permits are still missing");
  expect(screen.getByText("Choose an entry to see what it rested on.")).toBeInTheDocument();
});

test("the log has nothing that edits or deletes an entry", async () => {
  decisionLogApi();
  await renderApp(LOG_PATH(`?selected=${ENTRY_HOLD}`));
  await screen.findByRole("heading", { level: 2, name: "Bacolod Health Bowl" });
  for (const name of [/edit/i, /delete/i, /remove/i, /undo/i]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
});

test("a validation decision shows its full reason and what it rested on", async () => {
  decisionLogApi();
  await renderApp(LOG_PATH(`?selected=${ENTRY_HOLD}`));
  const heading = await screen.findByRole("heading", { level: 2, name: "Bacolod Health Bowl" });
  expect(heading).toBeInTheDocument();
  expect(screen.getByText(/Come back after the city hall visit/)).toBeInTheDocument();
  expect(screen.getByText("Recorded by Kenji Ito", { exact: false })).toBeInTheDocument();
  expect(await screen.findByText("1 check was missing")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Permits" })).toBeInTheDocument();
  expect(screen.getByText("₱450,000+")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open validation" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${BACOLOD.id}`,
  );
  expect(screen.queryByRole("link", { name: "Open plan" })).toBeNull();
});

test("a Go / No-Go shows the conditions as they were, the plan version and a link to the plan", async () => {
  decisionLogApi();
  await renderApp(LOG_PATH(`?selected=${ENTRY_GO}`));
  await screen.findByRole("heading", { level: 2, name: "Piaya Gift Box Delivery · Plan A" });
  expect(await screen.findByText("Permit approved")).toBeInTheDocument();
  expect(screen.getByText("Rent above ₱20,000")).toBeInTheDocument();
  expect(screen.getAllByText("Not set").length).toBe(1);
  expect(screen.getByText("Plan version: v1 For advisors")).toBeInTheDocument();
  expect(screen.getByText("All checks were done.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open plan" })).toHaveAttribute(
    "href",
    expect.stringContaining(`/w/${WORKSPACE}/ideas/${IDEA_A}/plans/`),
  );
});

test("a saved version has no reason and says so", async () => {
  decisionLogApi();
  await renderApp(LOG_PATH(`?selected=${ENTRY_VERSION}`));
  expect(await screen.findByText("No reason was recorded.")).toBeInTheDocument();
});

test("selecting a row puts it in the URL and opens its detail", async () => {
  decisionLogApi();
  const user = userEvent.setup();
  const { router } = await renderApp(LOG_PATH());
  const rows = within(await list()).getAllByRole("row");
  await user.click(rows[2] as HTMLElement);
  await waitFor(() => expect(router.state.location.search).toMatchObject({ selected: ENTRY_HOLD }));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Bacolod Health Bowl" }),
  ).toBeInTheDocument();
});

test("filtering by type asks the API and keeps the filter in the URL", async () => {
  const { calls } = decisionLogApi();
  const user = userEvent.setup();
  const { router } = await renderApp(LOG_PATH());
  await list();
  await user.click(screen.getByRole("button", { name: /Type/ }));
  await user.click(await screen.findByRole("option", { name: "Go / No-Go" }));
  await waitFor(() =>
    expect(
      calls.some((c) => c.url.pathname === LOG && c.url.searchParams.get("kind") === "go_no_go"),
    ).toBe(true),
  );
  await waitFor(() => expect(router.state.location.search).toMatchObject({ kind: "go_no_go" }));
  await waitFor(() => expect(within(screen.getByRole("grid")).getAllByRole("row")).toHaveLength(1));
});

test("the idea, recorder and period filters from the URL are sent as the API names them", async () => {
  const { calls } = decisionLogApi();
  await renderApp(
    LOG_PATH(
      `?idea=${BACOLOD.id}&recordedBy=66666666-6666-4666-8666-666666666666&from=2026-09-01&to=2026-09-30`,
    ),
  );
  await list();
  const request = calls.find((c) => c.url.pathname === LOG);
  expect(request?.url.searchParams.get("ideaId")).toBe(BACOLOD.id);
  expect(request?.url.searchParams.get("recordedBy")).toBe("66666666-6666-4666-8666-666666666666");
  expect(request?.url.searchParams.get("from")).toBe("2026-09-01");
  expect(request?.url.searchParams.get("to")).toBe("2026-09-30");
});

test("a filter that matches nothing offers to clear it", async () => {
  decisionLogApi({}, { items: [] });
  const user = userEvent.setup();
  await renderApp(LOG_PATH("?kind=go_no_go"));
  expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
  expect(
    await screen.findByText("Decisions you record will appear here, with who, when and why."),
  ).toBeInTheDocument();
});

test("an empty log explains what it holds, to a Viewer too", async () => {
  decisionLogApi({}, { items: [], me: viewerMe() });
  await renderApp(LOG_PATH());
  expect(
    await screen.findByText("Decisions you record will appear here, with who, when and why."),
  ).toBeInTheDocument();
});

test("a Viewer reads the entries", async () => {
  decisionLogApi({}, { me: viewerMe() });
  await renderApp(LOG_PATH(`?selected=${ENTRY_HOLD}`));
  expect(await screen.findByText(/Come back after the city hall visit/)).toBeInTheDocument();
});

test("an entry of another workspace is not shown under this one", async () => {
  decisionLogApi({}, { ideaWorkspaceId: "33333333-3333-4333-8333-333333333333" });
  await renderApp(LOG_PATH(`?selected=${ENTRY_HOLD}`));
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByText(/Come back after the city hall visit/)).toBeNull();
});
