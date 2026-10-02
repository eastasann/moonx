import { fireEvent, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { IDEA_PATH, openEditSheet, stubEditApi } from "./support-validation-home";

// One test per file: after a dialog test the next one in the same jsdom never returns, and a file
// gets a fresh jsdom. Presses inside the sheet use fireEvent (see openEditSheet).
afterEach(() => {
  vi.unstubAllGlobals();
});

test("an archived refusal is shown in the sheet with its own text", async () => {
  stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({
      status: 409,
      body: { error: { code: "ARCHIVED", message: "archived", requestId: "r" } },
    }),
  });
  const dialog = await openEditSheet();
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  expect(
    await within(dialog).findByText("This is archived. Restore it to make changes."),
  ).toBeInTheDocument();
});
