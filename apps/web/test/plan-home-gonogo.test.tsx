import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { renderApp } from "./support";
import {
  CONTEXT_PATH,
  callsTo,
  GO_NO_GO_PATH,
  makeContext,
  openPlanHome,
  PLAN_URL,
  planApi,
  refusal,
} from "./support-plan-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

const recorded = {
  status: 201,
  body: { entry: { id: "g2", value: "launch" }, stage: "launch_prep" },
};

async function openSheet(context = makeContext(), extra: Parameters<typeof planApi>[1] = {}) {
  const { api, user, router } = await openPlanHome(
    {},
    { [`GET ${CONTEXT_PATH}`]: () => ({ body: context }), ...extra },
  );
  await user.click(screen.getByRole("button", { name: "Record Go/No-Go" }));
  const dialog = await screen.findByRole("dialog", { name: "Record Go / No-Go" });
  await within(dialog).findByText("We have 20 pre-orders");
  return { api, user, router, dialog };
}

test("the sheet shows the three conditions, with Not written yet for an empty one", async () => {
  const { dialog } = await openSheet();
  expect(within(dialog).getByText("We proceed to launch if")).toBeInTheDocument();
  expect(within(dialog).getByText("We delay if")).toBeInTheDocument();
  expect(within(dialog).getByText("We stop / abandon if")).toBeInTheDocument();
  expect(within(dialog).getByText("Permit is refused")).toBeInTheDocument();
  expect(within(dialog).getAllByText("Not written yet")).toHaveLength(1);
});

test("the sheet shows the key numbers and the current version", async () => {
  const { dialog } = await openSheet();
  const tile = (label: string) =>
    within(dialog).getByText(label, { selector: "dt" }).parentElement as HTMLElement;
  expect(within(tile("Startup")).getByText("₱169,500")).toBeInTheDocument();
  expect(within(tile("Break-even")).getByText("6.9 / day")).toBeInTheDocument();
  expect(within(tile("Expected")).getByText("₱18,490 / month")).toBeInTheDocument();
  expect(within(tile("Payback")).getByText("9.2 months")).toBeInTheDocument();
  expect(within(tile("ROI")).getByText("130.9%")).toBeInTheDocument();
  expect(within(dialog).getByText("Current version: v1 For advisors")).toBeInTheDocument();
  expect(within(dialog).queryByText(/Save a version first/)).toBeNull();
});

test("the history lists the earlier Go / No-Go with its version and reason", async () => {
  const { dialog } = await openSheet();
  const history = within(dialog).getByRole("list", { name: "History" });
  expect(within(history).getByText("Delay · Sep 28, 2026 · Ana Villanueva")).toBeInTheDocument();
  expect(within(history).getByText("On v1 For advisors")).toBeInTheDocument();
  expect(within(history).getByText("Reason: Permit not yet issued")).toBeInTheDocument();
});

test("without a history the sheet says so", async () => {
  const { dialog } = await openSheet(makeContext({ history: [] }));
  expect(within(dialog).getByText("No Go / No-Go recorded yet.")).toBeInTheDocument();
});

