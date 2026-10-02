import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { IDEA_ID } from "./question-fixtures";
import { ENTRY_OLD, ENTRY_PERMIT, ENTRY_PRICE, logEntry } from "./research-fixtures";
import { renderApp, WORKSPACE } from "./support";
import {
  patched,
  RESEARCH_PATH,
  registerResearchHooks,
  researchApi,
  V,
  viewerMe,
  writes,
} from "./support-research";

registerResearchHooks();

test("the entries come newest first with their source, checks and the items they are evidence for", async () => {
  researchApi();
  await renderApp(RESEARCH_PATH());
  const list = await screen.findByRole("grid", { name: "Research log entries" });
  const rows = within(list).getAllByRole("row");
  expect(rows.map((row) => row.textContent)).toEqual([
    expect.stringContaining("Price check: Lacson St."),
    expect.stringContaining("City hall: business permit"),
    expect.stringContaining("Neighbour interview"),
  ]);
  expect(rows[0]).toHaveTextContent("Price check");
  expect(rows[0]).toHaveTextContent("Local price range");
  expect(rows[1]).toHaveTextContent("Permits");
  expect(rows[1]).toHaveTextContent("Demand or problem signal");
  expect(rows[1]).toHaveTextContent("Evidence for 2 items");
  expect(rows[2]).toHaveTextContent("No date");
  expect(screen.getByText("Choose an entry to see its details.")).toBeInTheDocument();
});

test("filtering by the check an entry supports asks the API and keeps the filter in the URL", async () => {
  const { calls } = researchApi();
  const user = userEvent.setup();
  const { router } = await renderApp(RESEARCH_PATH());
  await screen.findByRole("grid", { name: "Research log entries" });
  await user.click(screen.getByRole("button", { name: /Supports check/ }));
  await user.click(await screen.findByRole("option", { name: "Permits" }));
  await waitFor(() =>
    expect(
      calls.some(
        (c) =>
          c.url.pathname === `${V}/research-log` &&
          c.url.searchParams.get("supports") === "permits",
      ),
    ).toBe(true),
  );
  await waitFor(() => expect(router.state.location.search).toMatchObject({ supports: "permits" }));
  const list = await screen.findByRole("grid", { name: "Research log entries" });
  await waitFor(() => expect(within(list).getAllByRole("row")).toHaveLength(1));
  expect(within(list).getByRole("row")).toHaveTextContent("City hall: business permit");
});

test("a filter that matches nothing offers to clear it", async () => {
  researchApi();
  const user = userEvent.setup();
  await renderApp(RESEARCH_PATH("?supports=demand_signal&source=website"));
  expect(await screen.findByText("Nothing matches these filters")).toBeInTheDocument();
  await user.click(screen.getAllByRole("button", { name: "Clear filters" })[0] as HTMLElement);
  expect(await screen.findByRole("grid", { name: "Research log entries" })).toBeInTheDocument();
});

test("an idea with no entries explains the log and offers Add entry", async () => {
  researchApi({}, { entries: [] });
  await renderApp(RESEARCH_PATH());
  expect(
    await screen.findByText("Record what you observe, with sources. Others can check it later."),
  ).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Add entry" }).length).toBeGreaterThan(0);
});

test("a Viewer reads the entries and the empty state has no button", async () => {
  researchApi({}, { entries: [], me: viewerMe() });
  await renderApp(RESEARCH_PATH());
  await screen.findByText("Record what you observe, with sources. Others can check it later.");
  expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
});

