import { screen, within } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, renderApp, stubApi, WORKSPACE } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("?modal=new-idea opens M1 over the screen it was opened from", async () => {
  stubApi({
    "GET /api/v1/me": () => ({ body: makeMe() }),
    "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
    "GET /api/v1/workspaces/11111111-1111-4111-8111-111111111111/ideas": () => ({
      body: { items: [], nextCursor: null, hiddenDroppedCount: 0 },
    }),
    "GET /api/v1/workspaces/11111111-1111-4111-8111-111111111111/members": () => ({
      body: { items: [] },
    }),
  });
  const { router } = await renderApp(`/w/${WORKSPACE}/ideas?modal=new-idea`);
  const dialog = await screen.findByRole("dialog", { name: "New idea" });
  expect(within(dialog).getByRole("textbox", { name: /^Name/ })).toBeInTheDocument();
  expect(within(dialog).getByRole("button", { name: "Create idea" })).toBeDisabled();
  expect(router.state.location.pathname).toBe(`/w/${WORKSPACE}/ideas`);
});
