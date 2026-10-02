import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import {
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

test("saving the summary sends the fields with the version that was opened, then closes", async () => {
  const api = stubEditApi({
    [`PATCH ${IDEA_PATH}`]: () => ({ body: makeDetail({ name: "Piaya Boxes", lockVersion: 4 }) }),
  });
  const dialog = await openEditSheet();
  expect(within(dialog).getByRole("textbox", { name: /^Name/ })).toHaveValue(
    "Piaya Gift Box Delivery",
  );
  expect(within(dialog).getByRole("textbox", { name: "Proposed solution" })).toHaveValue(
    "Same-day boxes",
  );
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Name/ }), {
    target: { value: "  Piaya Boxes " },
  });
  fireEvent.change(within(dialog).getByRole("textbox", { name: "Proposed solution" }), {
    target: { value: "" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(patchesOf(api)).toHaveLength(1);
  expect(patchesOf(api)[0]?.body).toEqual({
    name: "Piaya Boxes",
    oneLineConcept: "Corporate gift boxes of Bacolod piaya, delivered same day",
    proposedSolution: null,
    lockVersion: 3,
  });
});
