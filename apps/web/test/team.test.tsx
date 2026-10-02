import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";
import { viewerMe } from "./support-research";
import { ANALYSIS, KENJI, PAOLO, shared, teamMembers } from "./support-self-analysis";

const TEAM = `/api/v1/workspaces/${WORKSPACE}/self-analyses`;

function teamApi(extra: Parameters<typeof stubApi>[0] = {}, me = makeMe(), items = teamMembers()) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: me }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    [`GET ${TEAM}`]: () => ({ body: { items } }),
    [`GET ${TEAM}/${PAOLO.id}`]: () => ({ body: shared() }),
    [`GET ${TEAM}/${KENJI.id}`]: () => ({
      status: 403,
      body: { error: { code: "NOT_SHARED", message: "x", requestId: "abcdef12-0000" } },
    }),
    ...extra,
  });
}

test("the members come with who shared; one who did not shows only 'Not shared', greyed out", async () => {
  teamApi();
  await renderApp(`/w/${WORKSPACE}/team`);
  const list = await screen.findByRole("grid", { name: "Members" });
  const rows = within(list).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Shared · Done");
  expect(rows[1]).toHaveTextContent("Kenji Mori");
  expect(rows[1]).toHaveTextContent("Not shared");
  expect(rows[1]).not.toHaveTextContent("In progress");
  expect(rows[1]).toHaveAttribute("aria-disabled", "true");
  expect(rows[2]).toHaveTextContent("Shared · In progress");
  expect(screen.getByText("Choose a member to read their self analysis.")).toBeInTheDocument();
});

test("selecting a member who shared puts them in the path and reads their self analysis", async () => {
  teamApi();
  const user = userEvent.setup();
  const { router } = await renderApp(`/w/${WORKSPACE}/team`);
  const rows = within(await screen.findByRole("grid", { name: "Members" })).getAllByRole("row");
  await user.click(rows[2] as HTMLElement);
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/team/${PAOLO.id}`),
  );
  expect(await screen.findByText("To spend weekends with my kids.")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 3, name: "PERSONAL INCOME" })).toBeInTheDocument();
  expect(screen.getByText("Amount: ₱40,000")).toBeInTheDocument();
  expect(screen.getByText("Rent and food.")).toBeInTheDocument();
  expect(screen.getAllByText("Empty").length).toBeGreaterThan(0);
});

test("a person who did not share cannot be opened from the list or by the link", async () => {
  teamApi();
  await renderApp(`/w/${WORKSPACE}/team/${KENJI.id}`);
  expect(
    await screen.findByText("This self analysis is not shared in this workspace."),
  ).toBeInTheDocument();
});

test("each answer takes comments and the history button is left out", async () => {
  teamApi();
  const user = userEvent.setup();
  const { router } = await renderApp(`/w/${WORKSPACE}/team/${PAOLO.id}`);
  await screen.findByText("To spend weekends with my kids.");
  expect(screen.queryByRole("button", { name: "History" })).toBeNull();
  const comments = screen.getAllByRole("button", { name: "Comments" });
  expect(screen.getByText("2")).toBeInTheDocument();
  await user.click(comments[0] as HTMLElement);
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      panel: "comments",
      target: `self_analysis_answer:${ANALYSIS}:SA.WHY.1`,
    }),
  );
});

test("when no one shared, the detail says so", async () => {
  teamApi(
    {},
    makeMe(),
    teamMembers().map((member) => ({ ...member, shared: false, status: null })),
  );
  await renderApp(`/w/${WORKSPACE}/team`);
  expect(
    await screen.findByText("No one has shared their self analysis in this workspace yet."),
  ).toBeInTheDocument();
});

test("a Viewer is told they have no access and the API is not asked", async () => {
  const { calls } = teamApi({}, viewerMe());
  await renderApp(`/w/${WORKSPACE}/team`);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(calls.some((c) => c.url.pathname === TEAM)).toBe(false);
});
