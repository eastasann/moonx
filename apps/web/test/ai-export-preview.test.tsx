import { screen, waitFor, within } from "@testing-library/react";
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
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

const built = () => exportedFor(validationContext(), ["V.01.WHO", "V.01.PROBLEM"]);
const exportCalls = (calls: { url: URL }[]) =>
  calls.filter((c) => c.url.pathname === "/api/v1/ai/export");

async function openReview(search: string) {
  await renderApp(exportPath(search));
  await userEvent.click(await screen.findByRole("button", { name: "Next" }));
}

test("Next builds the export of the chosen scope and shows it as Markdown", async () => {
  const { calls } = api({ [EXPORT_URL]: () => ({ body: built() }) });
  await openReview(`source=validation&id=${VALIDATION}&scope=01`);
  const preview = await screen.findByRole("group", { name: "Preview of the export" });
  expect(preview).toHaveTextContent("## [V.01.WHO] WHO");
  expect(preview).toHaveTextContent("> HR teams of BPO companies in Bacolod");
  expect(screen.getByText("2 questions")).toBeInTheDocument();
  expect(Object.fromEntries(exportCalls(calls)[0]?.url.searchParams ?? [])).toEqual({
    source: "validation",
    id: VALIDATION,
    sections: "01",
    includeEmpty: "true",
    includeExamples: "true",
    includeReference: "true",
  });
});

test("the preview switches to JSON", async () => {
  api({ [EXPORT_URL]: () => ({ body: built() }) });
  await openReview(`source=validation&id=${VALIDATION}&scope=01`);
  const preview = await screen.findByRole("group", { name: "Preview of the export" });
  await userEvent.click(screen.getByRole("radio", { name: "JSON" }));
  expect(preview).toHaveTextContent('"format": "moonx-export"');
  expect(preview).toHaveTextContent('"id": "V.01.WHO"');
  await userEvent.click(screen.getByRole("radio", { name: "Markdown" }));
  expect(preview).toHaveTextContent("## [V.01.WHO] WHO");
});

test("the whole of the template leaves the scope out of the request, and the options are sent", async () => {
  const { calls } = api({ [EXPORT_URL]: () => ({ body: built() }) });
  await renderApp(exportPath(`source=validation&id=${VALIDATION}`));
  await userEvent.click(await screen.findByRole("checkbox", { name: "Include empty questions" }));
  await userEvent.click(screen.getByRole("checkbox", { name: "Include examples" }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("group", { name: "Preview of the export" });
  expect(Object.fromEntries(exportCalls(calls)[0]?.url.searchParams ?? [])).toEqual({
    source: "validation",
    id: VALIDATION,
    includeEmpty: "false",
    includeExamples: "false",
    includeReference: "true",
  });
});

test("a part of a plan is sent as part, other items as items", async () => {
  const planId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const { calls } = api({ [EXPORT_URL]: () => ({ body: built() }) }, { context: planContext() });
  await renderApp(exportPath(`source=business_plan&id=${planId}&scope=part:a`));
  await userEvent.click(await screen.findByRole("button", { name: "Next" }));
  await screen.findByRole("group", { name: "Preview of the export" });
  expect(exportCalls(calls)[0]?.url.searchParams.get("part")).toBe("a");
  expect(exportCalls(calls)[0]?.url.searchParams.has("items")).toBe(false);

  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  await userEvent.click(screen.getByRole("checkbox", { name: /02 Customer/ }));
  await userEvent.click(screen.getByRole("checkbox", { name: /24 Conditions/ }));
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await waitFor(() => expect(exportCalls(calls)).toHaveLength(2));
  expect(exportCalls(calls)[1]?.url.searchParams.get("items")).toBe("01,24");
});

test("while the export is built the page shows a skeleton", async () => {
  const { fetchStub } = api({ [EXPORT_URL]: () => ({ body: built() }) });
  const original = fetchStub.getMockImplementation() as typeof fetch;
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fetchStub.mockImplementation(async (input, init) => {
    if (String(input).includes("/ai/export")) await gate;
    return original(input, init);
  });
  await openReview(`source=validation&id=${VALIDATION}&scope=01`);
  expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  expect(screen.queryByRole("group", { name: "Preview of the export" })).toBeNull();
  release();
  expect(await screen.findByRole("group", { name: "Preview of the export" })).toBeInTheDocument();
});

test("an export with no answers can still be made and says so", async () => {
  api({
    [EXPORT_URL]: () => ({
      body: exportedFor(validationContext(), [
        "V.01.BEHAVIOR".replace("BEHAVIOR", "NOPE"),
        "V.02.CATEGORY",
      ]),
    }),
  });
  await openReview(`source=validation&id=${VALIDATION}&scope=02`);
  expect(await screen.findByText("All questions are empty")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();
  expect(
    within(screen.getByRole("group", { name: "Preview of the export" })).getByText(
      /V\.02\.CATEGORY/,
    ),
  ).toBeInTheDocument();
});

test("a scope with no questions at all is refused by the server and the person goes back", async () => {
  api({
    [EXPORT_URL]: () => ({
      status: 422,
      body: { error: { code: "EMPTY_SCOPE", message: "empty", requestId: "r" } },
    }),
  });
  await openReview(`source=validation&id=${VALIDATION}&scope=01`);
  expect(await screen.findByText("Nothing to export")).toBeInTheDocument();
  expect(screen.getByText("Choose at least one section to export.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByRole("group", { name: "Sections to export" })).toBeInTheDocument();
});
