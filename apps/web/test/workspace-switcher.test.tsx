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
  expect(within(form).getByRole("button", { name: "Create workspace" })).toBeDisabled();
  await userEvent.type(within(form).getByRole("textbox", { name: /^Name/ }), "   ");
  expect(within(form).getByRole("button", { name: "Create workspace" })).toBeDisabled();
  await userEvent.type(within(form).getByRole("textbox", { name: /^Name/ }), "Cebu Bakery");
  expect(within(form).getByRole("button", { name: "Create workspace" })).toBeEnabled();
  await userEvent.click(within(form).getByRole("button", { name: "Create workspace" }));
  await waitFor(() => expect(router.state.location.pathname).toBe(`/w/${created}`));
  expect(
    api.calls.find((c) => c.method === "POST" && c.url.pathname === "/api/v1/workspaces")?.body,
  ).toEqual({
    name: "Cebu Bakery",
    currency: "PHP",
  });
});

test("a failed create keeps the name and says Couldn't save — Retry, and Create sends it again", async () => {
  let attempts = 0;
  const api = stubApi({
    ...signedIn(),
    "POST /api/v1/workspaces": () => {
      attempts += 1;
      return attempts === 1
        ? {
            status: 503,
            body: { error: { code: "UPSTREAM_UNAVAILABLE", message: "x", requestId: "abcdef12" } },
          }
        : {
            status: 201,
            body: {
              id: "55555555-5555-4555-8555-555555555555",
              name: "Cebu Bakery",
              currency: "PHP",
              isPersonal: false,
              myRole: "owner",
              memberCount: 1,
            },
          };
    },
  });
  const { router } = await renderApp(`/w/${WORKSPACE}?modal=switch-workspace`);
  const dialog = await screen.findByRole("dialog", { name: "Switch workspace" });
  await userEvent.click(within(dialog).getByRole("button", { name: "New workspace" }));
  const form = await screen.findByRole("dialog", { name: "New workspace" });
  const name = within(form).getByRole("textbox", { name: /^Name/ });
  await userEvent.type(name, "Cebu Bakery");
  await userEvent.click(within(form).getByRole("button", { name: "Create workspace" }));
  expect(await within(form).findByText("Couldn't save — Retry")).toBeInTheDocument();
  expect(name).toHaveValue("Cebu Bakery");
  await userEvent.click(within(form).getByRole("button", { name: "Create workspace" }));
  await waitFor(() => expect(router.state.location.pathname).toContain("/w/5555"));
  expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(2);
});
