import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp, type StubRequest, WORKSPACE } from "./support";
import { viewerMe } from "./support-research";
import {
  ANALYSIS,
  HOME_PATH,
  home,
  ME,
  registerSelfAnalysisHooks,
  selfAnalysisApi,
} from "./support-self-analysis";

registerSelfAnalysisHooks();

const writes = (calls: StubRequest[]) => calls.filter((c) => c.method !== "GET");

test("the home shows progress, what is shared, the template and the sections with their counts", async () => {
  selfAnalysisApi();
  await renderApp(HOME_PATH);
  expect(
    await screen.findByRole("heading", { level: 1, name: "My Self Analysis" }),
  ).toBeInTheDocument();
  expect(screen.getByText("In progress · 3 / 5 answered")).toBeInTheDocument();
  expect(screen.getByText("3 / 5 answered")).toBeInTheDocument();
  expect(screen.getByText("Shared with: not shared")).toBeInTheDocument();
  expect(screen.getByText("Template v1")).toBeInTheDocument();
  const sections = screen.getByRole("list", { name: "Sections of the self analysis" });
  const rows = within(sections).getAllByRole("listitem");
  expect(rows[0]).toHaveTextContent("WHY");
  expect(rows[0]).toHaveTextContent("2/2");
  expect(rows[0]).toHaveTextContent("Complete");
  expect(rows[1]).toHaveTextContent("PERSONAL INCOME");
  expect(rows[1]).toHaveTextContent("1/2");
  expect(rows[1]).not.toHaveTextContent("Complete");
  expect(within(rows[1] as HTMLElement).getByRole("link")).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/self-analysis/INCOME`,
  );
});

test("Continue opens the first unanswered question, and Team, Export and Import are one press away", async () => {
  selfAnalysisApi();
  const user = userEvent.setup();
  const { router } = await renderApp(HOME_PATH);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  expect(screen.getByRole("link", { name: "Team" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/team`,
  );
  await user.click(screen.getByRole("button", { name: "AI" }));
  expect(await screen.findByRole("menuitem", { name: "Export for AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/export?source=self_analysis`,
  );
  expect(screen.getByRole("menuitem", { name: "Import from AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/import?target=self_analysis`,
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Continue" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/self-analysis/INCOME`),
  );
  expect(router.state.location.search).toMatchObject({ q: "SA.INCOME.2" });
});

test("a self analysis not yet started explains itself and offers Start", async () => {
  selfAnalysisApi(
    {},
    {
      home: home({
        status: "not_started",
        answered: 0,
        firstUnanswered: { sectionKey: "WHY", questionKey: "SA.WHY.1" },
        sections: [{ key: "WHY", title: "WHY", answered: 0, total: 2 }],
        total: 2,
      }),
    },
  );
  await renderApp(HOME_PATH);
  expect(
    await screen.findByText(
      "Answer 2 questions at your own pace. Only you can see your answers until you share them.",
    ),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Start" }).length).toBeGreaterThan(0);
});

test("Mark as done with empty questions asks first and sends confirmEmpty", async () => {
  const { calls } = selfAnalysisApi({
    [`POST ${ME}/complete`]: () => ({
      body: home({ status: "done", completedAt: "2026-10-02T00:00:00.000Z" }),
    }),
  });
  const user = userEvent.setup();
  await renderApp(HOME_PATH);
  await user.click(await screen.findByRole("button", { name: "Mark as done" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Mark as done?" });
  expect(dialog).toHaveTextContent("2 questions are empty. Mark as done anyway?");
  expect(writes(calls)).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Mark as done" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({ method: "POST", body: { confirmEmpty: true } });
  expect(await screen.findByRole("button", { name: "Reopen" })).toBeInTheDocument();
  expect(screen.getByText(/Done on /)).toBeInTheDocument();
});

test("Mark as done with every question answered goes through without asking", async () => {
  const { calls } = selfAnalysisApi(
    { [`POST ${ME}/complete`]: () => ({ body: home({ status: "done", answered: 5 }) }) },
    { home: home({ answered: 5, firstUnanswered: null }) },
  );
  const user = userEvent.setup();
  await renderApp(HOME_PATH);
  await user.click(await screen.findByRole("button", { name: "Mark as done" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({});
  expect(screen.queryByRole("alertdialog")).toBeNull();
});

test("when the server finds empty questions the page did not know about, it asks with the server's count", async () => {
  selfAnalysisApi(
    {
      [`POST ${ME}/complete`]: () => ({
        status: 409,
        body: {
          error: {
            code: "HAS_EMPTY_QUESTIONS",
            message: "x",
            requestId: "abcdef12-0000",
            emptyCount: 4,
          },
        },
      }),
    },
    { home: home({ answered: 5, firstUnanswered: null }) },
  );
  const user = userEvent.setup();
  await renderApp(HOME_PATH);
  await user.click(await screen.findByRole("button", { name: "Mark as done" }));
  expect(await screen.findByRole("alertdialog")).toHaveTextContent("4 questions are empty");
});

test("Reopen returns a done self analysis to in progress", async () => {
  const { calls } = selfAnalysisApi(
    { [`POST ${ME}/reopen`]: () => ({ body: home({ status: "in_progress", answered: 5 }) }) },
    { home: home({ status: "done", answered: 5, firstUnanswered: null }) },
  );
  const user = userEvent.setup();
  await renderApp(HOME_PATH);
  await user.click(await screen.findByRole("button", { name: "Reopen" }));
  expect(await screen.findByRole("button", { name: "Mark as done" })).toBeInTheDocument();
  expect(writes(calls)[0]).toMatchObject({ method: "POST" });
});

test("sharing is chosen in M6 and sent as the whole set of workspaces", async () => {
  const { calls } = selfAnalysisApi(
    {
      [`PUT ${ME}/shares`]: ({ body }) => ({
        body: home({
          status: "done",
          shares: (body as { workspaceIds: string[] }).workspaceIds.map((id) => ({
            workspace: { id, name: "BCDX" },
            sharedAt: "2026-10-02T00:00:00.000Z",
          })),
        }),
      }),
    },
    { home: home({ status: "done", answered: 5, firstUnanswered: null }) },
  );
  const user = userEvent.setup();
  const { router } = await renderApp(HOME_PATH);
  await user.click(await screen.findByRole("button", { name: "Share" }));
  await waitFor(() => expect(router.state.location.search).toMatchObject({ modal: "share" }));
  const dialog = await screen.findByRole("dialog", { name: "Share your self analysis" });
  expect(dialog).toHaveTextContent("Viewers can't");
  await user.click(within(dialog).getByRole("checkbox", { name: "BCDX" }));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({ method: "PUT", body: { workspaceIds: [WORKSPACE] } });
  expect(await screen.findByText("Shared with: BCDX")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("before it is done, a workspace cannot be added, but one already shared can be dropped", async () => {
  const { calls } = selfAnalysisApi(
    {
      [`PUT ${ME}/shares`]: () => ({ body: home({ status: "in_progress", shares: [] }) }),
    },
    {
      home: home({
        status: "in_progress",
        shares: [
          { workspace: { id: WORKSPACE, name: "BCDX" }, sharedAt: "2026-10-01T00:00:00.000Z" },
        ],
        shareableWorkspaces: [
          { id: WORKSPACE, name: "BCDX" },
          { id: "33333333-3333-4333-8333-333333333333", name: "Side project" },
        ],
      }),
    },
  );
  const user = userEvent.setup();
  await renderApp(`${HOME_PATH}?modal=share`);
  const dialog = await screen.findByRole("dialog", { name: "Share your self analysis" });
  expect(within(dialog).getByRole("checkbox", { name: "Side project" })).toBeDisabled();
  expect(within(dialog).getByRole("checkbox", { name: "BCDX" })).toBeEnabled();
  expect(dialog).toHaveTextContent(
    "Mark your self analysis as done to share it with another workspace.",
  );
  await user.click(within(dialog).getByRole("checkbox", { name: "BCDX" }));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({ workspaceIds: [] });
});

test("with only a personal workspace, the sheet says to join a team workspace", async () => {
  selfAnalysisApi({}, { home: home({ status: "done", shareableWorkspaces: [] }) });
  await renderApp(`${HOME_PATH}?modal=share`);
  expect(
    await screen.findByText("Join a team workspace to share your self analysis"),
  ).toBeInTheDocument();
});

test("the currency of the amounts is changed from the menu and is not converted", async () => {
  const { calls } = selfAnalysisApi({
    [`PATCH ${ME}`]: ({ body }) => ({
      body: home({ currency: (body as { currency: string }).currency }),
    }),
  });
  const user = userEvent.setup();
  await renderApp(HOME_PATH);
  await user.click(
    await screen.findByRole("button", { name: "More actions for the self analysis" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Currency: PHP" }));
  const dialog = await screen.findByRole("dialog", { name: "Currency of the amounts" });
  expect(dialog).toHaveTextContent("Amounts are not converted");
  await user.click(within(dialog).getByRole("button", { name: /Currency/ }));
  await user.click(await screen.findByRole("option", { name: /^USD/ }));
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({ method: "PATCH", body: { currency: "USD" } });
  expect(await screen.findByText("Currency: USD")).toBeInTheDocument();
});

test("the header offers the owner's history of the whole self analysis", async () => {
  selfAnalysisApi();
  const user = userEvent.setup();
  const { router } = await renderApp(HOME_PATH);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  await user.click(screen.getByRole("button", { name: "History" }));
  await waitFor(() =>
    expect(router.state.location.search).toMatchObject({
      panel: "history",
      target: `container:self_analysis:${ANALYSIS}`,
    }),
  );
});

test("a person who is only a Viewer here gets no link to the team page", async () => {
  selfAnalysisApi({}, { me: viewerMe() });
  await renderApp(HOME_PATH);
  await screen.findByRole("heading", { level: 1, name: "My Self Analysis" });
  expect(screen.queryByRole("link", { name: "Team" })).toBeNull();
});
