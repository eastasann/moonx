import { fireEvent, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { openEditSheet, patchesOf, stubEditApi } from "./support-validation-home";

// One test per file: after a dialog test the next one in the same jsdom never returns, and a file
// gets a fresh jsdom. Presses inside the sheet use fireEvent (see openEditSheet).
afterEach(() => {
  vi.unstubAllGlobals();
});

test("an empty name is refused before anything is sent", async () => {
  const api = stubEditApi({});
  const dialog = await openEditSheet();
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Name/ }), {
    target: { value: "" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(await within(dialog).findByText("Required")).toBeInTheDocument();
  expect(patchesOf(api)).toHaveLength(0);
});