test("changes since the version offer to save a version first, and switch to that sheet", async () => {
  const { user, dialog, router } = await openSheet(makeContext({ hasChangesSinceVersion: true }));
  expect(
    within(dialog).getByText("This plan has changed since v1 For advisors. Save a version first?"),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Record" })).toBeEnabled();
  await user.click(within(dialog).getByRole("button", { name: "Save a version" }));
  expect(await screen.findByRole("dialog", { name: "Save version" })).toBeInTheDocument();
  expect(router.state.location.search).toMatchObject({ modal: "save-version" });
  expect(screen.queryByRole("dialog", { name: "Record Go / No-Go" })).toBeNull();
});

test("a plan with no version says so", async () => {
  const { dialog } = await openSheet(makeContext({ currentVersion: null }));
  expect(within(dialog).getByText("No version saved yet")).toBeInTheDocument();
});

test("recording sends the value and the trimmed reason, refreshes, shows a toast and closes", async () => {
  const { api, user, dialog } = await openSheet(makeContext(), {
    [`POST ${GO_NO_GO_PATH}`]: () => recorded,
  });
  await user.click(within(dialog).getByRole("radio", { name: "Launch" }));
  await user.click(within(dialog).getByRole("textbox", { name: /^Why\?/ }));
  await user.paste("  Permit issued  ");
  const reads = () => api.calls.filter((c) => c.url.pathname.startsWith("/api/v1/ideas/")).length;
  const before = reads();
  await user.click(within(dialog).getByRole("button", { name: "Record" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Record Go / No-Go" })).toBeNull(),
  );
  expect(callsTo(api, "POST", GO_NO_GO_PATH).map((c) => c.body)).toEqual([
    { value: "launch", reason: "Permit issued" },
  ]);
  expect(await screen.findByText("Go / No-Go recorded")).toBeInTheDocument();
  await waitFor(() => expect(reads()).toBeGreaterThan(before));
});

test("a missing choice and reason are refused with their reasons", async () => {
  const { api, user, dialog } = await openSheet();
  await user.click(within(dialog).getByRole("button", { name: "Record" }));
  expect(await within(dialog).findAllByText("Required")).not.toHaveLength(0);
  expect(callsTo(api, "POST", GO_NO_GO_PATH)).toHaveLength(0);
});

test("a reason over 5000 characters is refused", async () => {
  const { api, user, dialog } = await openSheet();
  await user.click(within(dialog).getByRole("radio", { name: "Stop" }));
  await user.click(within(dialog).getByRole("textbox", { name: /^Why\?/ }));
  await user.paste("x".repeat(5001));
  await user.click(within(dialog).getByRole("button", { name: "Record" }));
  expect(await within(dialog).findByText("Use at most 5000 characters")).toBeInTheDocument();
  expect(callsTo(api, "POST", GO_NO_GO_PATH)).toHaveLength(0);
});

test("a refused record shows the reason and keeps the input", async () => {
  const { user, dialog } = await openSheet(makeContext(), {
    [`POST ${GO_NO_GO_PATH}`]: () => refusal("ARCHIVED"),
  });
  await user.click(within(dialog).getByRole("radio", { name: "Delay" }));
  await user.click(within(dialog).getByRole("textbox", { name: /^Why\?/ }));
  await user.paste("Wait");
  await user.click(within(dialog).getByRole("button", { name: "Record" }));
  expect(await within(dialog).findByText("The Go / No-Go was not recorded.")).toBeInTheDocument();
  expect(
    within(dialog).getByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
  expect(within(dialog).getByRole("textbox", { name: /^Why\?/ })).toHaveValue("Wait");
  expect(screen.queryByText("Go / No-Go recorded")).toBeNull();
});

test("a failed read of the context offers Retry", async () => {
  let failing = true;
  const { api, user } = await openPlanHome(
    {},
    {
      [`GET ${CONTEXT_PATH}`]: () =>
        failing ? refusal("RATE_LIMITED", 429) : { body: makeContext() },
    },
  );
  await user.click(screen.getByRole("button", { name: "Record Go/No-Go" }));
  const dialog = await screen.findByRole("dialog", { name: "Record Go / No-Go" });
  expect(
    await within(dialog).findByText("The Go / No-Go details could not be read."),
  ).toBeInTheDocument();
  failing = false;
  await user.click(within(dialog).getByRole("button", { name: "Retry" }));
  // The sheet is a new dialog once the read succeeds, so the old element is gone.
  expect(await screen.findByText("We have 20 pre-orders")).toBeInTheDocument();
  expect(callsTo(api, "GET", CONTEXT_PATH)).toHaveLength(2);
});

test("a Viewer who opens the URL gets no sheet and no read of the context", async () => {
  const api = planApi({ role: "viewer" });
  await renderApp(`${PLAN_URL}?modal=go-no-go`);
  await screen.findByRole("heading", { level: 1, name: "Plan A" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(callsTo(api, "GET", CONTEXT_PATH)).toHaveLength(0);
});
