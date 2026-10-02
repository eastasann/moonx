import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { WORKSPACE } from "./support";
import {
  IDEA_PATH,
  makeDetail,
  makeFullHome,
  makeNewHome,
  openHomeAlone,
} from "./support-validation-home";

// One menu test per file: a second overlay test in the same jsdom never returns, and a file gets
// a fresh jsdom.
afterEach(() => {
  vi.unstubAllGlobals();
});

test("Duplicate opens the copy's home", async () => {
  const copy = "55555555-5555-4555-8555-555555555555";
  const copyDetail = makeDetail({ id: copy, name: "Piaya Gift Box Delivery (copy)" });
  const { api, router } = await openHomeAlone(makeFullHome(), {
    [`POST ${IDEA_PATH}/duplicate`]: () => ({ status: 201, body: copyDetail }),
    [`GET /api/v1/ideas/${copy}/validation`]: () => ({ body: makeNewHome({ idea: copyDetail }) }),
  });
  await userEvent.click(screen.getByRole("button", { name: "More actions" }));
  await userEvent.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${copy}`));
  expect(
    api.calls.some((c) => c.method === "POST" && c.url.pathname === `${IDEA_PATH}/duplicate`),
  ).toBe(true);
});
