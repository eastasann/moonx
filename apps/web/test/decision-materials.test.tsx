import { screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { makeContext, makeEmptyContext, openDecide, waitForForm } from "./support-decision";

afterEach(() => {
  vi.unstubAllGlobals();
});

const tile = (label: string) =>
  screen.getByText(label, { selector: "dt" }).parentElement as HTMLElement;

test("shows the summary, key numbers, missing checks, F/A/U and the last decision", async () => {
  await openDecide();
  await waitForForm();
  const summary = await screen.findByRole("list", { name: "Summary" });
  expect(within(summary).getByText("Office managers in Bacolod")).toBeInTheDocument();
  expect(within(summary).getByText("Mixed")).toBeInTheDocument();
  expect(within(summary).getByText("Corporate gifting season")).toBeInTheDocument();
  expect(within(summary).getByText("Permit delays")).toBeInTheDocument();
  // The one unfilled row says Empty.
  expect(within(summary).getAllByText("Empty")).toHaveLength(1);

  expect(within(tile("Startup")).getByText("₱169,500")).toBeInTheDocument();
  expect(within(tile("Break-even")).getByText("6.9 / day")).toBeInTheDocument();
  expect(within(tile("Expected")).getByText("₱18,490 / month")).toBeInTheDocument();
  expect(within(tile("Payback")).getByText("9.2 months")).toBeInTheDocument();
  expect(within(tile("ROI")).getByText("130.9%")).toBeInTheDocument();

  expect(screen.getByRole("heading", { name: "Checks — 2 missing" })).toBeInTheDocument();
  const checks = screen.getByRole("list", { name: "Checks" });
  expect(within(checks).getAllByRole("listitem")).toHaveLength(2);
  expect(within(checks).getByText("Permits")).toBeInTheDocument();
  expect(within(checks).getByText("Startup & monthly costs")).toBeInTheDocument();

  const group = screen.getByRole("group", { name: "Items by F/A/U" });
  expect(within(group).getByText("Unclassified")).toBeInTheDocument();
  expect(screen.getByText("Review first: 3 Unclassified · 2 Unknown")).toBeInTheDocument();
  expect(screen.getByText("Last: Hold · Sep 30, 2026 · Ana Villanueva")).toBeInTheDocument();
  expect(
    screen.getByText("2 checks are missing. They will be recorded with this decision."),
  ).toBeInTheDocument();
});

test("an empty idea shows Empty for every number and six missing checks, and can still be decided", async () => {
  await openDecide({}, { context: makeEmptyContext() });
  await screen.findByRole("heading", { name: "Checks — 6 missing" });
  for (const label of ["Startup", "Break-even", "Expected", "Payback", "ROI"]) {
    expect(within(tile(label)).getByText("Empty")).toBeInTheDocument();
  }
  expect(screen.queryByText(/^Last:/)).toBeNull();
  expect(
    screen.getByText("6 checks are missing. They will be recorded with this decision."),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Record decision" })).toBeEnabled();
});

test("with nothing missing the checks block says all six are done", async () => {
  await openDecide({}, { context: makeContext({ missingChecks: [] }) });
  expect(await screen.findByText("All 6 checks done")).toBeInTheDocument();
  expect(screen.queryByText(/checks? (is|are) missing/)).toBeNull();
});