test("opening an entry shows its fields and the items that use it as evidence, with links", async () => {
  researchApi();
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PERMIT}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "City hall: business permit" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /Topic/ })).toHaveValue("City hall: business permit");
  expect(screen.getByRole("checkbox", { name: "Permits" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Local price range" })).not.toBeChecked();
  const used = screen.getByRole("list", { name: "Used as evidence" });
  expect(within(used).getByRole("link", { name: "01 WHO" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ideas/${IDEA_ID}/questions/01?q=V.01.WHO`,
  );
});

test("a typed topic is saved after a pause with the entry's version", async () => {
  const price = logEntry();
  const { calls } = researchApi({
    [`PATCH /api/v1/research-log/${ENTRY_PRICE}`]: patched(price),
  });
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PRICE}`));
  const topic = await screen.findByRole("textbox", { name: /Topic/ });
  await userEvent.clear(topic);
  await userEvent.type(topic, "Price check: Burgos St.");
  await waitFor(() => expect(writes(calls)).toHaveLength(1), { timeout: 4000 });
  expect(writes(calls)[0]).toMatchObject({
    method: "PATCH",
    body: { topic: "Price check: Burgos St.", lockVersion: 1 },
  });
  expect(await screen.findByText("Saved")).toBeInTheDocument();
}, 15_000);

test("an empty topic is not sent and says why, while other fields still save", async () => {
  const price = logEntry();
  const { calls } = researchApi({
    [`PATCH /api/v1/research-log/${ENTRY_PRICE}`]: patched(price),
  });
  const user = userEvent.setup();
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PRICE}`));
  const topic = await screen.findByRole("textbox", { name: /Topic/ });
  await user.clear(topic);
  await user.tab();
  expect(await screen.findByText("Required")).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
  await user.click(screen.getByRole("checkbox", { name: "Permits" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({
    supportsChecks: ["local_price", "permits"],
    lockVersion: 1,
  });
});

test("a link that is not a web address is not sent", async () => {
  const { calls } = researchApi();
  const user = userEvent.setup();
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PRICE}`));
  const url = await screen.findByRole("textbox", { name: "Source URL" });
  await user.type(url, "not a link");
  await user.tab();
  expect(
    await screen.findByText("Enter a link that starts with http:// or https://"),
  ).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
});

test("Add entry opens the form with today's date, and creates the entry once it has a topic", async () => {
  const created = logEntry({ id: ENTRY_OLD, topic: "Walk the market", observedOn: "2026-10-02" });
  const { calls } = researchApi({
    [`POST ${V}/research-log`]: () => ({ status: 201, body: created }),
    [`GET /api/v1/research-log/${ENTRY_OLD}`]: () => ({ body: { ...created, usages: [] } }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(RESEARCH_PATH("?new=1"));
  const submit = await screen.findByRole("button", { name: "Add to log" });
  expect(submit).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: /Topic/ }), "Walk the market");
  expect(submit).toBeEnabled();
  await user.click(submit);
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  const body = writes(calls)[0]?.body as Record<string, unknown>;
  expect(body).toMatchObject({ topic: "Walk the market", supportsChecks: [], sourceType: null });
  expect(body.observedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  await waitFor(() => expect(router.state.location.search).toMatchObject({ entry: ENTRY_OLD }));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Walk the market" }),
  ).toBeInTheDocument();
});

test("a Viewer sees the entry as text, with no way to add or delete", async () => {
  researchApi({}, { me: viewerMe() });
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PRICE}`));
  await screen.findByRole("heading", { level: 2, name: "Price check: Lacson St." });
  expect(screen.getByText("Boxes sell at 320 pesos.")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
  expect(screen.queryByRole("button", { name: /Actions for/ })).toBeNull();
});

test("an archived idea is read-only for an Owner too", async () => {
  researchApi({}, { archived: true });
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PRICE}`));
  await screen.findByRole("heading", { level: 2, name: "Price check: Lacson St." });
  expect(screen.getByText("This idea is archived")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add entry" })).toBeNull();
});

test("deleting an entry that is evidence lists what uses it before anything is deleted", async () => {
  const { calls } = researchApi({
    [`DELETE /api/v1/research-log/${ENTRY_PERMIT}`]: () => ({ body: { affected: [] } }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(RESEARCH_PATH(`?entry=${ENTRY_PERMIT}`));
  await screen.findByRole("heading", { level: 2, name: "City hall: business permit" });
  await user.click(screen.getByRole("button", { name: "Actions for City hall: business permit" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete entry" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/This entry is evidence for 2 items/)).toBeInTheDocument();
  expect(within(dialog).getByText("01 WHO")).toBeInTheDocument();
  expect(within(dialog).getByText(/Rent · Fact would have no evidence left/)).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
  await user.click(within(dialog).getByRole("button", { name: "Delete entry" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.method).toBe("DELETE");
  await waitFor(() => expect(router.state.location.search).not.toHaveProperty("entry"));
  expect(await screen.findByText("Research log entry deleted")).toBeInTheDocument();
});

test("cancelling the confirmation deletes nothing", async () => {
  const { calls } = researchApi();
  const user = userEvent.setup();
  await renderApp(RESEARCH_PATH(`?entry=${ENTRY_OLD}`));
  await screen.findByRole("heading", { level: 2, name: "Neighbour interview" });
  await user.click(screen.getByRole("button", { name: "Actions for Neighbour interview" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete entry" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("No item uses this entry as evidence.")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  expect(writes(calls)).toHaveLength(0);
});
