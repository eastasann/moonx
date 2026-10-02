import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { WORKSPACE } from "./support";
import {
  HOME_PATH,
  IDEA_PATH,
  makeDetail,
  makeFullHome,
  makeNewHome,
  openHome,
  VALIDATION,
} from "./support-validation-home";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("the AI menu links to export and import for this validation", async () => {
  const { user } = await openHome(makeFullHome());
  await user.click(screen.getByRole("button", { name: "AI" }));
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

test("Archive posts and the idea reads as archived afterwards", async () => {
  let archived = false;
  const { api, user } = await openHome(makeFullHome(), {
    [`GET ${HOME_PATH}`]: () => ({
      body: makeFullHome({ idea: makeDetail({ archived }), canAddPlan: false }),
    }),
    [`POST ${IDEA_PATH}/archive`]: () => {
      archived = true;
      return { body: makeDetail({ archived: true }) };
    },
  });
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Archive" }));
  expect(await screen.findByText("This idea is archived")).toBeInTheDocument();
  expect(api.calls.some((c) => c.url.pathname === `${IDEA_PATH}/archive`)).toBe(true);
});

test("an archived idea is read-only: a banner with Restore, no edit, decision, AI or Add plan", async () => {
  let restored = false;
  const archivedHome = makeFullHome({ idea: makeDetail({ archived: true }), canAddPlan: false });
  const { api, user } = await openHome(archivedHome, {
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
  await user.click(screen.getByRole("button", { name: "More actions" }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).getByRole("menuitem", { name: "Duplicate" })).toBeInTheDocument();
  expect(within(menu).queryByRole("menuitem", { name: "Archive" })).toBeNull();
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("button", { name: "Restore" }));
  await waitFor(() => expect(screen.queryByText("This idea is archived")).toBeNull());
  expect(api.calls.some((c) => c.url.pathname === `${IDEA_PATH}/restore`)).toBe(true);
});

test("Duplicate opens the copy's home", async () => {
  const copy = "55555555-5555-4555-8555-555555555555";
  const copyDetail = makeDetail({ id: copy, name: "Piaya Gift Box Delivery (copy)" });
  const { api, router, user } = await openHome(makeFullHome(), {
    [`POST ${IDEA_PATH}/duplicate`]: () => ({ status: 201, body: copyDetail }),
    [`GET /api/v1/ideas/${copy}/validation`]: () => ({ body: makeNewHome({ idea: copyDetail }) }),
  });
  await user.click(screen.getByRole("button", { name: "More actions" }));
  await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas/${copy}`));
  expect(
    api.calls.some((c) => c.method === "POST" && c.url.pathname === `${IDEA_PATH}/duplicate`),
  ).toBe(true);
});
