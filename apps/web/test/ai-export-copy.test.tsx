import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { renderApp, WORKSPACE } from "./support";
import {
  api,
  EXPORT_URL,
  exportedFor,
  exportPath,
  registerAiHooks,
  VALIDATION,
  validationContext,
} from "./support-ai";

registerAiHooks();

const built = () => exportedFor(validationContext(), ["V.01.WHO", "V.01.PROBLEM"]);

async function openExport(search = `source=validation&id=${VALIDATION}&scope=01`) {
  const stub = api({ [EXPORT_URL]: () => ({ body: built() }) });
  await renderApp(exportPath(search));
  await userEvent.click(await screen.findByRole("button", { name: "Next" }));
  await screen.findByRole("group", { name: "Preview of the export" });
  await userEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("button", { name: "Copy Markdown" });
  return stub;
}

function stubClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

test("Copy Markdown and Copy JSON put the text on the clipboard", async () => {
  await openExport();
  const writeText = vi.fn(async () => {});
  stubClipboard(writeText);
  await userEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
  expect(await screen.findByText("Copied")).toBeInTheDocument();
  expect(writeText).toHaveBeenLastCalledWith(built().markdown);
  await userEvent.click(screen.getByRole("button", { name: "Copy JSON" }));
  expect(writeText).toHaveBeenLastCalledWith(JSON.stringify(built().json, null, 2));
});

test("a refused clipboard points to Download", async () => {
  await openExport();
  stubClipboard(async () => {
    throw new DOMException("denied", "NotAllowedError");
  });
  await userEvent.click(screen.getByRole("button", { name: "Copy Markdown" }));
  expect(await screen.findByText("Couldn't copy. Use Download instead.")).toBeInTheDocument();
  expect(screen.queryByText("Copied")).toBeNull();
});

test("Download saves .md and .json files named after the export", async () => {
  await openExport();
  const blobs: Blob[] = [];
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    return "blob:export";
  });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  await userEvent.click(screen.getByRole("button", { name: "Download .md" }));
  await userEvent.click(screen.getByRole("button", { name: "Download .json" }));
  const base = "moonx-export-validation-piaya-gift-box-delivery-2026-10-01";
  expect(names).toEqual([`${base}.md`, `${base}.json`]);
  expect(blobs[0]?.type).toContain("text/markdown");
  expect(blobs[1]?.type).toContain("application/json");
  await waitFor(() => expect(blobs[0]?.size).toBe(new Blob([built().markdown]).size));
});

test("the link to Import from AI carries the exported scope", async () => {
  await openExport();
  expect(screen.getByRole("link", { name: "Import from AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/import?target=validation&id=${VALIDATION}&scope=01`,
  );
});

test("exporting writes nothing", async () => {
  const { calls } = await openExport();
  expect(calls.filter((c) => c.method !== "GET")).toEqual([]);
});
