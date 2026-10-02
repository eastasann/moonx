import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { renderApp, WORKSPACE } from "./support";
import {
  api,
  exportPath,
  IDEA,
  importPath,
  registerAiHooks,
  target,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

/** The Back of the screen itself, not one of the app frame's. */
const backLink = async () => {
  await screen.findByRole("heading", { level: 1, name: /AI/ });
  return screen.getAllByRole("link", { name: /Back/ }).find((link) => link.closest("main"));
};

const OTHER_WORKSPACE = "99999999-9999-4999-8999-999999999999";
const elsewhere = () => validationContext({ target: target({ workspaceId: OTHER_WORKSPACE }) });

test("the export of a validation from another workspace is refused", async () => {
  api({}, { context: elsewhere });
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
});

test("the import of a validation from another workspace is refused", async () => {
  api({}, { context: elsewhere });
  await renderApp(importPath(`target=validation&id=${VALIDATION}`));
  expect(await screen.findByText("You don't have access to this")).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: "AI reply" })).not.toBeInTheDocument();
});

test("both screens lead back to the validation they work on", async () => {
  api();
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  const back = await backLink();
  expect(back).toHaveAttribute("href", `/w/${WORKSPACE}/ideas/${IDEA}`);
});

test("Back on the import goes to returnTo when the link carried one", async () => {
  api();
  const returnTo = `/w/${WORKSPACE}/ideas/${IDEA}/questions/01`;
  await renderApp(
    importPath(`target=validation&id=${VALIDATION}&returnTo=${encodeURIComponent(returnTo)}`),
  );
  const back = await backLink();
  expect(back).toHaveAttribute("href", returnTo);
});
