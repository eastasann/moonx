import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import {
  ASSUMPTION_A,
  ASSUMPTION_B,
  ASSUMPTIONS,
  assumption,
  evidenceOf,
  RISK_A,
  RISK_B,
  RISK_C,
  RISKS,
  risk,
} from "./research-fixtures";
import { renderApp } from "./support";
import {
  ASSUMPTIONS_PATH,
  patched,
  registerResearchHooks,
  researchApi,
  V,
  viewerMe,
  writes,
} from "./support-research";

registerResearchHooks();

const rowTexts = (list: HTMLElement) =>
  within(list)
    .getAllByRole("row")
    .map((row) => row.textContent ?? "");

test("Assumptions is the first tab, with each tab's count, and lists the statements with confidence", async () => {
  researchApi();
  await renderApp(ASSUMPTIONS_PATH());
  expect(await screen.findByRole("tab", { name: "Assumptions (2)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByRole("tab", { name: "Risks (3)" })).toHaveAttribute("aria-selected", "false");
  const rows = rowTexts(await screen.findByRole("grid", { name: "Assumptions" }));
  expect(rows[0]).toContain("Offices order gifts monthly");
  expect(rows[0]).toContain("Confidence: Medium");
  expect(rows[1]).toContain("No confidence set");
  expect(screen.getByText("Choose a row to see its details.")).toBeInTheDocument();
});

test("Risks come in the server's order, Impact first, and say so", async () => {
  researchApi();
  const user = userEvent.setup();
  const { router } = await renderApp(ASSUMPTIONS_PATH());
  await user.click(await screen.findByRole("tab", { name: "Risks (3)" }));
  const list = await screen.findByRole("grid", { name: "Risks" });
  const rows = rowTexts(list);
  expect(rows[0]).toContain("Permit takes months");
  expect(rows[0]).toContain("Impact: High");
  expect(rows[1]).toContain("Piaya spoils in transit");
  expect(rows[2]).toContain("Rent rises");
  expect(
    screen.getByText("Highest Impact first, then Probability. Move a risk to place it by hand."),
  ).toBeInTheDocument();
  expect(router.state.location.search).toMatchObject({ tab: "risks" });
});

test("?tab=risks opens on the risks", async () => {
  researchApi();
  await renderApp(ASSUMPTIONS_PATH("?tab=risks"));
  expect(await screen.findByRole("grid", { name: "Risks" })).toBeInTheDocument();
});

test("a link to a risk row picks the Risks tab and opens the row", async () => {
  researchApi();
  await renderApp(ASSUMPTIONS_PATH(`?row=${RISK_B}`));
  expect(
    await screen.findByRole("heading", { level: 2, name: "Piaya spoils in transit" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Risks (3)" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("textbox", { name: /^Risk/ })).toHaveValue("Piaya spoils in transit");
});

test("choosing a higher Impact saves it and reads the risks again, which the server places", async () => {
  const third = RISKS[2] as (typeof RISKS)[number];
  let reordered = false;
  const { calls } = researchApi({
    [`PATCH /api/v1/risks/${RISK_C}`]: (request) => {
      reordered = true;
      return patched(third)(request);
    },
    [`GET ${V}/risks`]: () => ({
      body: {
        items: reordered
          ? [RISKS[0], risk({ ...third, impact: "high", lockVersion: 2 }), RISKS[1]]
          : RISKS,
      },
    }),
  });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH(`?tab=risks&row=${RISK_C}`));
  await screen.findByRole("heading", { level: 2, name: "Rent rises" });
  await user.click(screen.getByRole("button", { name: /Impact/ }));
  await user.click(await screen.findByRole("option", { name: "High" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({ impact: "high", lockVersion: 1 });
  const list = await screen.findByRole("grid", { name: "Risks" });
  await waitFor(() => expect(rowTexts(list)[1]).toContain("Rent rises"));
});

test("Move down sends every risk in the new order, which places them by hand", async () => {
  let order = [RISK_A, RISK_B, RISK_C];
  const { calls } = researchApi({
    [`PUT ${V}/risks/order`]: ({ body }) => {
      order = (body as { ids: string[] }).ids;
      return { status: 204 };
    },
    [`GET ${V}/risks`]: () => ({
      body: { items: order.map((id) => RISKS.find((r) => r.id === id)) },
    }),
  });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH(`?tab=risks&row=${RISK_A}`));
  await screen.findByRole("heading", { level: 2, name: "Permit takes months" });
  await user.click(screen.getByRole("button", { name: "Actions for Permit takes months" }));
  expect(await screen.findByRole("menuitem", { name: "Move up" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  await user.click(screen.getByRole("menuitem", { name: "Move down" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]).toMatchObject({
    method: "PUT",
    body: { ids: [RISK_B, RISK_A, RISK_C] },
  });
  const list = await screen.findByRole("grid", { name: "Risks" });
  expect(rowTexts(list)[0]).toContain("Piaya spoils in transit");
});

test("an assumption's fields save as they are typed, and its confidence saves when chosen", async () => {
  const first = ASSUMPTIONS[0] as (typeof ASSUMPTIONS)[number];
  const { calls } = researchApi({
    [`PATCH /api/v1/assumptions/${ASSUMPTION_A}`]: patched(first),
  });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH(`?row=${ASSUMPTION_A}`));
  await screen.findByRole("heading", { level: 2, name: "Offices order gifts monthly" });
  await user.click(screen.getByRole("radio", { name: "High" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({ confidence: "high", lockVersion: 1 });
  const next = screen.getByRole("textbox", { name: "Next Check" });
  await user.clear(next);
  await user.type(next, "Call 20 offices");
  await user.tab();
  await waitFor(() => expect(writes(calls)).toHaveLength(2));
  expect(writes(calls)[1]?.body).toEqual({ nextCheck: "Call 20 offices", lockVersion: 2 });
});

test("an assumption takes evidence without becoming a Fact", async () => {
  const log = {
    id: "00000000-0000-4000-8000-0000000000aa",
    observedOn: "2026-09-12",
    topic: "HR interview",
  };
  const { calls } = researchApi({
    [`GET ${V}/research-log`]: () => ({
      body: {
        items: [
          {
            ...log,
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
    [`POST ${V}/evidence`]: () => ({
      status: 201,
      body: {
        evidence: { id: "e1" },
        lockVersion: 2,
        classification: {
          fau: null,
          confidence: null,
          state: "empty",
          evidence: [evidenceOf(log.id, log.topic)],
        },
      },
    }),
  });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH(`?row=${ASSUMPTION_A}`));
  await screen.findByRole("heading", { level: 2, name: "Offices order gifts monthly" });
  await user.click(screen.getByRole("button", { name: "Add evidence" }));
  const sheet = await screen.findByRole("dialog", { name: "Evidence" });
  await user.click(await within(sheet).findByRole("checkbox", { name: /HR interview/ }));
  await user.click(within(sheet).getByRole("button", { name: "Attach 1 entry" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toEqual({
    target: { type: "assumption", id: ASSUMPTION_A },
    researchLogEntryId: log.id,
    lockVersion: 1,
  });
});

test("Add risk opens the form and creates the risk once it has a statement", async () => {
  const created = risk({ id: "00000000-0000-4000-8000-0000000000bb", statement: "Flood season" });
  const { calls } = researchApi({
    [`POST ${V}/risks`]: () => ({ status: 201, body: created }),
  });
  const user = userEvent.setup();
  const { router } = await renderApp(ASSUMPTIONS_PATH("?tab=risks"));
  await screen.findByRole("grid", { name: "Risks" });
  await user.click(screen.getByRole("button", { name: "Add risk" }));
  const submit = await screen.findByRole("button", { name: "Create risk" });
  expect(submit).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: /^Risk/ }), "Flood season");
  await user.click(submit);
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(writes(calls)[0]?.body).toMatchObject({
    statement: "Flood season",
    probability: null,
    impact: null,
  });
  await waitFor(() => expect(router.state.location.search).toMatchObject({ row: created.id }));
});

test("deleting an assumption asks first and then removes it from the list", async () => {
  const { calls } = researchApi({
    [`DELETE /api/v1/assumptions/${ASSUMPTION_B}`]: () => ({ status: 204 }),
  });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH(`?row=${ASSUMPTION_B}`));
  await screen.findByRole("heading", { level: 2, name: "Riders are easy to hire" });
  await user.click(screen.getByRole("button", { name: "Actions for Riders are easy to hire" }));
  await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
  const confirm = await screen.findByRole("alertdialog");
  expect(writes(calls)).toHaveLength(0);
  await user.click(within(confirm).getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(writes(calls)).toHaveLength(1));
  expect(await screen.findByText("Assumption deleted")).toBeInTheDocument();
  const list = await screen.findByRole("grid", { name: "Assumptions" });
  expect(rowTexts(list)).toHaveLength(1);
});

test("each tab has its own empty state with an Add button", async () => {
  researchApi({}, { assumptions: [], risks: [] });
  const user = userEvent.setup();
  await renderApp(ASSUMPTIONS_PATH());
  expect(await screen.findByText("No assumptions yet")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Add assumption" }).length).toBeGreaterThan(0);
  await user.click(screen.getByRole("tab", { name: "Risks (0)" }));
  expect(await screen.findByText("No risks yet")).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "Add risk" }).length).toBeGreaterThan(0);
});

test("a Viewer reads a risk as text, with no Add and no menu", async () => {
  researchApi({}, { me: viewerMe() });
  await renderApp(ASSUMPTIONS_PATH(`?tab=risks&row=${RISK_A}`));
  await screen.findByRole("heading", { level: 2, name: "Permit takes months" });
  expect(screen.getByText("Start the application first")).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Add risk" })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Actions for/ })).toBeNull();
});

test("an assumption row is kept when a risk of the same page is chosen", async () => {
  researchApi();
  await renderApp(ASSUMPTIONS_PATH(`?row=${assumption().id}`));
  await screen.findByRole("heading", { level: 2, name: "Offices order gifts monthly" });
  expect(screen.getByRole("tab", { name: "Assumptions (2)" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
});
