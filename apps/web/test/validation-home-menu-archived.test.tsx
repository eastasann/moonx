import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  HOME_PATH,
  IDEA_PATH,
  makeDetail,
  makeFullHome,
  openHomeAlone,
} from "./support-validation-home";

// One menu test per file: a second overlay test in the same jsdom never returns, and a file gets
// a fresh jsdom.
afterEach(() => {
  vi.unstubAllGlobals();
});

test("an archived idea is read-only: a banner with Restore, no edit, decision, AI or Add plan", async () => {
  let restored = false;
  const archivedHome = makeFullHome({ idea: makeDetail({ archived: true }), canAddPlan: false });
  const { api } = await openHomeAlone(archivedHome, {
    [`GET ${HOME_PATH}`]: () => ({ body: restored ? makeFullHome() : archivedHome }),
    [`POST ${IDEA_PATH}/restore`]: () => {
      restored = true;
      return { body: makeDetail() };
    },
  });
  expect(screen.getByText("This idea is archived")).toBeInTheDocument();
  for (const name of ["Edit summary", "AI", "Record decision", "Add plan"]) {
    expect(screen.queryByRole("button", { name })).toBeNull();
  }
  // Duplicate stays available on an archived idea (design-spec 6.8); Archive does not.
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
  expect(within(menu).queryByRole("menuitem", { name: "Archive" })).toBeNull();
  await userEvent.keyboard("{Escape}");
  await userEvent.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.queryByText("This idea is archived")).toBeNull());
  expect(api.calls.some((c) => c.url.pathname === `${IDEA_PATH}/restore`)).toBe(true);
});
