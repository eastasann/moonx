import { screen } from "@testing-library/react";
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

test("Archive posts and the idea reads as archived afterwards", async () => {
  let archived = false;
  const { api } = await openHomeAlone(makeFullHome(), {
    [`GET ${HOME_PATH}`]: () => ({
      body: makeFullHome({ idea: makeDetail({ archived }), canAddPlan: false }),
    }),
    [`POST ${IDEA_PATH}/archive`]: () => {
      archived = true;
      return { body: makeDetail({ archived: true }) };
    },
  });
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Archive" }));
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname === `${IDEA_PATH}/archive`)).toBe(true);
});
