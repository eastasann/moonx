import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { answer, IDEA_ID, VALIDATION_ID } from "./question-fixtures";
import {
  COMPETITOR_A,
  COMPETITOR_B,
  COMPETITOR_C,
  COMPETITOR_NEW,
  COMPETITORS,
  competitor,
  evidenceOf,
  patternAnswers,
} from "./research-fixtures";
import { renderApp, WORKSPACE } from "./support";
import {
  COMPETITORS_PATH,
  patched,
  registerResearchHooks,
  researchApi,
  V,
  viewerMe,
  writes,
} from "./support-research";

registerResearchHooks();

test("the heading counts the competitors against the template's range and the cards show what is filled in", async () => {
  researchApi();
  await renderApp(COMPETITORS_PATH());
  expect(await screen.findByText("3 competitors · aim for 3–5")).toBeInTheDocument();
  const cards = screen.getByRole("grid", { name: "Competitors" });
  const rows = within(cards).getAllByRole("row");
  expect(rows).toHaveLength(3);
  expect(rows[0]).toHaveTextContent("Bacolod Piaya House");
  expect(rows[0]).toHaveTextContent("Direct Competitor");
  expect(rows[0]).toHaveTextContent("₱320 per box");
  expect(rows[0]).toHaveTextContent("No delivery");
  expect(rows[1]).toHaveTextContent("Substitute");
  expect(rows[1]).toHaveTextContent("₱150");
  expect(rows[1]).not.toHaveTextContent("Strength");
});

test("the two pattern questions sit under the cards with F/A/U", async () => {
  researchApi();
  await renderApp(COMPETITORS_PATH());
  expect(await screen.findByRole("textbox", { name: "Survivor Patterns" })).toHaveValue(
    "Gift-ready packaging",
  );
  expect(screen.getByRole("textbox", { name: "Failure Patterns" })).toHaveValue("");
  expect(screen.getAllByRole("radio", { name: "Fact" })).toHaveLength(2);
});

test("a pattern answer is saved through the answers API", async () => {
  const { calls } = researchApi({
    [`PUT ${V}/answers/V.04.FAILURE_PATTERNS`]: () => ({
      body: answer("V.04.FAILURE_PATTERNS", { text: "Rent too high", lockVersion: 1 }),
    }),
  });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH());
  const field = await screen.findByRole("textbox", { name: "Failure Patterns" });
  await user.type(field, "Rent too high");
  await user.tab();
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "PUT",
    body: { text: "Rent too high", lockVersion: 0 },
  });
});

test("?q= puts the cursor in the pattern question it names", async () => {
  researchApi();
  await renderApp(COMPETITORS_PATH("?q=V.04.FAILURE_PATTERNS"));
  const field = await screen.findByRole("textbox", { name: "Failure Patterns" });
  await waitFor(() => expect(field).toHaveFocus());
});

test("Table swaps the cards for a table with a column per competitor, and the choice is in the URL", async () => {
  researchApi();
  const user = userEvent.setup();
  const { router } = await renderApp(COMPETITORS_PATH());
  await screen.findByRole("grid", { name: "Competitors" });
  await user.click(screen.getByRole("radio", { name: "Table" }));
  const table = await screen.findByRole("grid", { name: "Competitor comparison" });
  expect(screen.queryByRole("grid", { name: "Competitors" })).toBeNull();
  const headers = within(table).getAllByRole("columnheader");
  expect(headers.map((h) => h.textContent)).toEqual([
    "Field",
    "Bacolod Piaya House",
    "Supermarket shelf",
    "Courier gift service",
  ]);
  const price = within(table).getByRole("rowheader", { name: "Typical Price" }).closest("tr");
  expect(price).toHaveTextContent("₱320");
  expect(price).toHaveTextContent("₱150");
  expect(router.state.location.search).toMatchObject({ view: "table" });
});

test("?view=table opens on the table", async () => {
  researchApi();
  await renderApp(COMPETITORS_PATH("?view=table"));
  expect(await screen.findByRole("grid", { name: "Competitor comparison" })).toBeInTheDocument();
});

