import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { makeMe, PERSONAL, renderApp, stubApi, WORKSPACE } from "./support";

afterEach(() => {
  vi.unstubAllGlobals();
});

const signedIn = (me = makeMe()) => ({
  "GET /api/v1/me": () => ({ body: me }),
  "GET /api/v1/notifications/unread-count": () => ({ body: { total: 0 } }),
});

test("?modal=switch-workspace opens the switcher and picking a workspace goes there", async () => {
  stubApi(signedIn());
  const { router } = await renderApp(`/w/${WORKSPACE}?modal=switch-workspace`);
  const dialog = await screen.findByRole("dialog", { name: "Switch workspace" });
  expect(within(dialog).getByText("BCDX")).toBeInTheDocument();
  expect(within(dialog).getByText("Current")).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole("row", { name: /Ana's workspace/ }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${PERSONAL}`));
  expect(router.state.location.search).toEqual({});
});

test("creating a workspace posts the form and opens it", async () => {
  const created = "55555555-5555-4555-8555-555555555555";
  const api = stubApi({
    ...signedIn(),
    "POST /api/v1/workspaces": () => ({
      status: 201,
      body: {
        id: created,
        name: "Cebu Bakery",
        currency: "PHP",
        isPersonal: false,
        myRole: "owner",
        memberCount: 1,
      },
    }),
  });
  const { router } = await renderApp(`/w/${WORKSPACE}?modal=switch-workspace`);
  const dialog = await screen.findByRole("dialog", { name: "Switch workspace" });
  await userEvent.click(within(dialog).getByRole("button", { name: "New workspace" }));
  const form = await screen.findByRole("dialog", { name: "New workspace" });
  await userEvent.click(within(form).getByRole("button", { name: "Create workspace" }));
  expect(await within(form).findByText("Required")).toBeInTheDocument();
  await userEvent.type(within(form).getByRole("textbox", { name: /^Name/ }), "Cebu Bakery");
  await userEvent.click(within(form).getByRole("button", { name: "Create workspace" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${created}`));
  expect(
    api.calls.find((c) => c.method === "POST" && c.url.pathname === "/api/v1/workspaces")?.body,
  ).toEqual({
    name: "Cebu Bakery",
    currency: "PHP",
  });
});
