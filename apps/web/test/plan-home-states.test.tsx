import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp } from "./support";
import {
  callsTo,
  holdReads,
  makePlanHome,
  openPlanHome,
  PLAN,
  PLAN_PATH,
  PLAN_URL,
  planApi,
  refusal,
  VERSION,
} from "./support-plan-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("a Viewer reads the plan and sees none of the controls", async () => {
  await openPlanHome({ role: "viewer" });
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Record Go/No-Go" })).toBeNull();
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByText("Business name: Piaya Gift Box Co.")).toBeInTheDocument();
  expect(screen.getByText("Prepared by Ana")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Pitch Deck" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "1 Executive Summary" })).toBeInTheDocument();
});

test("a Viewer's plan switcher has no Add plan", async () => {
  const { user } = await openPlanHome({ role: "viewer" });
  await user.click(screen.getByRole("button", { name: "Plans" }));
  await screen.findByRole("menu");
  expect(screen.queryByRole("menuitem", { name: "Add plan" })).toBeNull();
});

test("an archived plan is read only and can be restored", async () => {
  const restored = makePlanHome({ archived: false });
  let archived = true;
  const { api, user } = await openPlanHome(
    { plan: makePlanHome({ archived: true }) },
    {
      [`GET ${PLAN_PATH}`]: () => ({ body: makePlanHome({ archived }) }),
      [`POST ${PLAN_PATH}/restore`]: () => {
        archived = false;
        return { body: { id: PLAN, name: restored.name, archived: false } };
      },
    },
  );
  expect(screen.getByText("This plan is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Record Go/No-Go" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.getByRole("button", { name: "Pitch Deck" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(callsTo(api, "POST", `${PLAN_PATH}/restore`)).toHaveLength(1));
  await waitFor(() => expect(screen.queryByText("This plan is archived")).toBeNull());
  expect(await screen.findByRole("button", { name: "Save version" })).toBeInTheDocument();
});

test("a Viewer of an archived plan cannot restore it", async () => {
  await openPlanHome({ role: "viewer", plan: makePlanHome({ archived: true }) });
  expect(screen.getByText("This plan is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
});

test("an archived idea makes the plan read only", async () => {
  await openPlanHome({ ideaArchived: true });
  await waitFor(() => expect(screen.queryByRole("button", { name: "Save version" })).toBeNull());
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "More actions" })).not.toBeNull();
});

test("a saved version opens read only with a way back to the latest", async () => {
  const viewing = { id: VERSION, name: "v1 For advisors", savedAt: "2026-09-20T02:00:00.000Z" };
  const { api } = await openPlanHome(
    {
      plan: makePlanHome({
        viewingVersion: viewing,
        date: "2026-09-20T02:00:00.000Z",
        businessName: "Piaya Boxes (as saved)",
      }),
    },
    {},
    `${PLAN_URL}?version=${VERSION}`,
  );
  expect(screen.getByText("Viewing v1 For advisors (read only)")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to latest" })).toHaveAttribute("href", PLAN_URL);
  expect(screen.getByText("Saved Sep 20, 2026")).toBeInTheDocument();
  expect(screen.getByText("Business name: Piaya Boxes (as saved)")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Record Go/No-Go" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "More actions" })).toBeNull();
  expect(screen.queryByText(/Start with the items marked/)).toBeNull();
  expect(screen.getByRole("link", { name: "1 Executive Summary" })).toHaveAttribute(
    "href",
    `${PLAN_URL}/items/1?version=${VERSION}`,
  );
  expect(
    api.calls.some(
      (c) => c.url.pathname === PLAN_PATH && c.url.searchParams.get("versionId") === VERSION,
    ),
  ).toBe(true);
});

test("Pitch Deck keeps the version being viewed", async () => {
  const viewing = { id: VERSION, name: "v1 For advisors", savedAt: "2026-09-20T02:00:00.000Z" };
  const { user, router } = await openPlanHome(
    { plan: makePlanHome({ viewingVersion: viewing }) },
    {},
    `${PLAN_URL}?version=${VERSION}`,
  );
  await user.click(screen.getByRole("button", { name: "Pitch Deck" }));
  expect(router.state.location.pathname).toBe(`${PLAN_URL}/pitch`);
  expect(router.state.location.search).toMatchObject({ version: VERSION });
});

test("the plan shows a skeleton while it loads", async () => {
  planApi();
  holdReads(PLAN_PATH);
  void renderApp(PLAN_URL);
  expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: "Plan A" })).toBeNull();
});

test("a failed read shows the error state and Retry reads again", async () => {
  // The route's loader reads the plan too, so a count of attempts would not say which one failed.
  let failing = true;
  planApi(
    {},
    {
      [`GET ${PLAN_PATH}`]: () =>
        failing ? refusal("RATE_LIMITED", 429) : { body: makePlanHome() },
    },
  );
  await renderApp(PLAN_URL);
  expect(await screen.findByText("Too many attempts. Try again in a minute.")).toBeInTheDocument();
  failing = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { level: 1, name: "Plan A" })).toBeInTheDocument();
});

test("a plan of another workspace or idea shows no access", async () => {
  planApi({
    plan: makePlanHome({ ideaId: "12121212-1212-4212-8212-121212121212" }),
  });
  await renderApp(PLAN_URL);
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByText("Piaya Gift Box Co.")).toBeNull();
});