test("pressing a card opens the competitor, and a typed change is saved with its version", async () => {
  const first = COMPETITORS[0] as (typeof COMPETITORS)[number];
  const { calls } = researchApi({
    [`PATCH /api/v1/competitors/${COMPETITOR_A}`]: patched(first),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(COMPETITORS_PATH());
  const cards = await screen.findByRole("grid", { name: "Competitors" });
  await user.click(within(cards).getByText("Bacolod Piaya House"));
  const dialog = await screen.findByRole("dialog", { name: "Bacolod Piaya House" });
  expect(router.state.location.search).toMatchObject({ row: COMPETITOR_A });
  const weakness = within(dialog).getByRole("textbox", { name: "Weakness" });
  await user.clear(weakness);
  await user.type(weakness, "Slow delivery");
  await user.tab();
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "PATCH",
    url: expect.objectContaining({ pathname: `/api/v1/competitors/${COMPETITOR_A}` }),
    body: { weakness: "Slow delivery", lockVersion: 1 },
  });
  await user.click(within(dialog).getByRole("button", { name: "Done" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Bacolod Piaya House" })).toBeNull(),
  );
  expect(router.state.location.search).not.toHaveProperty("row");
  expect(
    await within(await screen.findByRole("grid", { name: "Competitors" })).findByText(
      "Slow delivery",
    ),
  ).toBeInTheDocument();
}, 15_000);

test("a competitor has no name left to save when it is cleared, so nothing is sent", async () => {
  const { calls } = researchApi();
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH(`?row=${COMPETITOR_B}`));
  const dialog = await screen.findByRole("dialog", { name: "Supermarket shelf" });
  const name = within(dialog).getByRole("textbox", { name: /Name/ });
  await user.clear(name);
  await user.tab();
  expect(await within(dialog).findByText("Required")).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
});

test("a typical price is checked for range and sent as a number", async () => {
  const second = COMPETITORS[1] as (typeof COMPETITORS)[number];
  const { calls } = researchApi({
    [`PATCH /api/v1/competitors/${COMPETITOR_B}`]: patched(second),
  });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH(`?row=${COMPETITOR_B}`));
  const dialog = await screen.findByRole("dialog", { name: "Supermarket shelf" });
  const price = within(dialog).getByRole("textbox", { name: "Typical Price" });
  await user.clear(price);
  await user.type(price, "-5");
  expect(await within(dialog).findByText("Enter an amount of 0 or more")).toBeInTheDocument();
  expect(writes(calls)).toHaveLength(0);
  await user.clear(price);
  await user.type(price, "1,200");
  await user.tab();
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({ typicalPrice: 1200, lockVersion: 1 });
});

