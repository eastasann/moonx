import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp } from "./support";
import {
  api,
  exportPath,
  importPath,
  registerAiHooks,
  target,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

const archived = () => validationContext({ target: target({ archived: true }) });

test("the export of an archived idea says so instead of offering the steps", async () => {
  api({}, { context: archived });
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(screen.getByText("You can read it, but not change it.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
});

test("the import of an archived idea says so instead of taking a paste", async () => {
  api({}, { context: archived });
  await renderApp(importPath(`target=validation&id=${VALIDATION}`));
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "AI reply" })).not.toBeInTheDocument();
});
