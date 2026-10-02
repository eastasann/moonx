import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  EXPORT_URL,
  exportedFor,
  exportPath,
  planContext,
  registerAiHooks,
  selfAnalysisContext,
  VALIDATION,
  validationContext,
  viewerMe,
} from "./support-ai";

registerAiHooks();

const checked = (name: string) => screen.getByRole("checkbox", { name: new RegExp(name) });

test("a validation lists the sections that hold questions and starts with the section it came from", async () => {
  api();
  await renderApp(exportPath(`source=validation&id=${VALIDATION}&scope=01`));
  expect(
    await screen.findByRole("heading", { level: 1, name: "Export for AI" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Validation: Piaya Gift Box Delivery")).toBeInTheDocument();
  const group = screen.getByRole("group", { name: "Sections to export" });
  expect(
    within(group)
      .getAllByRole("checkbox")
      .map((box) => box.closest("label")?.textContent),
  ).toEqual([
    "01 Customer & Problem",
    "02 Market",
    "04 Patterns",
    "08 Worth",
    "10 Final Assessment",
  ]);
  expect(checked("01 Customer")).toBeChecked();
  expect(checked("02 Market")).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Include empty questions" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Include examples" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: /Include reference/ })).toBeChecked();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("without a scope every section is chosen", async () => {
  api();
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  await screen.findByRole("heading", { level: 1, name: "Export for AI" });
  for (const name of ["01 Customer", "02 Market", "04 Patterns", "08 Worth", "10 Final"]) {
    expect(checked(name)).toBeChecked();
  }
  expect(screen.getByRole("checkbox", { name: "All sections" })).toBeChecked();
});

test("clearing the last section disables Next and says why", async () => {
  api();
  await renderApp(exportPath(`source=validation&id=${VALIDATION}&scope=01`));
  await userEvent.click(await screen.findByRole("checkbox", { name: /01 Customer/ }));
  expect(screen.getByText("Choose at least one section")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox", { name: "All sections" }));
  expect(screen.queryByText("Choose at least one section")).toBeNull();
  expect(checked("10 Final")).toBeChecked();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
});

test("a plan has shortcuts for the whole plan and for each part", async () => {
  api({}, { context: planContext() });
  await renderApp(
    exportPath("source=business_plan&id=cccccccc-cccc-4ccc-8ccc-cccccccccccc&scope=part:a"),
  );
  await screen.findByRole("heading", { level: 1, name: "Export for AI" });
  expect(screen.getByText("Plan: Plan A")).toBeInTheDocument();
  // Item 11 is a table: it is not offered.
  expect(screen.queryByRole("checkbox", { name: /11 Revenue Table/ })).toBeNull();
  expect(checked("01 Business Overview")).toBeChecked();
  expect(checked("02 Customer")).toBeChecked();
  expect(checked("24 Conditions")).not.toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Part A" })).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Whole plan" })).toBePartiallyChecked();
  await userEvent.click(screen.getByRole("checkbox", { name: "Part B" }));
  expect(checked("24 Conditions")).toBeChecked();
  expect(screen.getByRole("checkbox", { name: "Whole plan" })).toBeChecked();
});

test("a self analysis has no reference option", async () => {
  api({}, { context: selfAnalysisContext() });
  await renderApp(exportPath("source=self_analysis&scope=INCOME"));
  await screen.findByRole("heading", { level: 1, name: "Export for AI" });
  expect(screen.getByText("Self analysis")).toBeInTheDocument();
  expect(checked("INCOME")).toBeChecked();
  expect(checked("WHY")).not.toBeChecked();
  expect(screen.queryByRole("checkbox", { name: /Include reference/ })).toBeNull();
});

test("a Viewer cannot open the screen and nothing is requested for the export", async () => {
  const { calls } = api(
    { [EXPORT_URL]: () => ({ body: exportedFor(validationContext(), ["V.01.WHO"]) }) },
    { me: viewerMe() },
  );
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  expect(calls.some((c) => c.url.pathname.includes("/ai/"))).toBe(false);
});

test("a validation without its id is not found", async () => {
  api();
  await renderApp(exportPath("source=validation"));
  expect(await screen.findByRole("heading", { name: /not found/i })).toBeInTheDocument();
});
