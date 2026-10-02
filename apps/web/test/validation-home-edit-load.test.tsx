import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
  conflictAnswer,
  IDEA_PATH,
  makeDetail,
  openEditSheet,
  patchesOf,
  stubEditApi,
} from "./support-validation-home";

// One test per file: after a dialog test the next one in the same jsdom never returns, and a file
// gets a fresh jsdom. Presses inside the sheet use fireEvent (see openEditSheet).
afterEach(() => {
  vi.unstubAllGlobals();
});

test("Load theirs replaces the form with their version and the next save uses its version", async () => {
  let attempts = 0;
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => {
      attempts += 1;
      return attempts === 1 ? conflictAnswer() : { body: makeDetail({ lockVersion: 5 }) };
    },
  });
  const dialog = await openEditSheet();
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Name/ }), {
    target: { value: "My name" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByText(/Paolo Reyes updated this summary/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Load theirs" }));
  await waitFor(() =>
    expect(within(dialog).getByRole("textbox", { name: /^Name/ })).toHaveValue("Piaya Boxes"),
  );
  expect(within(dialog).queryByText(/Paolo Reyes updated this summary/)).toBeNull();
  expect(within(dialog).getByRole("textbox", { name: "Proposed solution" })).toHaveValue("");
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(patchesOf(api)[1]?.body).toMatchObject({ name: "Piaya Boxes", lockVersion: 4 });
  expect(patchesOf(api)[1]?.body).not.toHaveProperty("force");
});
