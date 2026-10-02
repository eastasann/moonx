import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { WORKSPACE } from "./support";
import { makeFullHome, openHomeAlone, VALIDATION } from "./support-validation-home";

// One menu test per file: a second overlay test in the same jsdom never returns, and a file gets
// a fresh jsdom.
afterEach(() => {
  vi.unstubAllGlobals();
});

test("the AI menu links to export and import for this validation", async () => {
  await openHomeAlone(makeFullHome());
  await userEvent.click(screen.getByRole("button", { name: "AI" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Export for AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/export?source=validation&id=${VALIDATION}`,
  );
  expect(within(menu).getByRole("menuitem", { name: "Import from AI" })).toHaveAttribute(
    "href",
    `/w/${WORKSPACE}/ai/import?target=validation&id=${VALIDATION}`,
  );
});
