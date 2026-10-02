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

test("a 409 shows their version, and Overwrite with mine sends force with their version number", async () => {
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
  expect(await within(dialog).findByText(/Paolo Reyes updated this summary/)).toBeInTheDocument();
  const theirs = within(dialog).getByRole("group", { name: "Their version" });
  expect(within(theirs).getByText("Piaya Boxes")).toBeInTheDocument();
  expect(within(theirs).getByText("Their concept")).toBeInTheDocument();
  // The person's own text stays in the form to copy.
  expect(within(dialog).getByRole("textbox", { name: /^Name/ })).toHaveValue("My name");
  fireEvent.click(within(dialog).getByRole("button", { name: "Overwrite with mine" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(patchesOf(api)).toHaveLength(2);
  expect(patchesOf(api)[1]?.body).toMatchObject({ name: "My name", lockVersion: 4, force: true });
});
