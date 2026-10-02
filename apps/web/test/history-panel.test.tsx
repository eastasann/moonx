import type { HistoryEntry } from "@moonx/schemas";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { toasts } from "../src/lib/toast";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";

const VALIDATION = "66666666-6666-4666-8666-666666666666";
const ME = makeMe();
const PAOLO = {
  id: "77777777-7777-4777-8777-777777777777",
  displayName: "Paolo Reyes",
  avatarUrl: null,
  badge: null,
};
const TARGET = `validation_answer:${VALIDATION}:V.01.WHO`;
const OPEN = `/w/${WORKSPACE}?panel=history&target=${TARGET}`;

beforeEach(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /min-width/.test(query),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
const toast = vi.spyOn(toasts, "add");

afterEach(() => {
  toast.mockClear();
  vi.unstubAllGlobals();
});

let counter = 0;
function entry(patch: Partial<HistoryEntry> = {}): HistoryEntry {
  counter += 1;
  return {
    id: `e0000000-0000-4000-8000-${String(counter).padStart(12, "0")}`,
    batchId: null,
    target: { type: "validation_answer", id: VALIDATION, key: "V.01.WHO" },
    label: "01 WHO",
    action: "update",
    source: "manual",
    before: { text: "Office workers", fau: null, confidence: null, evidence: [] },
    after: { text: "Office workers in Makati", fau: "assumption", confidence: "low", evidence: [] },
    changedBy: PAOLO,
    changedAt: new Date(Date.now() - 7_200_000).toISOString(),
    revertible: true,
    ...patch,
  };
}

function stubHistory(
  pages: Record<string, { items: HistoryEntry[]; nextCursor: string | null }>,
  extra: Parameters<typeof stubApi>[0] = {},
) {
  return stubApi({
    "GET /api/v1/me": () => ({ body: ME }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    "GET /api/v1/history": ({ url }) => ({
      body: pages[url.searchParams.get("cursor") ?? "first"] ?? { items: [], nextCursor: null },
    }),
    ...extra,
  });
}

const panel = async () => screen.findByRole("complementary", { name: "History" });

test("an entry shows who, when, the item, the source and the character-level change", async () => {
  const api = stubHistory({ first: { items: [entry()], nextCursor: null } });
  await renderApp(OPEN);
  const view = within(await panel());
  expect(await view.findByText("Paolo Reyes")).toBeInTheDocument();
  expect(view.getByText("2 hr. ago")).toBeInTheDocument();
  expect(view.getByText("01 WHO")).toBeInTheDocument();
  expect(view.getByText("Manual edit")).toBeInTheDocument();
  expect(view.getByText("in Makati").tagName).toBe("INS");
  expect(view.getByText("F/A/U")).toBeInTheDocument();
  expect(view.getByText("Assumption")).toBeInTheDocument();
  const history = api.calls.find((c) => c.url.pathname === "/api/v1/history");
  expect(Object.fromEntries(history?.url.searchParams ?? [])).toMatchObject({
    targetType: "validation_answer",
    targetId: VALIDATION,
    targetKey: "V.01.WHO",
  });
});

test("only the fields the catalog names are shown, with catalog labels", async () => {
  stubHistory({
    first: {
      items: [
        entry({
          before: { oneLineConcept: "Cakes", assigneeUserId: null, status: "todo" },
          after: { oneLineConcept: "Gift boxes", assigneeUserId: ME.id, status: "doing" },
        }),
      ],
      nextCursor: null,
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  expect(await view.findByText("One-line concept")).toBeInTheDocument();
  expect(view.getByText("Status")).toBeInTheDocument();
  const panelText = (await panel()).textContent ?? "";
  expect(panelText).toContain("To do");
  expect(panelText).toContain("Doing");
  expect(panelText).not.toContain("todo");
  expect(view.queryByText(/assignee/i)).toBeNull();
  expect(view.queryByText(ME.id)).toBeNull();
});

test("a whole-screen target asks for the container's history", async () => {
  const api = stubHistory({ first: { items: [], nextCursor: null } });
  await renderApp(`/w/${WORKSPACE}?panel=history&target=container:validation:${VALIDATION}:costs`);
  expect(await within(await panel()).findByText("No changes yet")).toBeInTheDocument();
  const history = api.calls.find((c) => c.url.pathname === "/api/v1/history");
  expect(Object.fromEntries(history?.url.searchParams ?? [])).toMatchObject({
    containerType: "validation",
    containerId: VALIDATION,
    sectionKey: "costs",
  });
});

test("Restore this version asks the server to restore that entry", async () => {
  const first = entry();
  const api = stubHistory(
    { first: { items: [first], nextCursor: null } },
    { [`POST /api/v1/history/${first.id}/revert`]: () => ({ body: { entry: first, target: {} } }) },
  );
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.click(await view.findByRole("button", { name: "Restore this version" }));
  await waitFor(() =>
    expect(
      api.calls.some((c) => c.method === "POST" && c.url.pathname.endsWith(`${first.id}/revert`)),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith({ title: "Restored", variant: "positive" }),
  );
  expect(await screen.findByText("Restored")).toBeInTheDocument();
});

test("a deleted row offers Undo delete", async () => {
  const deleted = entry({ action: "delete", after: null, label: "Costs · Rent" });
  stubHistory({ first: { items: [deleted], nextCursor: null } });
  await renderApp(OPEN);
  const view = within(await panel());
  expect(await view.findByRole("button", { name: "Undo delete" })).toBeInTheDocument();
  expect(view.queryByRole("button", { name: "Restore this version" })).toBeNull();
});

test("an AI import offers one button for the whole operation, on its first row only", async () => {
  const batchId = "b0000000-0000-4000-8000-000000000001";
  const rows = [entry({ batchId, source: "ai_import" }), entry({ batchId, source: "ai_import" })];
  const api = stubHistory(
    { first: { items: rows, nextCursor: null } },
    {
      [`POST /api/v1/history/batches/${batchId}/revert`]: () => ({
        body: { reverted: 2, batchId: "b0000000-0000-4000-8000-000000000002" },
      }),
    },
  );
  await renderApp(OPEN);
  const view = within(await panel());
  const undo = await view.findAllByRole("button", { name: "Undo the whole operation" });
  expect(undo).toHaveLength(1);
  expect(view.getAllByText("AI import")).toHaveLength(2);
  await userEvent.click(undo[0] as HTMLElement);
  await waitFor(() =>
    expect(toast).toHaveBeenCalledWith({ title: "Operation undone", variant: "positive" }),
  );
  expect(await screen.findByText("Operation undone")).toBeInTheDocument();
  expect(api.calls.some((c) => c.method === "POST")).toBe(true);
});

test("a manual change is not offered as a whole-operation undo", async () => {
  const batchId = "b0000000-0000-4000-8000-000000000003";
  stubHistory({ first: { items: [entry({ batchId })], nextCursor: null } });
  await renderApp(OPEN);
  await within(await panel()).findByRole("button", { name: "Restore this version" });
  expect(screen.queryByRole("button", { name: "Undo the whole operation" })).toBeNull();
});

test("a Viewer can read the history but is given no way to restore", async () => {
  stubHistory({
    first: {
      items: [entry({ revertible: false }), entry({ revertible: false, action: "delete" })],
      nextCursor: null,
    },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  expect((await view.findAllByText("Paolo Reyes")).length).toBe(2);
  expect(view.queryByRole("button", { name: /Restore|Undo/ })).toBeNull();
});

test("an operation that was already undone is explained", async () => {
  const batchId = "b0000000-0000-4000-8000-000000000004";
  stubHistory(
    { first: { items: [entry({ batchId, source: "ai_import" })], nextCursor: null } },
    {
      [`POST /api/v1/history/batches/${batchId}/revert`]: () => ({
        status: 409,
        body: { error: { code: "CONFLICT", message: "done", requestId: "abcdef12" } },
      }),
    },
  );
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.click(await view.findByRole("button", { name: "Undo the whole operation" }));
  expect(await view.findByText("This operation was already undone.")).toBeInTheDocument();
});

test("Load more asks for the next page with the cursor", async () => {
  const older = entry({ before: null, after: { text: "First draft" }, action: "create" });
  const api = stubHistory({
    first: { items: [entry()], nextCursor: "cursor-2" },
    "cursor-2": { items: [older], nextCursor: null },
  });
  await renderApp(OPEN);
  const view = within(await panel());
  await userEvent.click(await view.findByRole("button", { name: "Load more" }));
  expect(await view.findByText("First draft")).toBeInTheDocument();
  expect(view.queryByRole("button", { name: "Load more" })).toBeNull();
  expect(
    api.calls
      .filter((c) => c.url.pathname === "/api/v1/history")
      .map((c) => c.url.searchParams.get("cursor")),
  ).toEqual([null, "cursor-2"]);
});

test("a history with no entries says so", async () => {
  stubHistory({ first: { items: [], nextCursor: null } });
  await renderApp(OPEN);
  expect(await within(await panel()).findByText("No changes yet")).toBeInTheDocument();
});