test("Add competitor creates the competitor once it has a name, then opens it", async () => {
  const created = competitor({ id: COMPETITOR_NEW, name: "Night market stall", sortOrder: 3 });
  const { calls } = researchApi({
    [`POST ${V}/competitors`]: () => ({ status: 201, body: created }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(COMPETITORS_PATH());
  await screen.findByRole("grid", { name: "Competitors" });
  await user.click(screen.getByRole("button", { name: "Add competitor" }));
  const dialog = await screen.findByRole("dialog", { name: "New competitor" });
  const submit = within(dialog).getByRole("button", { name: "Create competitor" });
  expect(submit).toBeDisabled();
  await user.type(within(dialog).getByRole("textbox", { name: /Name/ }), "Night market stall");
  await user.click(submit);
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toMatchObject({ name: "Night market stall", type: null });
  await waitFor(() => expect(router.state.location.search).toMatchObject({ row: COMPETITOR_NEW }));
  expect(await screen.findByRole("dialog", { name: "Night market stall" })).toBeInTheDocument();
});

test("an empty list says how many to list and offers Add competitor", async () => {
  researchApi({}, { competitors: [] });
  await renderApp(COMPETITORS_PATH());
  expect(await screen.findByText("List 3–5 competitors or substitutes.")).toBeInTheDocument();
  expect(screen.getByText("Include what people do today instead.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Add competitor" })).toBeInTheDocument();
  expect(screen.queryByRole("radio", { name: "Table" })).toBeNull();
});

test("Move later sends the whole new order", async () => {
  const { calls } = researchApi({ [`PUT ${V}/competitors/order`]: () => ({ status: 204 }) });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH(`?row=${COMPETITOR_A}`));
  const dialog = await screen.findByRole("dialog", { name: "Bacolod Piaya House" });
  expect(within(dialog).queryByRole("menuitem", { name: "Move earlier" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Actions for Bacolod Piaya House" }));
  expect(await screen.findByRole("menuitem", { name: "Move earlier" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("menuitem", { name: "Move later" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "PUT",
    body: { ids: [COMPETITOR_B, COMPETITOR_A, COMPETITOR_C] },
  });
});

test("deleting a competitor asks first", async () => {
  const { calls } = researchApi({
    [`DELETE /api/v1/competitors/${COMPETITOR_C}`]: () => ({ status: 204 }),
  });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH(`?row=${COMPETITOR_C}`));
  const dialog = await screen.findByRole("dialog", { name: "Courier gift service" });
  await user.click(
    within(dialog).getByRole("button", { name: "Actions for Courier gift service" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Delete competitor" }));
  const confirm = await screen.findByRole("alertdialog");
  expect(writes(calls)).toHaveLength(0);
  await user.click(within(confirm).getByRole("button", { name: "Delete competitor" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(await screen.findByText("Courier gift service deleted")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Courier gift service" })).toBeNull(),
  );
});

test("evidence is attached to a competitor without making it a Fact", async () => {
  const entry = {
    id: "77777777-7777-4777-8777-777777777777",
    observedOn: "2026-09-12",
    topic: "Store observation: SM Bacolod",
  };
  const { calls } = researchApi({
    [`POST ${V}/evidence`]: () => ({
      status: 201,
      body: {
        evidence: { id: "e1" },
        lockVersion: 2,
        classification: {
          fau: null,
          confidence: null,
          state: "empty",
          evidence: [evidenceOf(entry.id, entry.topic)],
        },
      },
    }),
    [`GET ${V}/research-log`]: () => ({
      body: {
        items: [
          {
            ...entry,
            observation: null,
            sourceType: null,
            sourceUrl: null,
            supportsChecks: [],
            supportsNote: null,
            lockVersion: 1,
            updatedAt: null,
            updatedBy: null,
            createdBy: null,
            usedAsEvidenceCount: 0,
            commentCount: 0,
          },
        ],
        nextCursor: null,
      },
    }),
  });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH(`?row=${COMPETITOR_A}`));
  const dialog = await screen.findByRole("dialog", { name: "Bacolod Piaya House" });
  await user.click(within(dialog).getByRole("button", { name: "Add evidence" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  await user.click(await within(sheet).findByRole("checkbox", { name: /Store observation/ }));
  await user.click(within(sheet).getByRole("button", { name: "Attach 1 entry" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({
    target: { type: "competitor", id: COMPETITOR_A },
    researchLogEntryId: entry.id,
    lockVersion: 1,
  });
  expect(await within(sheet).findByText(/Store observation: SM Bacolod/)).toBeInTheDocument();
});

test("a Viewer reads the cards and the dialog as text, with no Add and no editing", async () => {
  researchApi({}, { me: viewerMe() });
  const user = userEvent.setup();
  await renderApp(COMPETITORS_PATH());
  const cards = await screen.findByRole("grid", { name: "Competitors" });
  expect(screen.queryByRole("button", { name: "Add competitor" })).toBeNull();
  expect(screen.getByRole("textbox", { name: "Survivor Patterns" })).toHaveAttribute("readonly");
  await user.click(within(cards).getByText("Bacolod Piaya House"));
  const dialog = await screen.findByRole("dialog", { name: "Bacolod Piaya House" });
  expect(within(dialog).queryByRole("textbox")).toBeNull();
  expect(within(dialog).getByText("No delivery")).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Add evidence" })).toBeNull();
});

test("a row that is not in the list opens nothing", async () => {
  researchApi({}, { patterns: patternAnswers() });
  await renderApp(COMPETITORS_PATH(`?row=${IDEA_ID}`));
  await screen.findByRole("grid", { name: "Competitors" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(WORKSPACE).toBeTruthy();
  expect(VALIDATION_ID).toBeTruthy();
});
