import { fireEvent, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { conflictAnswer, IDEA_PATH, openEditSheet, stubEditApi } from "./support-validation-home";

// One test per file: see validation-home-edit-load.test.tsx.
afterEach(() => {
  vi.unstubAllGlobals();
});

test("Copy my input puts the person's own text on the clipboard before Load theirs drops it", async () => {
  stubEditApi({ [`PATCH ${IDEA_PATH}`]: () => conflictAnswer() });
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
  const dialog = await openEditSheet();
  fireEvent.change(within(dialog).getByRole("textbox", { name: /^Name/ }), {
    target: { value: "My name" },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
  await within(dialog).findByText(/Paolo Reyes updated this summary/);
  fireEvent.click(within(dialog).getByRole("button", { name: "Copy my input" }));
  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText.mock.calls[0]?.[0]).toContain("Name: My name");
  expect(writeText.mock.calls[0]?.[0]).toContain("One-line concept: ");
  expect(writeText.mock.calls[0]?.[0]).toContain("Proposed solution: ");
});
