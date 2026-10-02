import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderApp } from "./support";
import {
  conflictBody,
  EXECUTION_PATH,
  executionApi,
  KPIS,
  MILESTONES,
  PLAN,
  patchedItem,
  planHome,
  registerPlanHooks,
  viewerMe,
  writes,
} from "./support-execution";

registerPlanHooks();

test("a Viewer reads the rows and the fields as text, with nothing to add, move or delete", async () => {
  executionApi({}, { me: viewerMe() });
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Legal / company setup" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Actions for/ })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("radio")).toBeNull();
  expect(screen.getByText("Registered")).toBeInTheDocument();
  expect(screen.getByText("Ana Villanueva", { selector: "p" })).toBeInTheDocument();
  expect(
    screen.queryByText("Deadline notifications reach only members chosen from the list."),
  ).toBeNull();
  const main = within(screen.getByRole("main"));
  expect(main.getByRole("button", { name: "Comments" })).toBeInTheDocument();
  expect(main.getByRole("button", { name: "History" })).toBeInTheDocument();
});

test("a Viewer's empty tab explains itself without an Add button", async () => {
  executionApi({}, { me: viewerMe(), items: [] });
  await renderApp(EXECUTION_PATH());
  expect(await screen.findByText("No milestones yet")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
});

test("an archived plan says so and cannot be changed", async () => {
  const { calls } = executionApi({}, { planArchived: true });
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  expect(await screen.findByText("This plan is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(writes(calls)).toHaveLength(0);
});

test("an archived idea says so and cannot be changed", async () => {
  executionApi({}, { archived: true });
  await renderApp(EXECUTION_PATH(`?item=${MILESTONES[1]?.id}`));
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "+ Add" })).toBeNull();
  expect(screen.queryByRole("textbox")).toBeNull();
});

test("a plan of another workspace shows no access", async () => {
  executionApi({
    [`GET ${PLAN}`]: () => ({
      body: planHome({ workspaceId: "33333333-3333-4333-8333-333333333333" }),
    }),
  });
  await renderApp(EXECUTION_PATH());
  expect(await screen.findByText(/don't have access/i)).toBeInTheDocument();
});

test("while the plan loads a skeleton shows, and the heading waits", async () => {
  executionApi();
  const answer = globalThis.fetch;
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    new URL(String(input instanceof Request ? input.url : input), "http://localhost").pathname ===
    PLAN
      ? new Promise<Response>(() => {})
      : answer(input, init),
  );
  await renderApp(EXECUTION_PATH());
  expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { level: 1, name: "Execution" })).toBeNull();
});

test("a failed read shows the retry state and Retry loads it", async () => {
  let failing = true;
  executionApi({
    [`GET ${PLAN}/execution-items`]: ({ url }) =>
      failing
        ? {
            status: 429,
            body: { error: { code: "RATE_LIMITED", message: "x", requestId: "r" } },
          }
        : {
            body: {
              items: url.searchParams.get("type") === "milestone" ? MILESTONES : [],
            },
          },
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH());
  const retry = await screen.findByRole("button", { name: "Retry" });
  failing = false;
  await user.click(retry);
  expect(await screen.findByRole("grid", { name: "Milestones" })).toBeInTheDocument();
});

test("a 409 asks what to do and loading theirs replaces the field", async () => {
  const row = MILESTONES[2];
  if (!row) throw new Error("fixture");
  executionApi({
    [`PATCH /api/v1/execution-items/${row.id}`]: () =>
      conflictBody({ ...row, goal: "Paolo's goal", lockVersion: 4 }, 4),
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${row.id}`));
  const goal = await screen.findByRole("textbox", { name: "Goal" });
  await user.type(goal, "My goal");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  expect(within(dialog).getByText(/Paolo Reyes updated this item/)).toBeInTheDocument();
  expect(within(dialog).getByText(/Launch readiness · Paolo's goal/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: "Goal" })).toHaveValue("Paolo's goal"),
  );
});

test("overwriting with mine sends the same input again with force", async () => {
  const row = MILESTONES[2];
  if (!row) throw new Error("fixture");
  let attempt = 0;
  const { calls } = executionApi({
    [`PATCH /api/v1/execution-items/${row.id}`]: ({ body }) => {
      attempt += 1;
      if (attempt === 1) return conflictBody({ ...row, goal: "Paolo's goal", lockVersion: 4 }, 4);
      const { lockVersion: _l, force: _f, ...fields } = body as Record<string, unknown>;
      return { body: patchedItem({ ...row, lockVersion: 4 }, fields) };
    },
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${row.id}`));
  await user.type(await screen.findByRole("textbox", { name: "Goal" }), "My goal");
  await user.tab();
  const dialog = await screen.findByRole("dialog", { name: "Someone updated this first" });
  await user.click(within(dialog).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
  expect(calls.filter((c) => c.method === "PATCH")[1]?.body).toEqual({
    goal: "My goal",
    lockVersion: 4,
    force: true,
  });
});

test("a refused save shows the reason with Retry, and Retry sends the row's input again", async () => {
  const row = MILESTONES[2];
  if (!row) throw new Error("fixture");
  let failing = true;
  const { calls } = executionApi({
    [`PATCH /api/v1/execution-items/${row.id}`]: ({ body }) => {
      if (failing) {
        return {
          status: 422,
          body: { error: { code: "VALIDATION_FAILED", message: "x", requestId: "r" } },
        };
      }
      const { lockVersion: _l, force: _f, ...fields } = body as Record<string, unknown>;
      return { body: patchedItem(row, fields) };
    },
  });
  const user = userEvent.setup();
  await renderApp(EXECUTION_PATH(`?item=${row.id}`));
  await user.type(await screen.findByRole("textbox", { name: "Goal" }), "Open");
  await user.tab();
  await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(1));
  expect(await screen.findByText(/Some values are not valid/)).toBeInTheDocument();
  const retry = (await screen.findAllByRole("button", { name: "Retry" })).at(-1) as HTMLElement;
  failing = false;
  await user.click(retry);
  await waitFor(() => expect(calls.filter((c) => c.method === "PATCH")).toHaveLength(2));
  await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).toBeNull());
});

test("the deep link from the dashboard names a tab and an item and opens both", async () => {
  executionApi();
  await renderApp(EXECUTION_PATH(`?tab=kpis&item=${KPIS[0]?.id}`));
  expect(await screen.findByRole("heading", { level: 2, name: "Revenue" })).toBeInTheDocument();
});

test("below desktop the list and the detail take turns, with a Back and a floating Add", async () => {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: query.includes("max-width"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  try {
    executionApi();
    const user = userEvent.setup();
    const { router } = await renderApp(EXECUTION_PATH());
    expect(await screen.findByRole("button", { name: "+ Add" })).toBeInTheDocument();
    await user.click(
      within(await screen.findByRole("grid", { name: "Milestones" })).getAllByRole(
        "row",
      )[0] as HTMLElement,
    );
    await user.click(await screen.findByRole("button", { name: "Back to the list" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "milestones" }));
  } finally {
    window.matchMedia = original;
  }
});
